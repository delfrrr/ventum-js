/**
 * Console is alternative of default console.
 * It have same methods, but show messages like appache log
 *
 * @contstructor
 */
var Fs = require('fs');
var util = require('util');
var Lib = require('ventum');
var Helpers;
exports.instance = function (Lib) {
  var util = require('util'),
    Console;
  Console = function () {
    this._initDateArrays();
    this.logFilePool = {};
  };
  Console.prototype = {
    FORMAT : 'D M d H:i:s Y',
    MAX_STACK : 3,
    types: {
      error: {
        path: '/dev/null',
        format: 'error'
      },
      log: {
        path: '/dev/null',
        format: 'log'
      }
    },
    defaultType: 'error',
    defaultFormat: 'error',
    _initDateArrays: function () {
      var self = this;
      self._dateArrays = {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Seb', 'Oct', 'Nov', 'Dec'],
        map: {
          'D': function (d) {
            return self._dateArrays.day[d.getDay()];
          },
          'd': function (d) {
            return d.getDate();
          },
          'M': function (d) {
            return self._dateArrays.month[d.getMonth()];
          },
          'm': function (d) {
            return d.getMonth();
          },
          'Y': function (d) {
            return d.getFullYear();
          },
          'H': function (d) {
            return d.getHours();
          },
          'i': function (d) {
            return d.getMinutes();
          },
          's': function (d) {
            return d.getSeconds();
          }
        }
      };
    },
    _message: function (message, stackCount) {
      var error,
        stack = 0;
      if (stackCount) {
        error = new Error(message).stack.split('\n');
        // remove 2 stack that created in this lib
        error.splice(1, 2);
        message = error
          .filter(function () {
            return stack++ <= stackCount;
          })
          .join(', ')
          .replace(/\s+/g, ' ');
      }
      return '[' + this._date(this.FORMAT) + '] ' + message;
    },
    /**
     * Javascript version of PHP function date.
     * For more info visit http://php.net/manual/en/function.date.php
     *
     * @param {string|undefined} format Format of string
     * @return {string}
     */
    _date: function (format) {
      var self = this,
        date = new Date(),
        result;
      if (typeof format !== 'string') {
        return date.getTime();
      }
      result = format.split('').map(function (value) {
        return typeof self._dateArrays.map[value] === 'function' ?
               self._dateArrays.map[value](date) :
               value;
      }).join('');
      return result;
    },
    _getDaemon: function () {
      //do not call this in constuctor to avoid cyclic dependencies
      //between Daemon and Console libraries
      //or you'll have very strange bugs
      if (this._daemon === undefined) {
        this._daemon = Lib('daemon');
      }
      return this._daemon;
    },
    _getFd: function (type, callback) {
      var filename = this.types[type] ? this.types[type].path : this.types[this.defaultType].path;
      if (this.logFilePool[filename] !== undefined) {
        return callback(null, this.logFilePool[filename]);
      }
      if (this._getDaemon().shuttingDown) {
        //this can be called in uncauhgtException handler
        //it's important to make everything in syncronous way,
        //as async Fs api won't work
        this.logFilePool[filename] = Fs.openSync(filename, 'a+');
        return callback(null, this.logFilePool[filename]);
      }
      Fs.open(filename, 'a+', function (err, fd) {
        if (err) {
          return callback(err, null);
        }
        this.logFilePool[filename] = fd;
        callback(null, fd);
      }.bind(this));
    },
    _formatErrors: function (args) {
      //replace errors with string containing call stack of error
      //instead of using error stack of Console.error call
      //call map in such strange way to make this mathod applicable
      //for arguments (Array-like object) or any normal array
      return Array.prototype.map.call(args, function (argument) {
        if (argument instanceof Error) {
          var replacement = argument.toString() + ' ' + (argument.stack && argument.stack.toString());
          return replacement;
        }
        return argument;
      });
    },
    /* set of private methods, that are used to format messages before 
     * writing them to console or to file
     * all this methods transforms theirs arguments into string
     * */
    _formatters : {
      log: function () {
        return this._message(util.format.apply(util, this._formatErrors(arguments)), false) + '\n';
      },
      error: function () {
        return '[' + this._date(this.FORMAT) + '] ' + util.format.apply(util, this._formatErrors(arguments)) + '\n';
      },
      csv: function (array) {
        if (array instanceof Array) {
          //this is not the best way to break  load-time 
          //circular dependency between helpers and console
          //libraries
          Helpers  = Helpers ||  Lib('helpers');
          return Helpers.toCSV(array) + '\n';
        }
        return this._formatters[this.defaultFormat].apply(this, arguments);
      }
    },
    /* translate data, to string according to type
     * using methods from Console.prototype._formatters
     * exact method to run is defined by this.types configuration
     * and message type
     * @private
     * @param {String} type. message type
     * @param {*,...} any number of any typed arguments. 
     * @return {String}
     * */
    _formatMessage: function () {
      var type = Array.prototype.shift.call(arguments),
        format = (this.types[type] && this.types[type].format) || this.defaultFormat;
      if (this._formatters[format] === undefined) {
        format = this.defaultFormat;
      }
      if (this._formatters[format] === undefined) {
        return arguments.toString() + '\n';
      }
      return this._formatters[format].apply(this, arguments);
    },
    /* generic method that log's something 
     * depending on type argument, it log in "error" or in "log" mode
     * it takes into account Daemon mode. If process is running in 
     * daemon mode, everything is logged into files
     * if process is attached to tty use standart nodejs's console library
     * to print text to console
     * before message is logged in any way, it is converted to string using
     * all function arguments, by _formatMessage function
     * @public
     * @param {String} type. type of notification (log or error)
     * */
    notification: function (type) {
      var message = this._formatMessage.apply(this, arguments);
      if (!this._getDaemon().daemonized) {
        if (type === 'error') {
          //to be comaptible with ventum/libs/console.js
          console.error(message);
        } else {
          console.log(message);
        }
      }
      this._getFd(type, function (err, fd) {
        if (!err) {
          if (this._getDaemon().shuttingDown) {
            Fs.writeSync(fd, message);
          } else {
            Fs.write(fd, message);
          }
        }
      }.bind(this));
    },
/**
     * Write error in std_error with Appace like message
     * 
     * @param {String|Error} message The message or instance of Error
     * @param {Number} [stackCount] count of stacks in error message
     */
    error: function (message, stackCount) {
      Array.prototype.unshift.call(arguments, "error");
      this.notification.apply(this, arguments);
    },
    /**
     * Write message in std_out
     *
     * @param {String} message The message to write
     */
    log: function () {
      Array.prototype.unshift.call(arguments, "log");
      this.notification.apply(this, arguments);
    }
  };
  return Console;
};
