/* @fileOverview library that implement one session
 * */
var Session = function (sessionManager, params) {
  var sessionData = {};
  this._sessionManager = sessionManager;
  this._params = params;
  sessionData.save = this.save.bind(this, sessionData);
  return sessionData;
};
Session.prototype = {
  save: function (sessionData, callback) {
    this._sessionManager.saveSession(sessionData, callback);
  }
};
module.exports.cls = function (Lib) {
  return Session;  
};
