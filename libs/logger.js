/* @fileOverview library that provides 
 * non blocking logging data in csv format into file.
 * Files are changed every day. 
 * */
var Lib = require('ventum');
var Utils = Lib('utils');
var Fs = require('fs');
var Path = require('path');
/* @constructor
 * @param {String} pathTemplate path, that is used as template for files
 * when creating files, current data is inserted between filename and its extenstion
 */
var CSVFileLogger = function (pathTemplate) {
  this._logStream = false;
  this._logFileName = false;
  pathTemplate = Path.normalize(pathTemplate);
  this._pathTemplate = {};
  this._pathTemplate.extname = Path.extname(pathTemplate);
  this._pathTemplate.basename = Path.basename(pathTemplate, this._pathTemplate.extname);
  this._pathTemplate.dirname = Path.dirname(pathTemplate);
};
CSVFileLogger.prototype = {
  /* format data into csv string
   * @private
   * @param {Object|Array|String|Number} data. If object serialize key-value pairs one by one, if array -- serialize values
   * @return {String} retutn data serialized into csv string
   * */
  _createCSVRow: function (data) {
    var dataArray = [],
      key;
    if (typeof (data) === 'string' || typeof (data) === 'number') {
      dataArray = [data];
    } else if (data instanceof Array) {
      dataArray = data;
    } else if (data instanceof Object) {
      for (key in data) {
        dataArray.push(key, data[key]);
      }
    }
    return dataArray.map(function (element) {
      if (element === null || element === undefined) {
     	return ''; 
      }	
      return '"' + element.toString().replace(/"/g, '""') + '"';
    }).join(',');
  },
  /* return current date in year-month-day format
   * @private
   * @return {String}
   * */
  _formatHumanReadableDate: function () {
    var now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
  },
  /* get filename, that has to be used for saving data this time
   * use date and this.path for this
   * @private
   * @return {String} path to file
   * */
  _getFileName: function () {
    return this._pathTemplate.dirname + '/' + this._pathTemplate.basename + '.' + this._formatHumanReadableDate() + this._pathTemplate.extname;
  },
  /* get writeable stream  to write
   * if new file need this time -- open it and close old file
   * @private
   * @return {fs.WriteStream} stream, used to log data
   * */
  _getStream: function () {
    var newFileName = this._getFileName();
    if (this._logStream === false || !this._logStream.writable || this._logFileName === false || this._logFileName !== this.newFileName) {
      if (this._logStream) {
        this._logStream.end();
      }
      this._logFileName = newFileName;
      this._logStream = Fs.createWriteStream(this._logFileName, {flags: 'a+'});
    }
    return this._logStream;
  },
  /* save data in log file
   * data is saved in background worker, so this function is not blocking
   * @public
   * @param {*}
   * @return {undefined}
   * */
  write: function (data) {
    var stream = this._getStream();
    stream.write(this._createCSVRow(data) + "\n");
  }
};
module.exports.cls = function (Lib) {
  return CSVFileLogger;
};
