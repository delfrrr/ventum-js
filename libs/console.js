/**
 * Console is alternative of default console.
 * It have same methods, but show messages like appache log
 *
 * @contstructor
 */
exports.instance = function (Lib) {
  var util = require('util'),
    Console;
  Console = function () {
    this._initDateArrays();
  };
  Console.prototype = {
    FORMAT : 'D M d H:i:s Y',
    MAX_STACK : 3,
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
    /**
     * Write error in std_error with Appace like message
     * 
     * @param {String|Error} message The message or instance of Error
     * @param {Number} [stackCount] count of stacks in error message
     */
    error: function (message, stackCount) {
      var message = this._message(message, typeof stackCount === 'number' ? stackCount : this.MAX_STACK);
      console.error(message);
    },
    /**
     * Write message in std_out
     *
     * @param {String} message The message to write
     */
    log: function () {
      var message = this._message(util.format.apply(util, arguments), false);
      console.log(message);
    }
  };
  return Console;
};
