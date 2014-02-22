var Lib = require('ventum');
var Util = require('util');
var Vow = require('vow');
var QueryResult = Lib('query_result');
var DbDriver = Lib('db_driver');
var Lib = require('ventum');

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
Util.inherits(PostgresDriver, DbDriver);
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

module.exports.cls = function () {
  return PostgresDriver;
};
