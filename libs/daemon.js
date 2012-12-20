/*@fileOverview library that makes daemonizing easy
 *parse processes argv, and do apropriate things
 *(detach from console, daemonize, on error, signal, exception -- restart, 
 *(or run in attached to tty mode. don't daemonize, on signal or error or exception -- die
 * understands next command line options
 * -d -- makes process detach from tty and daemonize
 * -D -- 'internal option', signals to process, that it is 
 * running in daemonized mode, and creation of new session is not required
 * option is used only when daemonizing, and is passed to daemonized childs
 * to signal them, that they are running in daemon mode
 * pidfile=/path/to/pidfile path to file, where to write pidfile 
 * Daemon and Console libraries are dependant between themselves 
 * Daemon defines mode of logging to Console (log into file or to tty) 
 * but also Daemon uses Console to log restarts, uncaught exceptions, and other events
 * to solve this cyclic dependency Console library loads Daemon library in a little bit strange, asyncronous way
 * */
var childProcess = require('child_process');
var Lib = require('ventum');
var Fs = require('fs');
var Console = Lib('console');
var Helpers = Lib('helpers');
var Path = require('path');
var Crypto = require('crypto');
/* @constructor 
 * class that handles all thing related with start, stop and errors
 * */
var Daemon = function () {
  //don't event try to call Console in constructor of Daemon class
  //or you'll have a lot of strange errors related with cyclic dependencies 
  //between Console and Daemon libraries
  //if you really need to do this -- execute call in process.nextTick
  //or in any other asyncronous way
  this.nodeJs = process.argv[0];
  this.script = process.argv[1];
  this.argv = Helpers.parseArgv();
  this._getPidFilePath();
  this._daemonize = this.argv['-d'] !== undefined;
  this.daemonized = this.argv['-D'] !== undefined;
  this.shuttingDown = false;
  this._setIdent();
  this._registerHandlers();
  this._createPidFile();
};
Daemon.prototype = {
  /* try to find path, where to store pid file of daemin
   * if success -- store it in this.argv.pidfile
   * @private
   * path was not found
   * */
  _getPidFilePath: function () {
    var pidFile = this.argv.pidfile;
    if (pidFile !== true && pidFile !== undefined) {
      this.argv.pidfile = Path.resolve(process.cwd(), pidFile);
    }
  },
  /* generate unique identifier for current daemon instance
   * it will be used to mark all daemon's children, to make possible 
   * to identify and differentiate instances of daemon 
   * @private
   * @return {String} md5 hash from lot of things
   * * */
  _generateIdent: function () {
    var hasher = Crypto.createHash('md5');
    hasher.update(Math.random() + Date.now() + JSON.stringify(this.argv));
    return hasher.digest('hex');
  },
  /* set ident into argv, if it is missing 
   * @private
   * @return  {undefined}
   * */
  _setIdent: function () {
    if (!this.argv.ident) {
      this.argv.ident = this._generateIdent();
      process.title = this.nodeJs + ' ' + this.script + " " + Helpers.makeArgv(this.argv).join(' ');
    }
  },
  /* register handlers on different events related to daemon's runtime 
   * (signals, exceptions)
   * @private
   * @return {undefined}
   */
  _registerHandlers: function () {
    process.on('uncaughtException', this._exceptionHandler.bind(this));
    process.on('exit', this._exitHandler.bind(this));
    //it's a little bit sensless to catch sigint and sigkill
    //anyway sigkill is not blockable
    //normally sigint is ctrl+c, means we are running on console
    //and therefore, we don't use pidfiles at all
    process.on('SIGINT',  this._signalHandler.bind(this));
    process.on('SIGKILL', this._signalHandler.bind(this));
    process.on('SIGTERM', this._signalHandler.bind(this));
  },
  /* SIGINT, SIGKILL, SIGTERM handler
   * exit from program (this implies execution of on exit handler, which do everythig required)
   * @private
   * @return {undefined}
   */
  _signalHandler: function () {
    //this implicitly call _exitHandler
    //_exitHandler cleans pidfile (if any)
    process.exit();
  },
  /* processes exit event handler
   * clean pid file (if any) before exit
   * @private
   * @return {undefined}
   * */
  _exitHandler: function () {
    if (this.pidFile && this.daemonized) {
      try {
        Fs.unlinkSync(this.pidFile);
      } catch (e) {
      }
    }
  },
  /* create pid file, and write processes pid into it
   * (if path to pid file was found)
   * and if process is running in daemon mode
   * all filesystem operations are syncronous, 
   * it's thought that this function will be called only once
   * at program start
   * @private
   * @return {undefined}
   * */
  _createPidFile: function () {
    var pidFile = this._getPidFilePath(),
      fd;
    if (this.daemonized && pidFile) {
      try {
        fd = Fs.openSync(pidFile, 'w');
        Fs.writeSync(fd, String(process.pid));
      } catch (e) {
        return;
      }
      this.pidFile = pidFile;
    }
  },
  /* uncaught exception handler. if running in daemon mode -- restart
   * if in attached to tty mode -- just exit 
   * @private
   * @return undefined
   * */
  _exceptionHandler: function (exception) {
    this.shuttingDown = true;
    Console.error(exception);
    //if running in daemon mode  -- restart
    //else just die
    if (this._daemonize || this.daemonized) {
      this.restart();
    } else {
      process.exit();
    }
  },
  /* kill other processes with same ident 
   * (that has to be hanged workers of current daemon)
   * @private
   * @param {function({Error|null})} callback. function to call when work is done
   * function's argument represents error
   * @return {undefined}
   * */
  _killOtherDaemonInstances: function (depth, callback) {
    if (depth instanceof Function) {
      callback = depth;
      depth = 0;
    }
    childProcess.exec('ps -ae -opid,command', function (error, stdout, stderr) {
      var countToKill = 0,
        sleepTimeout = 400 + Math.round(Math.random() * 100);
      if (error !== null || stderr.length) {
        return callback(new Error(stderr.toString() || "can't get process list"));
      } 
      stdout.toString().split('\n').forEach(function (processLine) {
        var matches = processLine.match(/^(\d+)\s+/i),
          pid = matches && matches[1],
          ident;
        matches = processLine.match(/ident=([a-f0-9]{32})/);
        ident = matches && matches[1];
	Console.log('pid&ident', pid, ident);
        if (pid !== null && ident !== null && Number(pid) !== process.pid && ident === this.argv.ident) {
          //BIG WARNING if SIGNAL is sent, it does not mean, 
          //that signal was recieved and processed. 
          //so it's no guarantee, that process is dead just after kill
          //and because of this it's required to check if someone left
          //and kill them once more
          process.kill(pid, 'SIGTERM');
          countToKill++;
        }
      }.bind(this));
      if (countToKill !== 0 ) {
        //if there were processes, required to kill, check them for existance
        if (depth > 10) {
          Console.error("can not kill all other instances of daemon. Give up");
          process.exit();
        }
        return setTimeout(this._killOtherDaemonInstances.bind(this, depth++, callback), sleepTimeout);
      }
      callback();
    }.bind(this)); 
  },
  /* fork process. with apropriate command line options 
   * if this fork is "daemonizing" fork, detach from tty
   * starting own session 
   * @private
   * @return {undefined}
   * */
  _fork: function () {
    var newArgv;
    if (!this.daemonized) {
      this.argv['-D'] = true;
    }
    newArgv = Helpers.makeArgv(this.argv);
    newArgv.unshift(this.script);
    childProcess.spawn(this.nodeJs, newArgv, {setsid: this._daemonize && !this.daemonized});
  },
  /* daemonize, if processes command line tells to do so
   * if no -- do nothing, continue running in attached to tty mode
   * @public
   * @return {undefined}
   * */
  daemonize: function (callback) {
    this._killOtherDaemonInstances(function () {
      if (this._daemonize && !this.daemonized) {
        this.restart();
      }
      if (callback instanceof Function) {
        return callback();
      }
    }.bind(this));
  },
  /* restart process. fork (set new session, and command line options according to current command line options)
   * and exit from current process
   * @public
   * @return {undefined}
   * */
  restart: function () {
    this._fork();
    process.exit();
  }
};

module.exports.instance = function (Lib) {
  return Daemon;
};
