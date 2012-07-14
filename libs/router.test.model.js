exports.instance = function () {
  var Model = function () {
    
  };
  Model.prototype = {
    index: function (params) {
      params.response.end('index page');
    },
    matches: function (params) {
      params.response.end(params.routeMatches[1]);
    },
    getParams: function (params) {
      params.response.end(params.request.query.foo);
    },
    write: function (params) {
      params.response.write('The quick brown fox');
      params.response.write(' jumps over the lazy dog');
      params.response.end();
    },
    writeJSON: function (params) {
      params.response.writeJSON({foo: 'bar'});
    },
    writeJSONP: function (params) {
      params.response.writeJSONP({foo: 'bar'}, 'callback123');
    },
    error: function (params) {
      params.response.error(404);
    }
  };
  return Model;   
}
