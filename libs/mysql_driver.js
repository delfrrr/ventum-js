var Lib = require('ventum');
var Util = require('util');
var Vow = require('vow');
var QueryResult = Lib('query_result');
var DbDriver = Lib('db_driver');
var Domain = require('domain');
var bindToActiveDomain = function (fcn) {
  if (Domain.active) {
    return Domain.active.bind(fcn);
  }
  return fcn;
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
Util.inherits(MysqlDriver, DbDriver);
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
    return new Error(Util.inspect({
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

      res.fetchAll(bindToActiveDomain(function (err, rows) {
        if (err) {
          answer.error = err;
          answer.rows  = [];
					return defer.reject(answer);
        }
        answer.rows  = rows;
				defer.resolve(answer);
      }));
    };
  if (data.length) {
    callArguments.push(data.pop());
  }
  callArguments.push(bindToActiveDomain(internalCallback));
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
module.exports.cls = function () {
  return MysqlDriver;
};
