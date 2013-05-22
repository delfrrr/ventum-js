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
var Os = require('os');
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
  this.setIdent();
  this._registerHandlers();
  this._createPidFile();
  //do not rely too much on Os.hostname();
  //it can be changed, an can break the algorithm,
  //that is used to generate ident's.
  //so use it only as backup
  this.HOST = this.HOST || Os.hostname();
};
Daemon.prototype = {
  /* number of tries when killing other instances of service
   * for details read description of _killOtherDaemonInstances function
   * */
  MAX_KILL_TRIES: 10,
  CLUSTER: 'developement',
  HOST: 'duster',
  IDENT_LENGTH: 16,
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
  _countIdent: function (data) {
    var hasher = Crypto.createHash('md5');
    hasher.update(data.toString());
    return hasher.digest('hex').slice(0, this.IDENT_LENGTH);
  },
  /* generate ident for service instance using argument,
   * complementing it with defaults
   * @public
   * @param {undefined | String | Object} ident, identifier or data
   * to build identifier,
   * if param is object, next fields are used:
   * cluster -- name of cluster (cluster is group of hosts, with their own services)
   * host -- hostname (it can be name from DNS or any other string)
   * service -- name of service any string, but "serviceFolder/serviceFile" is used as default
   * folder string
   * name string folder and name are used to generate service, if it's missing. and only
   * if service is missing and (folder or name are missing) default for service is used
   * instance some string, that differentiated one instance of service from other
   * running on the same host, in the same cluster
   * @return {String} returns string ident (as for now md5 hash)
   * */
  generateIdent: function (ident) {
    if (!(ident instanceof Object) &&
        !(typeof (ident) === 'string' && ident.match(new RegExp('[0-9a-f]{' + this.IDENT_LENGTH + ',}', 'i')))) {
      ident = {};
    }
    if (typeof(ident) === 'string') {
      ident = ident.slice(0, this.IDENT_LENGTH);
    }
    if (ident instanceof Object) {
      ident.cluster = ident.cluster || this.CLUSTER;
      ident.host = ident.host || this.HOST;
      if (!ident.service) {
        if (ident.folder && ident.name) {
          ident.service = ident.folder + '/' + ident.name;
        } else {
          ident.service = Lib.serviceFolder + '/' + Lib.serviceFile;
        }
      }
      ident.instance = ident.instance !== undefined ? ident.instance : process.argv.slice(2).join(' ');
      //filter out trash from ident object
      ident = this._countIdent(JSON.stringify({
        cluster: ident.cluster,
        host: ident.host,
        service: ident.service,
        instance: ident.instance
      }));
    }
    return ident;
  },
  /* set ident into argv, if it is missing
   * @public
   * @param {undefined | String | Object} forceIdent, identifier or data
   * to build identifier, or nothing (defaults will be used)
   * @return  {undefined}
   * */
  setIdent: function (forceIdent) {
    forceIdent = this.generateIdent(forceIdent);
    if (!this.argv.ident || forceIdent) {
      this.argv.ident = forceIdent;
      process.title = [
        this.nodeJs,
        'ident=' + this.argv.ident,
        this.script,
        Helpers.makeArgv(this.argv).join(' ')
      ].join(' ');
    }
  },
  /* get ident of current service
   * @public
   * @return {String} -- identifier of current service;
   * */
  getIdent: function () {
    return this.argv.ident;
  },
  /* register handlers on different events related to daemon's runtime
   * (signals, exceptions)
   * @private
   * @return {undefined}
   */
  _registerHandlers: function () {
    process.on('uncaughtException', this._exceptionHandler.bind(this));
    process.on('exit', this._exitHandler.bind(this));
    process.on('SIGINT',  this._signalHandler.bind(this));
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
    var pidFile = this.argv.pidfile,
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
  /* get list of pids, of processes that are instances of service
   * identified by ident
   * @public
   * @param {String} ident. identifier of service
   * @param {function ({null|Error}, {Array<Number>|undefined})} callback
   * function to call when work is done. first function's argument represents error
   * second, if everything is ok, is array of process identifiers
   * @return {undefined}
   * */
  getRunningInstances: function (ident, callback) {
    childProcess.exec('ps -ae -opid,command', function (error, stdout, stderr) {
      var instances;
      if (error !== null || stderr.length) {
        return callback(new Error(stderr.toString() || "can't get process list"));
      }
      instances = stdout.toString().split('\n').reduce(function (list, processLine) {
        var matches = processLine.match(/^\s*(\d+)\s+/i),
          pid = matches && matches[1],
          processIdent;
        matches = processLine.match(new RegExp('ident=([a-f0-9]{' + this.IDENT_LENGTH + '})', 'i'));
        processIdent = matches && matches[1];
        if (pid !== null && processIdent !== null && processIdent === ident) {
          list.push(Number(pid));
        }
        return list;
      }.bind(this), []);
      callback(null, instances);
    }.bind(this));

  },
  /* kill services identified by ident (except current process,
   * if it's identifier is ident)
   * killing is done in few iteration, until all processes, chosen
   * to be killed, will be dead, or until MAX_KILL_TRIES iteration will be done
   * If MAX_KILL_TRIES has been reached, and there alive processes, that has to be killed
   * return with error
   * @private
   * @param {String} ident. identifier of service to kill
   * @param {Number | function({Error|null})} depth. number of  kill iteration (if Number)
   * or callback if function. in such situation 0 is used as depth
   * @param {undefined | function ({Error|null})} callback.  if depth is Number, this argument is
   * callback. if depth is callback -- argument is ignored
   * function's argument represents error
   * @return {undefined}
   * */
  _killOtherDaemonInstances: function (ident, depth, callback) {
    if (depth instanceof Function) {
      callback = depth;
      depth = 0;
    }
    this.getRunningInstances(ident, function (error, instances) {
      var countToKill = 0,
        sleepTimeout = 400 + Math.round(Math.random() * 100);
      if (error) {
        return callback(error);
      }
      countToKill = instances.reduce(function (count, pid) {
        if (pid !== process.pid) {
          //BIG WARNING if SIGNAL is sent, it does not mean,
          //that signal was recieved and processed.
          //so it's no guarantee, that process is dead just after kill
          //and because of this it's required to check if someone left
          //and kill them once more
          try {
            Console.log('kill %d %s', pid, ident);
            process.kill(pid, 'SIGKILL');
          } catch (e) {
            Console.log('can not kill' + pid, e);
          }
          count++;
        }
        return count;
      }, 0);
      if (countToKill !== 0) {
        //if there were processes, required to kill, check them for existance
        if (depth > this.MAX_KILL_TRIES) {
          return callback(new Error('can not kill all requires instances of deamon. Give up'));
        }
        return setTimeout(this._killOtherDaemonInstances.bind(this, ident, depth++, callback), sleepTimeout);
      }
      callback(null);
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
    var child = childProcess.spawn(this.nodeJs, newArgv, {setsid: this._daemonize && !this.daemonized});
    Console.log("fork", process.pid, this.argv, child.pid);
  },
  /* daemonize, if processes command line tells to do so
   * if no -- do nothing, continue running in attached to tty mode
   * @public
   * @return {undefined}
   * */
  daemonize: function (callback) {
    this._killOtherDaemonInstances(this.argv.ident, function (error) {
      if (error) {
        Console.error(error);
        process.exit();
      }
      if (this._daemonize && !this.daemonized) {
        return this.restart(callback);
      }
      if (callback instanceof Function) {
        return callback();
      }
    }.bind(this));
  },
  /* kill all instances of serice identified by ident
   * (except current, if also represents that service)
   * @public
   * @param {String} ident. service to kill identifier.
   * @param {function (Error|null)} callback. function to call when work is done
   * @return {undefined}
   * */
  stopRunningInstance: function (ident, callback) {
    this._killOtherDaemonInstances(ident, callback);
  },
  /* restart process. fork (set new session, and command line options according to current command line options)
   * and exit from current process (if no callback present)
   * @public
   * @param {Function|undefined} callback. function to call after fork
   * if present it's called. If missing, current process is exited
   * @return {undefined}
   * */
  restart: function (callback) {
    this._fork();
    if (callback instanceof Function) {
      return callback();
    }
    process.exit();
  }
};

module.exports.instance = function () {
  return Daemon;
};
