/* @fileOverview session interface
 * */
var Lib = require('./../');
var CookieMgr = Lib('cookie');
/* @constructor. Class that implements sessions
 * no actual featurs there, just backbone
 * */
var SessionManager = function () {
};
SessionManager.prototype = {
  _loadSession: function (sessionId, sessionData) {
  },
  _saveSession: function (sessionId, sessionData) {
  },
  _dropSession: function (sessionId, sessionData) {
  },
  _createSession: function (sessionId) {
    var session = {};
    Object.defineProperty(session, 'load', {enumerable: false, writable: false, value: this._loadSession.bind(this, sessionId, session)});
    Object.defineProperty(session, 'save', {enumerable: false, writable: false, value: this._saveSession.bind(this, sessionId, session)});
    Object.defineProperty(session, 'drop', {enumerable: false, writable: false, value: this._dropSession.bind(this, sessionId, session)});
    Object.defineProperty(session, 'id', {enumerable: false, writable: false, value: function () {
      return sessionId;
    }})
    return session;
  },
  _handleSessionCookies: function (params) {
    return undefined;
  },
  /* request handler. Attach CookieManager to params
   * @public
   * @param {Object} params. Object that represents request context
   * @return {undefined}
   * */
  onRequest: function (params) {
    var sessionId;
    params.cookie = new CookieMgr(params.request, params.response);
    sessionId = this._handleSessionCookies(params);
    params.session = this._createSession(sessionId);
  }
};
module.exports.instance = function (Lib) {
  return SessionManager;
};
