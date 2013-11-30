/* @fileOverview library to work with databases
 * currently postgres via pg and mysql via mysql-libmysqlclient implemented
 * */
var Lib = require('ventum');
var Console = Lib('console');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
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
  this._connection = false;
  /* flag. means that now connection in connecting state
   * @type {Boolean}
   * @private
   * */
  this._connecting = false;
  /* flag. means that connection is ok
   * @type {Boolean}
   * @private
   * */
  this._connected  = false;
  this.statistics = false;
};
util.inherits(DbDriver, EventEmitter);
/* prepare query to be executed. transform placeholders into form, that driver understands.
 * understand what data corresponds to what placeholder
 * wrap data in internal storage classes, which stores information about how data has to be transformed and escaped (for example array, that will be inserted as one row)
 * @private
 * @param {String} query query to execute
 * @param {Object|String|Number} data query arguments
 * @return {{query:String, data:Array}} prepared query and data
 * */
DbDriver.prototype.prepareQuery = function (query, data) {
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
      return data[placeholderNum].prepareForQuery(preparedData, placeholderNum, data, context, arguments);
    }.bind(this));
  return {query: preparedQuery, data: preparedData};
};
/* connect in asyncronous way to database
 * has to be implemented in database driver
 * call callback, when connection is ready, or on connection error
 * @private
 * @param {function({Object|Error|null})} callback. function to call, when connection is ready, or connecting fails
 * @return {undefined} nothing has to be returned
 * */
DbDriver.prototype._driverSpecificConnectAsync = function (callback) {
  throw new Error("_driverSpecificConnectAsync has to be implemented in driver");
};
/* connect to database in syncronous mode.
 * has to be implemented by database driver
 * @private
 * @return {null|QueryResult} return null if connection succeeded or return something other,
 * that represents connection error
 * */
DbDriver.prototype._driverSpecificConnectSync = function () {
  throw new Error("_driverSpecificConnectSync has to be implemented in driver");
};
/* get connection in asyncronous way.
 * if connection is present and ready then call callback
 * if connection is not ready put current query in queue, that will be executed on connect event
 * if there are no connection initialize connecting process
 * @private
 * @return {undefined} nothing to return;
 * */
DbDriver.prototype._getConnectionAsync = function (callback) {
  if (this._connection && this._connected) {
    //it's no need to emit "connect" because connection is ready
    //and that means that queue have to be empty(processed on connect event emitted after connection
    return callback();
  }
  if (this._connecting) {
    return this.once("connect", callback);
  }
  this.once("connect", callback);
  this._driverSpecificConnectAsync(function (error) {
    this._connected = !Boolean(error);
    this._connecting = false;
    this.emit("connect", error);
  }.bind(this));
};
/* get connection in syncronous way
 * if connection is ready and connected just return, to give chance for query to run
 * if connection is in connecting state (_getConnectionAsync was called before) return error
 * if no connection, or it is broken try to reconnect
 * return {null|QueryResult} returns null if connection is ok, or return something other to inform
 * about error
 * */
DbDriver.prototype._getConnectionSync = function () {
  var connectionError;
  if (this._connection && this._connected) {
    //go on. connection is ok;
    return null;
  }
  if (this._connecting) {
    //connection process was initialized before
    //by _getConnectionAsync. return error as nothing better can be done
    return "currently connecting";
  }
  connectionError = this._driverSpecificConnectSync();
  this._connected = !Boolean(connectionError);
  //no really need for this, but to prevent possible bugs
  this._connecting = false;
  return connectionError;
};
/* execure query in apropriate mode
 * manage connection. connect if not connected
 * handle errors
 * @private
 * @param {String} query query with placeholders
 * @param {Array<{*}>} data  arguments to query
 * @param {function|undefined} callback. callback to call in asyncronous mode. if present -- work in asyncronous mode. if absent -- in syncronous
 * @return {undefined|QueryResult} return QueryResult if working in syncronous mode, or return nothing in syncronous. in asyncronous mode, query result is returned as argument of callback
 * */
DbDriver.prototype._query = function (query, data, callback) {
  var queryAndData,
    connectionError,
    result;
  if (callback === undefined) {
    connectionError = this._getConnectionSync();
    if (connectionError) {
      result = new QueryResult();
      result.query = query;
      result.error = connectionError;
    } else {
      queryAndData = this.prepareQuery(query, data),
      result = this.querySync(queryAndData.query, queryAndData.data);
    }
    if (this._driverSpecificErrorHandler instanceof Function) {
      this._driverSpecificErrorHandler(result);
    }
    return result;
  }
  return this._getConnectionAsync(function (error) {
    var result;
    if (error) {
      result = new QueryResult();
      result.query = query;
      result.error = error;
      this._driverSpecificErrorHandler(result);
      return callback(result);
    }
    queryAndData = this.prepareQuery(query, data),
    this.queryAsync(queryAndData.query, queryAndData.data, function (queryResult) {
      if (this._driverSpecificErrorHandler instanceof Function) {
        this._driverSpecificErrorHandler(queryResult);
      }
      callback(queryResult);
    }.bind(this));
  }.bind(this));
};
/* dummy function that does query in syncronous mode
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype.querySync = function () {
  throw new Error('querySync has to be implemented in driver');
};
/* dummy function that does query in asyncronous mode
 * has to be provided by database driver.
 * @private
 * */
DbDriver.prototype.queryAsync = function () {
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
    originalCallback,
    tmp,
    queryData = [];
  //remove query from arguments
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
  if (this.statistics) {
    timeStart = Date.now();
    if (callback instanceof Function) {
      originalCallback = callback;
      callback = function () {
        if (this.statistics[query] === undefined) {
          this.statistics[query] = {count: 0, time: 0};
        }
        this.statistics[query].count++;
        this.statistics[query].time += Date.now() - timeStart;
        originalCallback.apply(this, arguments);
      }.bind(this);
      return this._query(query, queryData, callback);
    }
    tmp = this._query(query, queryData, callback);
    if (this.statistics[query] === undefined) {
      this.statistics[query] = {count: 0, time: 0};
    }
    this.statistics[query].count++;
    this.statistics[query].time += Date.now() - timeStart;
    return tmp;
  }
  return this._query(query, queryData, callback);
};
/* @class  driver for postgresql database
 * @param {String} db database identifier
 * @param {Object} condig connection configuration
 * */
var PostgresDriver = function (db, config) {
  DbDriver.apply(this, arguments);
  //var pg     = require('pg').native;
  this.Pg     = require('pg');
  //TODO set defaults for missing parameters;
};
util.inherits(PostgresDriver, DbDriver);
/* syncronous query dummy function. postgres driver does not provide any posibility to execute syncronous queries
 * */
PostgresDriver.prototype.querySync = function () {
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
PostgresDriver.prototype._driverSpecificConnectAsync = function (callback) {
  this._connection = new this.Pg.Client(this.config);
  this._connection.connect(callback);
  this._connection.on('error', function (error) {
    this._connected = false;
    this.emit("disconnect");
  }.bind(this));
};
/* driver specific implementation of _driverSpecificErrorHandler.
 * this method is called every time query returns result.
 * it analyzes result and makes decision if connection is alive.
 * if connection is not alive, handle this situation
 * */
PostgresDriver.prototype._driverSpecificErrorHandler = function (queryResult) {
  if (queryResult.error) {
    if (queryResult.error.code === 'ECONNREFUSED') {
      this._connected = false;
      this.emit("disconnect");
    }
  }
};
/* run query in asyncronous mode
 * @private
 * @param {string} query
 * @param {} data  query arguments
 * @param {function(QueryResult)} callback to be called query is done
 * @return {undefined} returns nothing. result is provided as argument for callback
 * */
PostgresDriver.prototype.queryAsync = function (query, data, callback) {
  try {
    //pg library throws exceptions when calling query
    //in some situation, like when database connection fails
    this._connection.query(query, data, function (err, data) {
      var answer = new QueryResult();
      answer.query = query;
      answer.error = err;
      if (!answer.error) {
        answer.rows  = data.rows;
      }
      callback(answer);
    });
  } catch (e) {
    var result = new QueryResult();
    result.query = query;
    result.error = e;
    callback(result);
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
    prepareForQuery: function (preparedData) {
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
    prepareForQuery: function () {
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
    prepareForQuery: function () {
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
  var self = this,
    argStorage = {data: text};
  if (argStorage.data === null || argStorage === undefined) {
    argStorage.data = null;
  }
  argStorage.prepareForQuery = function (preparedData) {
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
  argStorage.prepareForQuery = function (preparedData) {
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
  argStorage.prepareForQuery =  function (preparedData) {
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
  argStorage.prepareForQuery = function (preparedData) {
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
  //use this strange way of connecting
  //due to https://github.com/Sannis/node-mysql-libmysqlclient/issues/156 issue
  this._connection = new this.Mysql.bindings.MysqlConnection();
  this._connection.initSync();
  this._connection.setOptionSync(this.Mysql.MYSQL_OPT_LOCAL_INFILE);
  this._connection.realConnectSync(this.config.host, this.config.user, this.config.password, this.config.database, this.config.port);
  //this._connection = this.Mysql.createConnectionSync(this.config.host, this.config.user, this.config.password, this.config.database, this.config.port);
  //connectedSync, even being syncronous, is very fast
  //because it's only kind of getter for filed in instance of
  //internal mysql-libmysqlclient class
  if (!this._connection.connectedSync()) {
    return new Error(util.inspect({
      message: 'can not connect',
      config: this.config,
      errno: this._connection.connectErrno,
      error: this._connection.connectError
    }, true, null, true));
  }
  this._connection.setCharsetSync(this.config.charset);
  return null;
};
/* asyncronous version of _driverSpecificConnectAsync for mysql
 * as mysql-libmysqlclient does not provide asyncronous version of connect
 * it is made using syncronous
 * @private
 * @param {function({null|Error})} callback to call when connection is ready
 * @return {undefined}  nothing to return
 * */
MysqlDriver.prototype._driverSpecificConnectAsync = function (callback) {
  //mysql driver has no implementation of asyncronous connect
  //so asycronous version on the base of syncronous
  //of course this will block, but connection has not be wery often, and this has not be problem
  process.nextTick(callback.bind(this, this._driverSpecificConnectSync()));
};
/* driver specific implementation of _driverSpecificErrorHandler.
 * this method is called every time query returns result.
 * it analyzes result and makes decision if connection is alive.
 * if connection is not alive, handle this situation
 * @private
 * @param {QueryResult} queryResult  intercepted result of query
 * */
MysqlDriver.prototype._driverSpecificErrorHandler = function (queryResult) {
  if (queryResult.error) {
    if (queryResult.error === 'MySQL server has gone away') {
      this._connected = false;
      this.emit("disconnect");
    }
  }
};
/* run query in syncronous mode
 * @private
 * @param {string} query
 * @param {} data  query arguments
 * @return {QueryResult}
 * */
MysqlDriver.prototype.querySync = function (query, data) {
  var res = this._connection.querySync(query,
      (data.length && data[data.length - 1]) || undefined),
    answer = new QueryResult();
  answer.query = query;
  if (!res) {
    answer.error = this._connection.errorSync();
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
 * @param {string} query
 * @param {} data  query arguments
 * @param {function(QueryResult)} callback to be called when query is done
 * @return {undefined} returns nothing. result is provided as argument for callback
 * */
MysqlDriver.prototype.queryAsync = function (query, data, callback) {
  var self = this,
    callArguments = [query],
    internalCallback = function (err, res) {
      var answer = new QueryResult();
      answer.query = query;
      if (!res) {
        answer.error = self._connection.errorSync();
        process.nextTick(function () {
          callback(answer);
        });
      } else if (res === true || res === false || !res.fieldCount) {
        //query has no result (INSERT/DELETE/UPDATE something other);
        //but everything is OK
        answer.rows = [];
        process.nextTick(function () {
          callback(answer);
        });
      } else {
        res.fetchAll(function (err, rows) {
          if (err) {
            answer.error = err;
            answer.rows  = [];
          } else {
            answer.rows  = rows;
          }
          process.nextTick(function () {
            callback(answer);
          });
        });
      }
    };
  if (data.length) {
    callArguments.push(data.pop());
  }
  callArguments.push(internalCallback);
  this._connection.query.apply(this._connection, callArguments);
};
/* escape argument as text with ' symbol. private helper method
 * @private
 * @param {String} text to escape
 * @return {String} escaped string
 * */
MysqlDriver.prototype._escapeText = function (text) {
  return '\'' + this._connection.escapeSync(String(text)) + '\'';
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
MysqlDriver.prototype._escapeSmart = function (data) {
  if (data === null || data === undefined) {
    return 'NULL';
  }
  if (typeof (data) === 'boolean') {
    return data;
  }
  if (typeof (data) === 'number') {
    return data;
  }
  return '\'' + this._connection.escapeSync(String(data)) + '\'';
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
  argStorage.prepareForQuery = function () {
    return self._escapeSmart(this.data);
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
  argStorage.prepareForQuery = function () {
    return self._escapeText(this.data);
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
  argStorage.prepareForQuery = function () {
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
  argStorage.prepareForQuery = function () {
    return this.data.map(function (item) {
      return self._escapeSmart(item);
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
  argStorage.prepareForQuery = function () {
    var names = [],
      values = [],
      key;
    for (key in this.data) {
      values.push(self._escapeSmart(this.data[key]));
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
  argStorage.prepareForQuery = function () {
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
        values.push(self._escapeSmart(this.data[i][key]));
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
  argStorage.prepareForQuery = function () {
    var keyValuePairs = [],
      key;
    for (key in this.data) {
      keyValuePairs.push(self._escapeField(key) + '=' + self._escapeSmart(this.data[key]));
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
  argStorage.prepareForQuery = function (preparedData) {
    preparedData.push(this.data);
    //that's some sensless word,
    //used only to make mysql happy with query syntax
    return "'nothing'";
  };
  return argStorage;
};
/* class that represents one database
 * @constructor
 * @param {String} dbName identifier of database
 * @param {Object} dbConfiguration object that contains configuration for connection to database
 * */
var Db = function (dbName, dbConfiguration) {
  var backendDriver = '';
  switch (dbConfiguration.driver) {
  case undefined:
    throw new Error('Driver for ' + dbName + ' is not defined');
  case 'postgres':
    backendDriver = PostgresDriver;
    break;
  case 'mysql':
    backendDriver = MysqlDriver;
    break;
  default:
    throw new Error('Driver ' + dbConfiguration.driver + ' for database ' + dbName + ' is not implemented');
  }
  this._backend = new backendDriver(this, dbConfiguration);
  this.statistics = false;
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

