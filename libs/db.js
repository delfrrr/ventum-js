/* @fileOverview library to work with databases 
 * currently postgres via pg and mysql via mysql-libmysqlclient implemented
 * */
var Lib = require('ventum');
var Console = Lib('console');
var util = require('util');
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
  this.db = db;
  this.config = config;
};
DbDriver.prototype = {
  /* prepare query to be executed. transform placeholders into form, that driver understands.
   * understand what data corresponds to what placeholder
   * wrap data in internal storage classes, which stores information about how data has to be transformed and escaped (for example array, that will be inserted as one row)
   * @private
   * @param {String} query query to execute
   * @param {Object|String|Number} data query arguments
   * @return {{query:String, data:Array}} prepared query and data
   * */
  prepareQuery: function (query, data) {
    var i = 0,
      context = {},
      preparedData  = [],
      preparedQuery = query.replace(/\$((\d+)|([\w_]+))*/ig, function (match, identifier, digit, name) {
        var placeholderNum;
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
          data[placeholderNum] = this.escapeString(data[placeholderNum]);
        }
        return data[placeholderNum].prepareForQuery(preparedData, placeholderNum, data, context, arguments);
      }.bind(this));
    return {query: preparedQuery, data: preparedData};
  },
  /* run query. 
   * @public
   * @param {String} query query with placeholders
   * @param {Array<{*}>} data  arguments to query
   * @param {function|undefined} callback. callback to call in asyncronous mode. if present -- work in asyncronous mode. if absent -- in syncronous
   * @return {undefined|QueryResult} return QueryResult if working in syncronous mode, or return nothing in syncronous. in asyncronous mode, query result is returned as argument of callback
   * */
  query: function (query, data, callback) {
    var queryAndData = this.prepareQuery(query, data);
    if (callback === undefined) {
      return this.querySync(queryAndData.query, queryAndData.data);
    }
    return this.queryAsync(queryAndData.query, queryAndData.data, callback);
  },
  /* dummy function that does query in syncronous mode
   * has to be provided by database driver.
   * @private
   * */
  querySync: function () {
    throw new Error('querySync has to be implemented in driver');
  },
  /* dummy function that does query in asyncronous mode
   * has to be provided by database driver.
   * @private
   * */
  queryAsync: function () {
    throw new Error('queryAsync has to be implemented in driver');
  },
  /* dummy function that escapes field, table, database and other names
   * has to be provided by database driver.
   * @private
   * */
  escapeField: function () {
    throw new Error('escape Field must be implemented in driver');
  },
  /* dummy function that escapes values (text as most common value) 
   * has to be provided by database driver.
   * @private
   * */
  escapeText: function () {
    throw new Error('escape text must be implemented in driver');
  }
};
/* @class  driver for postgresql database
 * @param {String} db database identifier
 * @param {Object} condig connection configuration
 * */
var PostgresDriver = function (db, config) {
  DbDriver.apply(this, arguments);
  //var pg     = require('pg').native;
  var pg     = require('pg');
  //TODO set defaults for missing parameters;
  this._connection = new pg.Client(config);
  this._connection.connect();
};
util.inherits(PostgresDriver, DbDriver);
/* syncronous query dummy function. postgres driver does not provide any posibility to execute syncronous queries
 * */
PostgresDriver.prototype.querySync = function () {
  throw new Error('Postgres driver does not provide synchronous version of query');
};
/* run query in asyncronous mode 
 * @private
 * @param {string} query
 * @param {} data  query arguments
 * @param {function(QueryResult)} callback to be called query is done 
 * @return {undefined} returns nothing. result is provided as argument for callback
 * */
PostgresDriver.prototype.queryAsync = function (query, data, callback) {
  this._connection.query(query, data, function (err, data) {
    var answer = new QueryResult();
    answer.query = query;
    answer.error = err;
    if (!answer.error) {
      answer.rows  = data.rows;
    }
    callback(answer);
  });
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
      return self.escapeField(this.data);
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
/* escape identifier (table,database, schema, user name) before placing it in query
 * @_private
 * @param {String} field 
 * @return Object
 * */
PostgresDriver.prototype.escapeField = function (field) {
  return '"' + field.replace(/(\\)*"/g, function (fullMatch, escapeSeqMatch) {
    if (escapeSeqMatch === undefined) {
      return '\\"';
    }
    return escapeSeqMatch + (escapeSeqMatch.length % 2 === 0 ? '\\' : '') + '"';
  }) + '"';
};
PostgresDriver.prototype.escapeText = function (text) {
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
        return self.escapeField(field);
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
      names.push(self.escapeField(key));
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
      answer.push(self.escapeField(key) + '=$' + preparedData.push(row[key]));
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
  var Mysql     = require('mysql-libmysqlclient');
  //TODO set defaults for missing parameters;
  if (this.config.charset === undefined) {
    this.config.charset = 'utf8';
  }
  this._connection = Mysql.createConnectionSync();
  this._connection.connectSync(this.config.host, this.config.user, this.config.password, this.config.database);
  if (!this._connection.connectedSync()) {
    throw new Error(util.inspect({
      message: 'can not connect',
      config: this.config,
      errno: this._connection.connectErrno,
      error: this._connection.connectError
    }, true, null, true));
  }
  this._connection.setCharsetSync(this.config.charset);
};
util.inherits(MysqlDriver, DbDriver);
/* run query in syncronous mode 
 * @private
 * @param {string} query
 * @param {} data  query arguments
 * @return {QueryResult}
 * */
MysqlDriver.prototype.querySync = function (query, data) {
  var res = this._connection.querySync(query),
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
    res = this._connection.query(query, function (err, res) {
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
    });
};
/* escape identifier (table,database, schema, user name) before placing it in query
 * use ` symbol
 * @private
 * @param {String} field 
 * @return Object
 * */
MysqlDriver.prototype.escapeField = function (field) {
  return '`' + field.replace(/`+/g, function (matches) {
    if (matches.length % 2 === 0) {
      return matches;
    }
    return matches + '`';
  }) + '`';
};
/* escape test before placing it in query
 * use ' symbol
 * @private
 * @param {String} field 
 * @return Object
 * */
MysqlDriver.prototype.escapeText = function (text) {
  if (text === null || text === undefined) {
    return 'NULL';
  }
  if (typeof (text) === 'boolean') {
    return text;
  }
  return '\'' + this._connection.escapeSync(String(text)) + '\'';
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
    return self.escapeText(this.data);
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
    return self.escapeField(this.data);
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
      return self.escapeText(item);
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
      values.push(self.escapeText(this.data[key]));
      names.push(self.escapeField(key));
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
      names.push(self.escapeField(key));
    }
    //jslint does not understand for (i=10; i--;)
    for (i = this.data.length; i--; i) {
      values = [];
      for (key in this.data[i]) {
        values.push(self.escapeText(this.data[i][key]));
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
      keyValuePairs.push(self.escapeField(key) + '=' + self.escapeText(this.data[key]));
    }
    return keyValuePairs.join(', ');
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
Db.prototype = {
  /* run query using apropriate database driver
   * query is executed in asyncronous if last argument is function
   * @public
   * @param {String} query 
   * @param {Array|function(QueryResult)|undefined} data. If data is Array -- than use it as query arguments. if function, and is last argument that use as callback to be called after query is done
   * if undefined, and is last argument -- that run query in syncronous mode, without any arguments
   * return {QueryResult|undefined} if run in syncronous mode -- return result of query. if run in asyncronous -- return nothing. query result will be returned trough callback
   * */
  query: function (query) {
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
      if (this.statistics[query] === undefined) {
        this.statistics[query] = {count: 0, time: 0};
      }
      timeStart = Date.now();
      if (callback instanceof Function) {
        originalCallback = callback;
        callback = function () {
          this.statistics[query].count++;
          this.statistics[query].time += Date.now() - timeStart;
          originalCallback.apply(this, arguments);
        }.bind(this);
        return this._backend.query(query, queryData, callback);
      }
      tmp = this._backend.query(query, queryData, callback);
      this.statistics[query].count++;
      this.statistics[query].time += Date.now() - timeStart;
      return tmp;
    }
    return this._backend.query(query, queryData, callback);
  },
  /* enable statistic collection for current database 
   * @public
   * */
  enableStatistics: function () {
    if (!this.statistics) {
      this.statistics = {};
    }
  },
  /* clean statistics (delete all remembered queries and their execution times and counts)
   * @public
   * */
  clearStatisics: function () {
    this.statistics = {};
  },
  /* create object that represents row to be inserted by INSERT sql statement using apropriate database driver
   * @public
   * */
  insertRow: function (row) {
    //row is key/value object
    return this._backend.insertRow(row);
  },
  /* create object that represents multiple rows to be inserted by INSERT sql statement using apropriate database driver
   * @public
   * */
  insertMultiRow: function (row) {
    //row is key/value object
    return this._backend.insertMultiRow(row);
  },
  /* create object that represents row values  to be stored in database by UPDATE sql statement using apropriate database driver
   * @public
   * */
  updateRow: function (row) {
    //row is key/value object
    return this._backend.updateRow(row);
  },
  /* create object that represents identifier for some database object(table, schema, database)  using apropriate database driver
   * @public
   * */
  field: function (field) {
    return this._backend.field(field);
  },
  /* create object that represents query argument, that has not be escaped in any way
   * dangerous. use if you are really know what you are doing
   * @public
   * */
  noEscape: function (text) {
    return this._backend.noEscape(text);
  },
  /* create object that represents values for sql IN statement using apropriate database driver 
   * @public
   * */
  inEscape: function (array) {
    return this._backend.inEscape(array);
  },
  /* create object that represents normal text, that has to be placed in query. escaping is done by apropriate database driver 
   * @public
   * */
  escapeString: function (text) {
    return this._backend.escapeString(text);
  }
};
/* database conection manager class
 * @constructor
 * @return {function(String)} returns function, that is interface to connection manager(lookup method from DbInstanceManager.prototype)
 * */
var DbInstanceManager = function () {
  this.databaseInstances = {};
  var lookup = this.lookup.bind(this);
  lookup.databases = this.databases;
  return lookup;
};
DbInstanceManager.prototype = {
  /* interface, that is exported by DbInstanceManager to outer world
   * @public
   * @param {String} dbName identifier of database. 
   * @return {Db} returns instance of class Db, that is connected to database identified with dbName. If connection already opened -- return it. if no connection -- try to  connect, and return if successfull
   */
  lookup: function (dbName) {
    if (this.databaseInstances[dbName] !== undefined) {
      return this.databaseInstances[dbName];
    }
    if (this.databases[dbName] === undefined) {
      throw new Error('There are no ' + dbName + ' database in configuration');
    }
    this.databaseInstances[dbName] = new Db(dbName, this.databases[dbName]);
    return this.databaseInstances[dbName];
  }
};
module.exports.instance = function (Lib) {
  return DbInstanceManager;
};

