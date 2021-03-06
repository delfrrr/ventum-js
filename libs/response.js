var fs = require('fs');
var Lib = require('./../');
var Console = Lib('console');
function loadError (pathes, name) {
    if (!loadError._cache) {
        loadError._cache = {};
    }
    if (loadError._cache[name]) {
        return loadError._cache[name];
    }
    if (pathes[name]) {
        return (loadError._cache[name] = fs.readFileSync(pathes[name])); 
    }
    return name;
}

exports.cls = function () {
   /**
   * @contstructor
   * @param {Object} res Default http response
   */
  var Response = function (res) {
    this._headers = {'Content-Type': 'text/html'};
    this._status = 200;
    this._setTimeout(this.DEFAULT_TIMEOUT);
    this._startTime = Date.now();
    this._isEnd = false;
    this.res = res;
  };
  Response.prototype = {
    DEFAULT_TIMEOUT: 5000,
    MAX_TIMEOUT: 30000,
    DEFAULT_CHARSET: 'UTF-8',
    ERROR_PAGES: [],
    DEFAULT_REDIRECT_STATUS: 301,
    DEFAULT_HTTP_STATUS: 200,
    _setTimeout: function (time) {
      this._timeout = setTimeout(function () {
        this.error(504);
      }.bind(this), time);
    },
    _setContentTypeHeader: function (contentType, charset) {
      if (charset === undefined) {
        charset = this.DEFAULT_CHARSET;
      }
      if (charset) {
        contentType += '; charset=' + charset;
      }
      this.headers({'Content-Type': contentType});
    },
    _getErrorPage: function (status) {
      return loadError(this.ERROR_PAGES, status);
    },
    _end: function (data) {
      if (this._isEnd) {
        //most likely that this was called after timeout has passed 
        //and 504 error was sent to user
        //do not do anything as call to writeHead will throw exception
        Console.log("call response.end after response was already finished");
        return; 
      }
      this._status = this._status || this.DEFAULT_HTTP_STATUS;
      this.res.writeHead(this._status, this._headers);
      this.res.end(data);
      this._isEnd = true;
      clearTimeout(this._timeout);
    },
    /**
     * Add addtion header to request
     *
     * @param {Object} header Addion headers
     * @return {Response} instance of response wrapper
     */
    headers: function (headers) {
      var key;
      for (key in headers) {
        this._headers[key] = headers[key];
      }
      return this;
    },
    /**
     * Ability to start new timeout or disable it
     *
     * @param {Number} time in ms 
     * @return {Response} instance of response wrapper
     */
    timeout: function (time) {
      if (this._isEnd) {
        return;
      }
      clearTimeout(this._timeout);
      time = Math.min(time, this.MAX_TIMEOUT) - Date.now() + this._startTime;
      this._setTimeout(time);
      return this;
    },
    /**
     * Change status 200 with some other status
     *
     * @param {Number} status
     * @return {Response} instance of response wrapper
     */
    status: function (status) {
      this._status = status;
      return this;
    },
    /**
     * If status != 200, you may call this method to show default
     * page of this error;
     * 
     * @param {Number} status Nuber of error
     */
    error: function (status) {
      this.status(status).end(this._getErrorPage(status));
    },
    /**
     * Finish request and return content into http client
     *
     * @param {String|Number|Boolean|Function|Buffer} data Any data to send
     */
    end: function (data) {
      var ret;
      if (data !== undefined) {
        if (data instanceof Buffer) {
          ret = data;
        } else {
          ret = String(data);
        }
        this._end(ret);
      } else {
        this._end();
      }
    },
    /**
     * Finish request and return json as text
     * Sets content-type into application/json
     *
     * @param {Object} json
     */
    writeJSON: function (json, charset) {
      this._setContentTypeHeader('application/json', charset);
      this._end(JSON.stringify(json));
    },
    /**
     * Finish request and return json wrapped in calling of function.
     * Sets content-type info text/javascript.
     *
     * @param {Object} json
     * @param {String} callbackName Name of function on client-side
     */
    writeJSONP: function (json, callbackName, charset) {
      var st = callbackName + '(' + JSON.stringify(json) + ');';
      this._setContentTypeHeader('text/javascript', charset);
      this._end(st);
    },
    /**
     * Write a chunk into stream
     *
     * @param {String} st Is chunk
     * @return {Response} instance of response wrapper
     */
    write: function (st) {
      this.res.write(st, 'UTF-8');
      return this;
    },
    /* do redirect
     * @public
     * @param {string} url  url to redirect client to
     * @param {Number|String|undefined} httpStatus. status to use 
     * when redirecting. if not set DEFAULT_REDIRECT_STATUS is used (301)
     * */
    redirect: function (url, httpStatus) {
      if (httpStatus === undefined) {
        httpStatus = this.DEFAULT_REDIRECT_STATUS;  
      } 
      this.headers({'Location': url});
      this.status(httpStatus);
      this.end();
    }
  };
  return Response;
};
