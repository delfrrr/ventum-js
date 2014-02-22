/**
 * Server.js is wrapper of default node http server.
 * Server can be run on some socket, 
 * if it not set server will run on default socket.
 * @require requst
 * @require response
 */
exports.cls = function (Lib) {
  var http = require('http'),
    Response = Lib('response'),
    Request = Lib('request'),
    Console = Lib('console'),
    exec = require('child_process').exec,
    Vow = require('vow'),
    Server;
  /**
   * @contstructor
   *
   * @param {Function} controller will deside wich model should be call
   */
  Server = function (callback) {
    this._server = http.createServer(function (req, res) {
      callback(new Request(req), new Response(res));
    });
  };
  Server.prototype = {
    /**
     * Start http server on port {ip:port}
     *
     * @param {Number} [port] Wich port will be listening
     * @param {String} [ip] Wich ip will be listening
     */
    start: function (port, ip) {
      port = port || this.PORT;
      ip = ip || this.IP;
      this._server.listen(port, ip);
      Console.log('http server started at %s:%s', ip, port);
    },

    /**
     * Closing (stoping) http server
     * This method allow to unhook node from console (used in test)
     * @returns {Vow}
     */
    close: function () {
      var defer = Vow.defer();
      this._server.once('close', defer.resolve.bind(defer));
      this._server.close();
      return defer.promise();
    }
  };
  return Server;
};
