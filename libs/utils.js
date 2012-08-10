/* @fileOverview different helper functions, asyncronous helpers (for, forEach, serial) 
 * */
var Utils = function () {
};
Utils.prototype = {
  /* asyncronous version of forEach
   * @public
   * @param {Array} arr  array to iterate over
   * @param {function ({*}, Number, function)} method. method to be called for every element of arr Array.
   * method has three arguments
   *  first - value - current array element
   *  second - key - index of current element in array
   *  third - next - callback. function to be called after work with current element is done
   *  callback HAS TO BE CALLED OBLIGATORY, or loop never ends,
   * @param {function()} handler callback, to call where loop ends
   * */
  asyncForEach: function (arr, method, handler) {
    var i = 0,
      len = arr.length,
      next = function () {
        if (i < len) {
          i++;
          process.nextTick(function () {method(arr[i - 1], i - 1, next); });
        } else {
          handler();
        }
      };
    next();
  },
  /* asyncronous version of for (var key in object)
   * @public
   * @param {Object} obj object to iterate over
   * @param {function ({*}, {*}, function)} method. method to be called for every element of arr Array.
   * method has three arguments
   *  first - value - current  element
   *  second - key - key of current element
   *  third - next - callback. function to be called after work with current element is done
   *  callback HAS TO BE CALLED OBLIGATORY, or loop never ends,
   * @param, {function()} handler callback, to call where loop ends
   * */
  objAsyncForEach: function (obj, method, handler) {
    var keys = Object.keys(obj);
    this.asyncForEach(keys, function (key, i, next) {
      method(obj[key], key, next);
    }, handler);
  },
  /* run list of asyncronous function one by one
   * @param {...function(...{?}, function(...{?}))} functions to be called 
   * each function accepts any number of arguments, but the last argument is function to be called after 
   * current function do it's work
   * callback accepts any number of arguments, that automatically will be passet to next function to call
   * */
  serial: function () {
    var callback,
      methods = [],
      index = -1,
      next;
    if (arguments.length < 2) {
      throw new Error('serial requires at least 2 arguments');
    }
    callback = Array.prototype.pop.call(arguments);
    if (!(callback instanceof Function)) {
      throw new Error('serial requires callback');
    }
    methods = Array.prototype.slice.call(arguments, 0);
    index = -1;
    next = function () {
      index++;
      if (index < methods.length) {
        Array.prototype.push.call(arguments, next);
        methods[index].apply(this, arguments);
      } else {
        callback.apply(this, arguments);
      }
    };
    next(next);
  }
};
module.exports.instance = function (Lib) {
  return Utils;
};
