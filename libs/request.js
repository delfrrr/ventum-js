/**
* Requst is wrapper of default http request object
* 
* @contstructor
* @param {object} req Default http request object
*/
var Net = require('net');
var UrlLib = require('url');
exports.cls = function () {
  var Request = function (req) {
    var parse,
      key;
    this.req = req;
    parse = UrlLib.parse(req.url, true);
    for (key in parse) {
      this[key] = parse[key];
    }
    try {
      this.pathname = decodeURIComponent(this.pathname);
    } catch (e) {};
  };
  Request.prototype = {
    /* get requested domain name. use Host or X-Forwarded-Host headers
     * prefer domain name over ip address
     * if both headers are missing return ip address, that http server listens
     * @public
     * @return {String}
     * */
    domain: function () {
      var host = this.req.headers.host,
        xForwardedHost = this.req.headers['x-forwarded-host'];
      if (host !== undefined) {
        host = host.replace(/:\d{1,5}$/, '');
      }
      if (xForwardedHost !== undefined) {
        xForwardedHost = xForwardedHost.replace(/:\d{1,5}$/, '');
        if (host === undefined || !Net.isIP(xForwardedHost)) {
          host = xForwardedHost;
        }
      }
      return host || this.req.socket.address().address;
    },
    /* get ip address of client that initiates this request
     * prefer data from X-Real-Ip header over remote address of socket
     * as, most likely, we are behind proxy/balancer
     * @public
     * @return {String}
     * */
    clientIp: function () {
      if (this.req.headers['x-real-ip'] !== undefined) {
        return this.req.headers['x-real-ip'];
      }
      return this.req.socket.remoteAddress;
    }
  };
  return Request;
};
