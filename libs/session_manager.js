/* @fileOverview session interface
 * */
var Lib = require('Lib');
var CookieMgr = Lib('cookie');
var Session = Lib('session');
/* @constructor. Class that implements sessions
 * no actual featurs there, just backbone
 * */
var SessionManager = function () {
};
SessionManager.prototype = {
  /* request handler. Attach CookieManager to params
   * @public
   * @param {Object} params. Object that represents request context
   * @return {undefined}
   * */
  onRequest: function (params) {
    params.cookie = new CookieMgr(params.request, params.response);
    params.session = new Session(this);
  }
};
module.exports.instance = function (Lib) {
  return SessionManager;
};
