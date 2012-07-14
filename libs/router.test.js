var Lib = require('./../../libs/lib'),
  router = Lib('router'),
  Server = Lib('server'),
  server = new Server(function (req, res) {
    router.execute(req, res);
  }),
  httpGet = require('http').get,
  getLocal,
  testPath,
  port = 9999;
getLocal = function (path, callback) {
  var bodyLength = 0,
    chunks = [];
  httpGet({
    host: '127.0.0.1',
    port: port,
    path: path
  }, function (res) {
    res.on('data', function (chunk) {
      bodyLength += chunk.length;
      chunks.push(chunk);
    });
    res.on('end', function () {
      var content = new Buffer(bodyLength),
        cursor = 0;
      chunks.forEach(function (chunk) {
        chunk.copy(content, cursor, 0);
        cursor += chunk.length;
      });
      callback(content.toString());
    });
  }).on('error', function (e) {
    callback(null);
  });
};
testPath = function (description, path, value) {
  it(description, function () {
    server.start(port);
    var result;
    getLocal(path, function (res) {
      result = res;
    });
    waitsFor(function () {
      return result !== jasmine.undefined;
    });
    runs(function () {
      expect(result).toEqual(value);
      server.close();
    });
  });
};
router.addRoutes({
  '^/$': {
    model: 'router.test.model',
    action: 'index'
  },
  '^/path/to/(\\w+)$': {
    model: 'router.test.model',
    action: 'matches'
  },
  '^/script.html$': {
    model: 'router.test.model',
    action: 'getParams'
  },
  '^/write$': {
    model: 'router.test.model',
    action: 'write'
  },
  '^/writeJSON$': {
    model: 'router.test.model',
    action: 'writeJSON'
  },
  '^/writeJSONP$': {
    model: 'router.test.model',
    action: 'writeJSONP'
  },
  '^/error$': {
    model: 'router.test.model',
    action: 'error'
  }
});
describe('server and router', function () {
  testPath('index page', '/', 'index page');
  testPath('not found', '/404', 'Page not found');
  testPath('route matches', '/path/to/file', 'file');
  testPath('get params', '/script.html?foo=bar', 'bar');
});
describe('response', function () {
  testPath('write', '/write', 'The quick brown fox jumps over the lazy dog');
  testPath('writeJSON', '/writeJSON', '{"foo":"bar"}');
  testPath('writeJSONP', '/writeJSONP', 'callback123({"foo":"bar"});');
  testPath('error', '/error404', 'Page not found');
});

