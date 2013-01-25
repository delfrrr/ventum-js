/**
* Requst is wrapper of default http request object
* 
* @contstructor
* @param {object} req Default http request object
*/
var Net = require('net');
var UrlLib = require('url');
var QueryString = require('querystring');
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
    this._maxPostSize = this.MAX_POST_SIZE;
  };
  Request.prototype = {
    MAX_POST_SIZE: 10000,
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
    },
    /* set post body limit for current request.
     * Post size limiting is kind of protection against
     * very large post request, and too much memory usage 
     * @public
     * @param {Number} max post body size in bytes. if post body is larger, error is emitted
     * if post is processed using standart way (getPost method);
     * @return undefined;
     * */
    setMaxPostSize: function (postSize) {
      this._maxPostSize = postSize;
    },
    /* collect post chunks into one buffer. 
     * if post body appears to be too large (larger then this._maxPostSize) 
     * then error is reported
     * @private
     * @param {Object} request. object that represents request
     * @param {function ({Error|null}, {undefined|Buffer})} callback
     * function to call when work is done. first function argument represents error
     * second -- buffer with post body
     * @return {undefined}
     * */
    _collectPostChunks: function (request, callback) {
      var postBuffer = new Buffer(0),
        error = false;
      request.on('data', function (chunk) {
        if (error) {
          return;
        }
        if (postBuffer.length + chunk.length >= this._maxPostSize) {
          error = new Error("post body is too large");
          request.emit('error', error);
        }
        postBuffer = Buffer.concat([postBuffer, chunk]);
      });
      request.once('error', function (err) {
        if (!error) {
          error = err;
        }
        return callback(error);
      });
      request.on('end', function () {
        if (!error) {
          return callback(null, postBuffer);
        }
      });
    },
    /* standart way to handle post request.
     * post body chunks are concatenated into one buffer and returend
     * it whole post body is to large  --error returned
     * post body is decoded by QueryString module
     * @public 
     * @param {function ({Error|null}, {undefined|Object})} callback. function to call when post is 
     * collected into one buffer and decoded. Error reported in first argument of function
     * decoded post body in second
     * @return  {undefined}
     * */
    getPost: function (callback) {
      this._collectPostChunks(this.req, function (error, postBody) {
        if (error) {
          return callback(error);
        }
        postBody = QueryString.parse(postBody.toString());
        callback(null, postBody);
      });
    }
  };
  return Request;
};
