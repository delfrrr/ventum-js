/* @fileOverview file contains class, that helps to work with http cookies
 * @see RFC 6265
 * */
/* @constructor
 * @param {http.request} request. Object that represents http request
 * @param {http.response} response. Object that represents http response
 * */
var CookieMgr = function (request, response) {
  this._request = request;
  this._response = response;
  this._cookieSet = false;
  this._parsedCookies = false;
  this.getCookies();
};
CookieMgr.prototype =  {
  DISALLOWED_ATTRIBUTE_NAME_SYMBOLS_RE: /[\(\)<>@,;:\"\/\[\]?={}\s]/g,
  DISALLOWED_ATTRIBUTE_VALUE_SYMBOLS_RE: /[\s",;]/g,
  /* parse Cookie header string
   * @private
   * @param {String} cookieHeader
   * */
  _parseCookies: function (cookieHeader) {
    var cookies = {};
    if (!cookieHeader) {
      return cookies;
    }
    cookieHeader = cookieHeader.trim();
    cookieHeader = cookieHeader.split(/;\s?/);
    cookieHeader.forEach(function (oneCookie) {
      var name,
        value;
      oneCookie = oneCookie.trim().split('=');
      if (oneCookie.length < 2) {
        return;
      }
      name = oneCookie.shift().trim().replace(this.DISALLOWED_ATTRIBUTE_NAME_SYMBOLS_RE, '');
      value = oneCookie.shift().trim().replace(this.DISALLOWED_ATTRIBUTE_VALUE_SYMBOLS_RE, '');
      if (!name || !value) {
        return;
      }
      cookies[name] = value;
    }.bind(this));
    return cookies;
  },
  /* construct Set-Cookie header string
   * @private
   * @param {Object} cookie
   * @return {undefined}
   * */
  _constructCookie: function (cookie) {
    var cookieParts = [],
      attributeValuePair,
      attribute;
    cookieParts.push(cookie.name + '=' + cookie.value);
    for (attribute in cookie.attributes) {
      cookieParts.push(attribute + '=' + cookie.attributes[attribute]);
    }
    return cookieParts.join('; ');
  },
  /* extract cookies from Cookie header
   * @public
   * @return {String: String, ...} return key value pairs, where key is name and value is value of cookie
   * */
  getCookies: function () {
    if (this._parsedCookies !== false) {
      return this._parsedCookies;
    }
    this._parsedCookies = this._parseCookies(this._request.req.headers.cookie);
    return this._parsedCookies;
  },
  /* Set cookie (add Set-Cookie header to response's headers
   * @public
   * @param {String} name name of cookie
   * @param {String} value value of cookie
   * @param {Number|Date|undefined} date set expiration date of cookie. If parameter is Number use Max-Age cookie attribute, else (date is of type Date) set Expires cookie attribute. Argument is optional
   * @param {String|undefined} domain set Domain attribute for cookie. Argument is optional
   * @param {String|undefined} path set Path attribute for cookie. Argument is optional
   * @return {Boolean}. return true if cookie was set or false if not (for example, because cookie was set before);
   * */
  setCookie: function (name, value, date, domain, path) {
    var cookie = {
      name: name,
      value: value,
      attributes: {}
    };
    if (this._cookieSet) {
      return false;
    }
    if (date !== undefined) {
      if (date instanceof Date) {
        cookie.attributes.expires = date.toUTCString();
      } else {
        date = parseInt(date, 10);
        if (date && !isNaN(date)) {
          cookie.attributes['max-age'] = date;
        }
      }
    }
    if (domain !== undefined) {
      cookie.attributes.domain = domain;
    }
    if (path !== undefined) {
      cookie.attributes.path = path;
    }
    this._response.res.setHeader('Set-Cookie', this._constructCookie(cookie));
    this._cookieSet = true;
    return true;
  },
  /* unset cookie with name, on domain and path
   * @public
   * @param {String} name name of cookie
   * @param {String|undefined} domain domain attribute for cookie. Optional
   * @param {String|undefined} path  path attribute for cookie. Optional
   * @return {Boolean} returns true if header is set or false if some kind of problem
   * */
  unSetCookie: function (name, domain, path) {
    return this.setCookie(name, '', 0, domain, path);
  }
};
module.exports.cls = function (Lib) {
  return CookieMgr;
};
