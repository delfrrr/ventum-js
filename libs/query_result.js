var Lib = require('ventum');
var Console = Lib('console');
/**
 * @class represents result of query. contain rows and/or error status
 */
var QueryResult = function () {
  this.query = '';
  this.rows = [];
  this.error = null;
};
QueryResult.prototype = {
  /* kill current process if query, result of  is represented by instance of QueryResult class
   * ends with error
   * print error, and stack trace to make it easier to locate problem query
   * @public
   * @param {*} message optional message (really anything printable) to print before exit
   * */
  dieOnError: function (message) {
    if (!this.error) {
      return;
    }
    if (message !== undefined) {
      Console.error(message);
    }
    Console.error(this.query);
    Console.error(this.error);
    try {
      throw new Error();
    } catch (e) {
      Console.error(e.stack);
    }
    process.exit(1);
  }
};
module.exports.cls = function () {
  return QueryResult;
} 
