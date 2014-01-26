/* @fileOverview library to work with databases
 * currently postgres via pg and mysql via mysql-libmysqlclient implemented
 * */
var Lib = require('ventum');
var Console = Lib('console');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Vow = require('vow');

/**
 * Simple pool library. Provides resources pooling.
 * @constructor
 * @param {Number} size Pool size
 * @param {Function} allocatorAsync function that creates new
 * pooled item in asyncronous way
 * @param {Function} allocatorSync function that creates new
 * pooled item in synchronous way
 */
var Pool = function (size, allocatorAsync, allocatorSync) {
	this._size = size < 1 ? 1 : size;
	this._pool = [];
	this._allocatorAsync = allocatorAsync;
	this._allocatorSync = allocatorSync;
  this._checkUVThreadPool();
};

Pool.prototype = {
  
  //default size of libuv's thread pool
  //(as for node  <= 0.10 libuv has fixed size)
  DEFAULT_UV_THREADPOOL_SIZE: 4,

  _checkUVThreadPool: function () {
    var threadPoolSize = Number(process.env['UV_THREADPOOL_SIZE']) || this.DEFAULT_UV_THREADPOOL_SIZE;   
    if (threadPoolSize <= this._size) {
      Console.log(
        'For correct work of connection pooling libuv\'s thread pool should be correctly set.',
        'It\'s size shoud be pool size + 1-5.',
        'Use UV_THREADPOOL_SIZE environment variable to set it'
      );
    } 
  },

	/**
	 * Get item from pool in syncronous way
	 * @returns {Object}
	 */
	getSync: function () {
		var newItem,
			newIndex = this._pool.reduce(function (lessUsedItem, poolItem, poolItemIndex) {
			if (poolItem.item &&
				(lessUsedItem === false || poolItem.count < this._pool[lessUsedItem].count)) {
				return poolItemIndex;
			}
			return lessUsedItem;
		}.bind(this), false);
		if ((newIndex === false || this._pool[newIndex].count !== 0) && this._pool.length < this._size) {
			newItem = {
				count: 1,
				item: this._allocatorSync()
			};
			newItem.itemPromise = Vow.fulfill(newItem.item);
			if (!newItem.item) {
				return new Error('can not connect');
			}
			this._pool.push(newItem);
			return newItem.item;
		}
		if (newIndex !== false) {
			return this._pool[newIndex].item;
		}
		return new Error('can not get apropriate pool item in syncronous way');
	},

	/**
	 * Get item from pool in syncronous way
	 * @returns {Object}
	 */
	getAsync: function () {
		var newItem,
			newIndex = this._pool.reduce(function (lessUsedItem, poolItem, poolItemIndex) {
				if (lessUsedItem === false || poolItem.count < this._pool[lessUsedItem].count) {
					return poolItemIndex;
				}
				return lessUsedItem;
			}.bind(this), false);
		if ((newIndex === false || this._pool[newIndex].count !== 0) && this._pool.length < this._size) {
			newItem = {
				count: 1,
				itemPromise: this._allocatorAsync().then(function (item) {
					newItem.item = item;
					return Vow.resolve(item);
				}).fail(function (error) {
					this._pool = this._pool.filter(function (pooledItem) {
						return pooledItem !== newItem;
					});
					return Vow.reject(error);
				}.bind(this))
			};
			this._pool.push(newItem);
			return newItem.itemPromise;
		}
		if (newIndex !== false) {
			this._pool[newIndex].count++;
			return this._pool[newIndex].itemPromise;
		}
		return Vow.reject(new Error('pool is zero sized'));
	},

	/**
	 * Free used pool item
	 * @param {Object} item
	 */
	free: function (item) {
		this._pool.forEach(function (pooledItem) {
			if (item === pooledItem.item) {
				pooledItem.count --;
			}
		});
	},

	/**
	 * Remove item from pool.
	 * usefull, for example, when item is known to be
   * broken
   * @param {Object} item
	 */
	remove: function (item) {
		this._pool = this._pool.filter(function (pooledItem) {
			return item !== pooledItem.item;
		});
	}
};

/* @class represents result of query. contain rows and/or error status
 * */
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
/* @class parent class for database driver classes. defines interface and some common code
 * @param {String} db database identifier
 * @param {Object} config configuration parameters for connection
 * */
var DbDriver = function (db, config) {
  EventEmitter.call(this);
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
util.inherits(DbDriver, EventEmitter);
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
    queryAndData = this.prepareQuery(connection, query, data),
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
 * Save profiling info about query into global storage
 * @param {String} query
 * @param {Date} timeStart Query time start
 */
DbDriver.prototype._saveInStatistics = function (query, timeStart) {
	if (this.statistics) {
		if (this.statistics[query] === undefined) {
      this.statistics[query] = {count: 0, time: 0};
    }
    this.statistics[query].count++;
    this.statistics[query].time += Date.now() - timeStart;
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
    timeStart,
    tmp,
    queryData = [];
  if (arguments[arguments.length - 1] instanceof Function) {
    callback =  Array.prototype.pop.apply(arguments);
  }
  Array.prototype.slice.call(arguments, 1).forEach(function (arg) {
    if (queryData instanceof Array) {
      queryData = queryData.concat(arg);
    } else {
      queryData.push(arg);
    }
  });
  timeStart = Date.now();
	if (!(callback instanceof Function)) {
		tmp = this._querySync(query, queryData);
		this._saveInStatistics(query, timeStart);
		return tmp;
	}
	return this._queryAsync(query, queryData).always(function (resultPromise) {
		this._saveInStatistics(query, timeStart);
		callback(resultPromise.valueOf());
		return resultPromise;
	}.bind(this));
};
/* @class  driver for postgresql database
 * @param {String} db database identifier
 * @param {Object} condig connection configuration
 * */
var PostgresDriver = function (db, config) {
  DbDriver.apply(this, arguments);
  //var pg     = require('pg').native;
  this.Pg = require('pg');
  //TODO set defaults for missing parameters;
};
util.inherits(PostgresDriver, DbDriver);
/* syncronous query dummy function. postgres driver does not provide any posibility to execute syncronous queries
 * */
PostgresDriver.prototype._driverSpecificQuerySync = function () {
  throw new Error('Postgres driver does not provide synchronous version of query');
};
/* driver specific implementation of DbDriver._driverSpecificConnectSync
 * pg library does not provide syncronous version of connect, so throw exeption if called
 * @private
 * */
PostgresDriver.prototype._driverSpecificConnectSync = function () {
  throw new Error('postgres driver does not provide asyncronous version of connect');
};
/* driver specific implementation of DbDriver._driverSpecificConnectAsync
 * handle connection errors
 * @private
 * */
PostgresDriver.prototype._driverSpecificConnectAsync = function () {
	var defer = Vow.defer(),
		connection = new this.Pg.Client(this.config);
	connection.connect(function (error) {
		if (error) {
			defer.reject(error);
		} else {
			defer.resolve(connection);
		}
	});
  return defer.promise();
};
/* driver specific implementation of _driverSpecificErrorHandler.
 * this method is called every time query returns result.
 * it analyzes result and makes decision if connection is alive.
 * if connection is not alive, handle this situation
 * @param {Object} connection
 * @param {QueryResult} queryResult
 * */
PostgresDriver.prototype._driverSpecificErrorHandler = function (connection, queryResult) {
  if (queryResult.error) {
    if (queryResult.error.code === 'ECONNREFUSED') {
			this._pool.remove(connection);
    }
  }
};
/* run query in asyncronous mode
 * @private
 * @param {Object} connection instance
 * @param {string} query
 * @param {} data  query arguments
 * @return {Vow}
 * */
PostgresDriver.prototype._driverSpecificQueryAsync = function (connection, query, data) {
	var defer = Vow.defer();
  try {
    //pg library throws exceptions when calling query
    //in some situation, like when database connection fails
    connection.query(query, data, function (err, data) {
      var answer = new QueryResult();
      answer.query = query;
      answer.error = err;
      if (!answer.error) {
        answer.rows  = data.rows;
				defer.resolve(answer);
      } else {
				defer.reject(answer);
			}
    });
		return defer.promise();
  } catch (e) {
    var result = new QueryResult();
    result.query = query;
    result.error = e;
		return Vow.reject(result);
  }
};
/* create object that represents query argument, that will be used as list of coma separated values for sql IN operator
 * @public
 * @param {Array<*>} array array that contains values to be used in sql expression like  IN (val1, val2, val3 , ...)
 * @return Object
 * */
PostgresDriver.prototype.inEscape = function (array) {
  return {
    data: array,
    prepareForQuery: function (connection, preparedData) {
      var answer = [];
      this.data.forEach(function (item) {
        //Array.push returns new length of array. and that's what we need
        answer.push('$' + preparedData.push(item));
      });
      return answer.join(',');
    }
  };
};
/* create object that represents query argument,  ARGUMENT WILL NOT BE ESCAPED IN ANY WAY
 * use only if understand why or else may cause sql injection
 * @public
 * @param {String} text  string that contains argument
 * @return Object
 * */
PostgresDriver.prototype.noEscape = function (text) {
  //that's dangerous. Use only if shure
  return {
    data: text,
    prepareForQuery: function (connection) {
      return this.data;
    }
  };
};
/* create object that represents query argument, argument is field name, table name, database name, user name or name of other database part
 * field will be escaped with  " symbol
 * @public
 * @param {String} field name to be pasted and escaped in query
 * @return Object
 * */
PostgresDriver.prototype.field = function (field) {
  var self = this;
  return {
    data: field,
    prepareForQuery: function (connection) {
      return self._escapeField(this.data);
    }
  };
};
/* create object that represents query argument, argument is any common value, text numbers, null or undefined
 * @public
 * @param {String|Number|null|undefined} text
 * @return Object
 * */
PostgresDriver.prototype.escapeString = function (text) {
  var argStorage = {data: text};
  if (argStorage.data === null || argStorage === undefined) {
    argStorage.data = null;
  }
  argStorage.prepareForQuery = function (connection, preparedData) {
    //Array.push returns new length of array. and that's what we need
    return '$' + preparedData.push(this.data);
  };
  return argStorage;
};
/* default escape method, for arguments, that with type not expressed explicitly
 * @param {*}
 * */
PostgresDriver.prototype.escapeDefault = PostgresDriver.prototype.escapeString;
/* escape identifier (table,database, schema, user name) before placing it in query
 * @private
 * @param {String} field
 * @return Object
 * */
PostgresDriver.prototype._escapeField = function (field) {
  return '"' + field.replace(/(\\)*"/g, function (fullMatch, escapeSeqMatch) {
    if (escapeSeqMatch === undefined) {
      return '\\"';
    }
    return escapeSeqMatch + (escapeSeqMatch.length % 2 === 0 ? '\\' : '') + '"';
  }) + '"';
};
PostgresDriver.prototype._escapeText = function (text) {
  throw new Error('not implemented');
};
/* create query argument that represents row that need to be inserted by INSERT statement
 * f.e. INSERT INTO tbl_name $
 * @public
 * @param {Object} row object -- key-value pairs that represents row to be inserted. key is name of field in database, value is value to be inserted
 * @return Object
 * */
PostgresDriver.prototype.insertRow = function (row) {
  var self = this,
    argStorage = {data: row};
  argStorage.prepareForQuery = function (connection, preparedData) {
    var key,
      placeholders = [],
      keys = Object.keys(row).map(function (field) {
        return self._escapeField(field);
      });
    for (key in row) {
      placeholders.push('$' + preparedData.push(row[key]));
    }
    return '(' + keys.join(', ') + ') VALUES ( ' + placeholders.join(', ') + ' )';
  };
  return argStorage;
};
/* create query argument that represents multiple rows that need to be inserted by INSERT statement
 * f.e. INSERT INTO tbl_name $
 * @public
 * @param {Array} rows array, that contains set of rows to be insered. every row  object, that represents one row, like in PostgresDriver.insertRow
 * @return Object
 * */
PostgresDriver.prototype.insertMultiRow = function (rows) {
  var self = this,
    argStorage = {data: rows};
  argStorage.prepareForQuery =  function (connection, preparedData) {
    var key,
      i,
      j = 1,
      rows = [],
      names = [],
      values;
    for (key in this.data[0]) {
      names.push(self._escapeField(key));
    }
    //jslint does not understand for (i=10; i--;)
    for (i = this.data.length; i--; i) {
      values = [];
      for (key in this.data[i]) {
        values.push('$' + j++);
        preparedData.push(this.data[i][key]);
      }
      rows.push('(' + values.join(',') + ')');
    }
    return '(' + names.join(',') + ') VALUES ' + rows.join(',');
  };
  return argStorage;
};
/* create query argument that represents new row values, that has to be stored in database using UPDATE statement
 * f.e. UPDATE tbl_name set ($)  where true
 * @public
 * @param {Object} row object, that represents one row, like in PostgresDriver.insertRow
 * @return Object
 * */
PostgresDriver.prototype.updateRow = function (row) {
  var self = this,
    argStorage = {data: row};
  argStorage.prepareForQuery = function (connection, preparedData) {
    var key,
      answer = [];
    for (key in row) {
      answer.push(self._escapeField(key) + '=$' + preparedData.push(row[key]));
    }
    return answer.join(', ');
  };
  return argStorage;
};
/* mysql database driver
 * @constructor
 * @param {String} db  database identifier
 * @param {Object} database connection configuration
 * */
var MysqlDriver = function (db, config) {
  DbDriver.apply(this, arguments);
  this.Mysql = require('mysql-libmysqlclient');
  //TODO set defaults for missing parameters;
  if (this.config.charset === undefined) {
    this.config.charset = 'utf8';
  }
};
util.inherits(MysqlDriver, DbDriver);
/* mysql driver specific version of _driverSpecificConnectSync
 * connects to database in syncronous mode.
 * @private
 * @return {null| Error} null means that connection is ok. Error represents error, that happens in connection process
 * */
MysqlDriver.prototype._driverSpecificConnectSync = function () {
	var connection = new this.Mysql.MysqlConnectionQueued();
  //use this strange way of connecting
  //due to https://github.com/Sannis/node-mysql-libmysqlclient/issues/156 issue
  connection.initSync();
  connection.setOptionSync(this.Mysql.MYSQL_OPT_LOCAL_INFILE);
  connection.realConnectSync(this.config.host, this.config.user, this.config.password, this.config.database, this.config.port);

  //connectedSync, even being syncronous, is very fast
  //because it's only kind of getter for filed in instance of
  //internal mysql-libmysqlclient class
  if (!connection.connectedSync()) {
    return new Error(util.inspect({
      message: 'can not connect',
      config: this.config,
      errno: connection.connectErrno,
      error: connection.connectError
    }, true, null, true));
  }
  connection.setCharsetSync(this.config.charset);
  return connection;
};
/* asyncronous version of _driverSpecificConnectAsync for mysql
 * as mysql-libmysqlclient does not provide asyncronous version of connect
 * it is made using syncronous
 * @private
 * @param {function({null|Error})} callback to call when connection is ready
 * @return {undefined}  nothing to return
 * */
MysqlDriver.prototype._driverSpecificConnectAsync = function () {
  //mysql driver has no implementation of asyncronous connect
  //so asycronous version on the base of syncronous
  //of course this will block, but connection has not be wery often, and this has not be problem
	var connection = this._driverSpecificConnectSync();
	if (connection instanceof Error) {
		return Vow.reject(connection);
	}
	return Vow.fulfill(connection);
};
/* driver specific implementation of _driverSpecificErrorHandler.
 * this method is called every time query returns result.
 * it analyzes result and makes decision if connection is alive.
 * if connection is not alive, handle this situation
 * @private
 * @param {Object} connection
 * @param {QueryResult} queryResult  intercepted result of query
 * */
MysqlDriver.prototype._driverSpecificErrorHandler = function (connection, queryResult) {
  if (queryResult.error) {
    if (queryResult.error === 'MySQL server has gone away') {
			this._pool.remove(connection);
    }
  }
};
/* run query in syncronous mode
 * @private
 * @param {Object} connection instance
 * @param {string} query
 * @param {} data  query arguments
 * @return {QueryResult}
 * */
MysqlDriver.prototype._driverSpecificQuerySync = function (connection, query, data) {
  var res = connection.querySync(query,
      (data.length && data[data.length - 1]) || undefined),
    answer = new QueryResult();
  answer.query = query;
  if (!res) {
    answer.error = connection.errorSync();
    return answer;
  }
  if (res === true || res === false ||  res.numRowsSync() === 0) {
    //query has no result (INSERT/DELETE/UPDATE something other);
    //but everything is OK
    answer.rows = [];
  } else {
    answer.rows = res.fetchAllSync();
  }
  return answer;
};
/* run query in asyncronous mode
 * @private
 * @param {Object} connection instance
 * @param {string} query
 * @param {} data  query arguments
 * @return {Vow}
 * */
MysqlDriver.prototype._driverSpecificQueryAsync = function (connection, query, data) {
  var defer = Vow.defer(),
		callArguments = [query],
    internalCallback = function (err, res) {
      var answer = new QueryResult();
      answer.query = query;
      if (!res) {
        answer.error = connection.errorSync();
				return defer.reject(answer);

      }
			if (res === true || res === false || !res.fieldCount) {
        //query has no result (INSERT/DELETE/UPDATE something other);
        //but everything is OK
        answer.rows = [];
				return defer.resolve(answer);
      }
      res.fetchAll(function (err, rows) {
        if (err) {
          answer.error = err;
          answer.rows  = [];
					return defer.reject(answer);
        }
        answer.rows  = rows;
				defer.resolve(answer);
      });
    };
  if (data.length) {
    callArguments.push(data.pop());
  }
  callArguments.push(internalCallback);
	connection.query.apply(connection, callArguments);
	return defer.promise();
};
/* escape argument as text with ' symbol. private helper method
 * @private
 * @param {String} text to escape
 * @return {String} escaped string
 * */
MysqlDriver.prototype._escapeText = function (connection, text) {
  return '\'' + connection.escapeSync(String(text)) + '\'';
};
/* escape identifier (table,database, schema, user name) before placing it in query
 * use ` symbol
 * @private
 * @param {String} field
 * @return Object
 * */
MysqlDriver.prototype._escapeField = function (field) {
  return '`' + field.replace(/`+/g, function (matches) {
    if (matches.length % 2 === 0) {
      return matches;
    }
    return matches + '`';
  }) + '`';
};
/* smart escape data depenging on data type
 * @private
 * @param {*} data data to be escaped
 * */
MysqlDriver.prototype._escapeSmart = function (connection, data) {
  if (data === null || data === undefined) {
    return 'NULL';
  }
  if (typeof (data) === 'boolean') {
    return data;
  }
  if (typeof (data) === 'number') {
    return data;
  }
  return '\'' + connection.escapeSync(String(data)) + '\'';
};
/* default method for escaping query arguments, without explicitly defined type
 * use _escapeSmart method to be convinient enough
 * @public
 * @param {String} text
 * @return Object
 * */
MysqlDriver.prototype.escapeDefault = function (text) {
  var self = this,
    argStorage = {data: text};
  argStorage.prepareForQuery = function (connection) {
    return self._escapeSmart(connection, this.data);
  };
  return argStorage;
};
/* create object that represents text argument query
 * @public
 * @param {Strin,g} text
 * @return Object
 * */
MysqlDriver.prototype.escapeString = function (text) {
  var self = this,
    argStorage = {data: text};
  argStorage.prepareForQuery = function (connection) {
    return self._escapeText(connection, this.data);
  };
  return argStorage;
};
/* create object that represents query argument, argument is field name, table name, database name, user name or name of other database part
 * field will be escaped with  ` symbol
 * @public
 * @param {String} field name to be pasted and escaped in query
 * @return Object
 * */
MysqlDriver.prototype.field = function (field) {
  var self = this,
    argStorage = {data: field};
  argStorage.prepareForQuery = function (connection) {
    return self._escapeField(this.data);
  };
  return argStorage;
};
/* create object that represents query argument, that will be used as list of coma separated values for sql IN operator
 * @public
 * @param {Array<*>} array array that contains values to be used in sql expression like  IN (val1, val2, val3 , ...)
 * @return Object
 * */
MysqlDriver.prototype.inEscape = function (array) {
  var self = this,
    argStorage = {data: array};
  argStorage.prepareForQuery = function (connection) {
    return this.data.map(function (item) {
      return self._escapeSmart(connection, item);
    }).join(',');
  };
  return argStorage;
};
/* create query argument that represents row that need to be inserted by INSERT statement
 * f.e. INSERT INTO tbl_name $
 * @public
 * @param {Object} row object -- key-value pairs that represents row to be inserted. key is name of field in database, value is value to be inserted
 * @return Object
 * */
MysqlDriver.prototype.insertRow = function (row) {
  var self = this,
    argStorage = {data: row};
  argStorage.prepareForQuery = function (connection) {
    var names = [],
      values = [],
      key;
    for (key in this.data) {
      values.push(self._escapeSmart(connection, this.data[key]));
      names.push(self._escapeField(key));
    }
    return '(' + names.join(',') + ') VALUES(' + values.join(',') + ')';
  };
  return argStorage;
};
/* create query argument that represents multiple rows that need to be inserted by INSERT statement
 * f.e. INSERT INTO tbl_name $
 * @public
 * @param {Array} rows array, that contains set of rows to be insered. every row  object, that represents one row, like in MysqlDriver.insertRow
 * @return Object
 * */
MysqlDriver.prototype.insertMultiRow = function (rows) {
  var self = this,
    argStorage = {data: rows};
  argStorage.prepareForQuery = function (connection) {
    var names = [],
      key,
      i,
      values,
      rows = [];
    for (key in this.data[0]) {
      names.push(self._escapeField(key));
    }
    //jslint does not understand for (i=10; i--;)
    for (i = this.data.length; i--; i) {
      values = [];
      for (key in this.data[i]) {
        values.push(self._escapeSmart(connection, this.data[i][key]));
      }
      rows.push('(' + values.join(',') + ')');
    }
    return '(' + names.join(',') + ') VALUES ' + rows.join(',');
  };
  return argStorage;
};
/* create query argument that represents new row values, that has to be stored in database using UPDATE statement
 * f.e. UPDATE tbl_name set ($)  where true
 * @public
 * @param {Object} row object, that represents one row, like in MysqlDriver.insertRow
 * @return Object
 * */
MysqlDriver.prototype.updateRow = function (row) {
  var self = this,
    argStorage = {data: row};
  argStorage.prepareForQuery = function (connection) {
    var keyValuePairs = [],
      key;
    for (key in this.data) {
      keyValuePairs.push(self._escapeField(key) + '=' + self._escapeSmart(connection, this.data[key]));
    }
    return keyValuePairs.join(', ');
  };
  return argStorage;
};
/* pass Buffer instance to query.(used in LOAD DATA LOCAL INFILE queries)
 * @public
 * @params {Buffer} buf instance of Buffer, that has to be passed as query argument
 * @return {Object} that represents Buffer, as query argument
 * */
MysqlDriver.prototype.loadDataBuffer = function (buf) {
  var argStorage = {data: buf};
  argStorage.prepareForQuery = function (connection, preparedData) {
    preparedData.push(this.data);
    //that's some sensless word,
    //used only to make mysql happy with query syntax
    return "'nothing'";
  };
  return argStorage;
};
/* database conection manager class
 * @constructor
 * @return {function(String)} returns function, that is interface to connection manager(lookup method from DbInstanceManager.prototype)
 * */
var DbInstanceManager = function () {
  this.databaseInstances = {};
  var lookup = this.lookup.bind(this);
  this.databases = this.databases || {};
  lookup.databases = this.databases;
  lookup.addConfig = this.addConfig.bind(this);
  return lookup;
};
DbInstanceManager.prototype = {
  /* interface, that is exported by DbInstanceManager to outer world
   * @public
   * @param {String} dbName identifier of database.
   * @return {Db} returns instance of class Db, that is connected to database identified with dbName. If connection already opened -- return it. if no connection -- try to  connect, and return if successfull
   */
  lookup: function (dbName) {
    var backendDriver;
    if (this.databaseInstances[dbName] !== undefined) {
      return this.databaseInstances[dbName];
    }
    if (this.databases[dbName] === undefined) {
      throw new Error('There are no ' + dbName + ' database in configuration');
    }
    switch (this.databases[dbName].driver) {
    case undefined:
      throw new Error('Driver for ' + dbName + ' is not defined');
    case 'postgres':
      backendDriver = PostgresDriver;
      break;
    case 'mysql':
      backendDriver = MysqlDriver;
      break;
    default:
      throw new Error('Driver ' + this.databases[dbName].driver + ' for database ' + dbName + ' is not implemented');
    }
    this.databaseInstances[dbName] = new backendDriver(dbName, this.databases[dbName]);
    return this.databaseInstances[dbName];
  },
  addConfig: function (identifier, config) {
    if (this.databases[identifier] !== undefined) {
      throw new Error("database config for" + identifier + " already exists");
    }
    this.databases[identifier] = config;
  }
};
module.exports.instance = function (Lib) {
  return DbInstanceManager;
};

