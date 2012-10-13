/**
* Requst is wrapper of default http request object
* 
* @contstructor
* @param {object} req Default http request object
*/
exports.cls = function () {
  var urlLib = require('url'),
    Request;
  Request = function (req) {
    var parse,
      key;
    this.req = req;
    parse = urlLib.parse(req.url, true);
    for (key in parse) {
      this[key] = parse[key];
    }
    try {
      this.pathname = decodeURIComponent(this.pathname);
    } catch (e) {};
  };
  return Request;
};
