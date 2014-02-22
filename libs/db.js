/**
 * @fileOverview library that implements
 * database connection manager
 */
var Lib = require('ventum');
var Console = Lib('console');
var MysqlDriver = Lib('mysql_driver');
var PostgresDriver = Lib('pg_driver');

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

