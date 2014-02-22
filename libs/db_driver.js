var Lib = require('ventum');
var Domain = require('domain');
var Console = Lib('console');
var QueryResult = Lib('query_result');
var Pool = Lib('connection_pool');

/* @class parent class for database driver classes. defines interface and some common code
 * @param {String} db database identifier
 * @param {Object} config configuration parameters for connection
 * */
var DbDriver = function (db, config) {
  this.db = db;
  this.config = config;
	this.config.poolSize = this.config.poolSize || 1;
  this.statistics = false;
	this._pool = new Pool(
		this.config.poolSize,
		this._driverSpecificConnectAsync.bind(this),
		this._driverSpecificConnectSync.bind(this)
	);
};
DbDriver.prototype = {};
/* prepare query to be executed. transform placeholders into form, that driver understands.
 * understand what data corresponds to what placeholder
 * wrap data in internal storage classes,
 * which stores information about how data has to be transformed and escaped
 * (for example array, that will be inserted as one row)
 * @private
 * @param {Object} connection
 * @param {String} query query to execute
 * @param {Object|String|Number} data query arguments
 * @return {{query:String, data:Array}} prepared query and data
 * */
DbDriver.prototype.prepareQuery = function (connection, query, data) {
  var i = 0,
    context = {},
    preparedData  = [],
    preparedQuery = query.replace(/(\\?)\$((\d+)|([\w_]+))*/ig, function (match, escapeBackSlash, identifier, digit, name) {
      var placeholderNum;
      if (escapeBackSlash) {
        return '$' + (identifier || '');
      }
      if (identifier === undefined || identifier === '') {
        placeholderNum = i++;
      } else if (digit !== undefined  && digit !== '') {
        placeholderNum = identifier - 1;
      }
      if (data[placeholderNum] === undefined) {
        Console.error(data);
        Console.error(arguments);
        throw new Error('undefined variable ' + placeholderNum + ' for query');
      }
      //null.prepareForQuery === undefined produces exception
      //undefined.prepareForQuery === undefined produces.exception
      //additional checks to avod it
      if (data[placeholderNum] === null || data[placeholderNum] === undefined || !(data[placeholderNum].prepareForQuery instanceof Function)) {
        data[placeholderNum] = this.escapeDefault(data[placeholderNum]);
      }
      return data[placeholderNum].prepareForQuery(connection, preparedData, placeholderNum, data, context, arguments);
    }.bind(this));
  return {query: preparedQuery, data: preparedData};
};
/* connect in asyncronous way to database
 * has to be implemented in database driver
 * call callback, when connection is ready, or on connection error
 * @private
 * @return {Vow} promise to connection object
 * */
DbDriver.prototype._driverSpecificConnectAsync = function () {
  throw new Error("_driverSpecificConnectAsync has to be implemented in driver");
};
/* connect to database in syncronous mode.
 * has to be implemented by database driver
 * @private
 * @return {Object|Error} return instance of Error class connection is failed or
 * connection othervize
 * that represents connection error
 * */
DbDriver.prototype._driverSpecificConnectSync = function () {
  throw new Error("_driverSpecificConnectSync has to be implemented in driver");
};

/* execure query in syncronous mode
 * manage connection. connect if not connected
 * handle errors
 * @private
 * @param {String} query query with placeholders
 * @param {Array<{*}>} data  arguments to query
 * @return {QueryResult} return QueryResult
 * */
DbDriver.prototype._querySync = function (query, data) {
  var queryAndData,
    connection,
    result;
  connection = this._pool.getSync();
  if (connection instanceof Error) {
    result = new QueryResult();
    result.query = query;
    result.error = connection;
  } else {
    queryAndData = this.prepareQuery(connection, query, data);
    result = this._driverSpecificQuerySync(connection, queryAndData.query, queryAndData.data);
		this._pool.free(connection);
  }
  if (this._driverSpecificErrorHandler instanceof Function) {
    this._driverSpecificErrorHandler(connection, result);
  }
  return result;
};

/* execure query in syncronous mode
 * manage connection. connect if not connected
 * handle errors
 * @private
 * @param {String} query query with placeholders
 * @param {Array<{*}>} data  arguments to query
 * @return {Vow} return promise to QueryResult
 * */

DbDriver.prototype._queryAsync = function (query, data) {
	return this._pool.getAsync()
		.fail(function (error) {
			var result = new QueryResult();
      result.query = query;
      result.error = error;
      this._driverSpecificErrorHandler(null, result);
			return Vow.reject(result);
		}.bind(this))
		.then(function (connection) {
			var queryAndData = this.prepareQuery(connection, query, data);

			return this._driverSpecificQueryAsync(connection, queryAndData.query, queryAndData.data)
			.always(function (queryResult) {
				this._pool.free(connection);
				if (this._driverSpecificErrorHandler instanceof Function) {
					this._driverSpecificErrorHandler(connection, queryResult.valueOf());
				}
				return queryResult;
			}.bind(this));
		}.bind(this));
};

/* dummy function that does query in syncronous mode
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype._driverSpecificQuerySync = function () {
  throw new Error('querySync has to be implemented in driver');
};
/* dummy function that does query in asyncronous mode
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype._driverSpecificQueryAsync = function () {
  throw new Error('queryAsync has to be implemented in driver');
};
/* dummy function that escapes field, table, database and other names
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype._escapeField = function () {
  throw new Error('escape Field must be implemented in driver');
};
/* dummy function that escapes values (text as most common value)
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype._escapeText = function () {
  throw new Error('escape text must be implemented in driver');
};
/* enable statistic collection for current database
 * @public
 * */
DbDriver.prototype.enableStatistics = function () {
  if (!this.statistics) {
    this.statistics = {};
  }
};
/* clean statistics (delete all remembered queries and their execution times and counts)
 * @public
 * */
DbDriver.prototype.clearStatisics = function () {
  this.statistics = {};
};

/**
 * Gather profiling info before executing query
 * @returs {Object}
 */
DbDriver.prototype._preQueryGatherStatistics = function () {
  return {
    startTime: Date.now()
  };
};
/**
 * Save profiling info about query into global storage
 * @param {String} query
 * @param {Object} preQueryStat Information gathered before
 * executing query, and requied to calculate statisics
 */
DbDriver.prototype._saveInStatistics = function (queryResult, preQueryStat) {
  var query = queryResult.query;
	if (this.statistics) {
		if (this.statistics[query] === undefined) {
      this.statistics[query] = {count: 0, time: 0};
    }
    this.statistics[query].count++;
    this.statistics[query].time += Date.now() - preQueryStat.startTime;
	}
};
/* run query
 * normalize function arguments to three values: query, arguments for query(empty array if no arguments)  and callback (if present)
 * for convinient usage by deeper level functions
 * collect runtime statistics(if enabled)
 * query is executed in asyncronous if last argument is function
 * @public
 * @param {String} query
 * @param {Array|function(QueryResult)|undefined} data. If data is Array -- than use it as query arguments. if function, and is last argument that use as callback to be called after query is done
 * if undefined, and is last argument -- that run query in syncronous mode, without any arguments
 * return {QueryResult|undefined} if run in syncronous mode -- return result of query. if run in asyncronous -- return nothing. query result will be returned trough callback
 * */
DbDriver.prototype.query = function (query) {
	var callback,
    statInfo,
    tmp,
    queryData = [];
  if (arguments[arguments.length - 1] instanceof Function) {
    callback =  Array.prototype.pop.apply(arguments);
    callback = Domain.active ? Domain.active.bind(callback) : callback;
  }
  Array.prototype.slice.call(arguments, 1).forEach(function (arg) {
    if (queryData instanceof Array) {
      queryData = queryData.concat(arg);
    } else {
      queryData.push(arg);
    }
  });
  statInfo = this._preQueryGatherStatistics();
	if (!(callback instanceof Function)) {
		tmp = this._querySync(query, queryData);
		this._saveInStatistics(tmp, statInfo);
		return tmp;
	}
	return this._queryAsync(query, queryData).always(function (resultPromise) {
		this._saveInStatistics(resultPromise.valueOf(), statInfo);
		callback(resultPromise.valueOf());
		return resultPromise;
	}.bind(this));
};
module.exports.cls = function () {
  return DbDriver;
}
