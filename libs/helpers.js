var ChildProcess = require('child_process');
var Helpers = function () {
};
Helpers.prototype = {
  toCSV: function (array) {
    return array.map(function (element) {
      return '"' + element.toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }).join(',');
  },
  parseArgv: function () {
    var argv = {};
    process.argv.slice(2).forEach(function (element) {
      element = element.split('=');
      if (element.length > 1) {
        argv[element[0]] = element[1];
      } else {
        argv[element[0]] = true;
      }
    });
    return argv;
  },
  makeArgv: function (argv) {
    if (argv instanceof Array) {
      return argv.join(' ');
    }
    if (typeof (argv) === 'string') {
      return argv;
    }
    return Object.keys(argv).map(function (element) {
      if (argv[element] === true) {
        return element;
      }
      return element + '=' + argv[element];
    });
  },
  /* parse csv formatted row.
   * test are in function body.
   * @param {String} string -- string to parse
   * @return {Array}
   * */
  parseCsv: function (string) {
    /*var Assert = require('assert');
    Assert.deepEqual(parseCsv(''), [], "empty string -> empty array");
    Assert.deepEqual(parseCsv('ss,dd'), ['ss','dd'], 'simple');
    Assert.deepEqual(parseCsv('ss,'), ['ss',''], 'last empty');
    Assert.deepEqual(parseCsv(',ss'), ['','ss'], 'first empty');
    Assert.deepEqual(parseCsv('dd,,ss'), ['dd','','ss'], 'middle empty');
    Assert.deepEqual(parseCsv(','), ['',''], 'both empty');
    Assert.deepEqual(parseCsv(',,'), ['','',''], 'three empty');
    Assert.deepEqual(parseCsv(',,a,,'), ['','','a','',''], 'double empty nonempty double empty');
    Assert.deepEqual(parseCsv(',,b,a,,'), ['','','b','a','',''], 'double empty double nonempty double empty');
    Assert.deepEqual(parseCsv('""'), [''], "escaped empty");
    Assert.deepEqual(parseCsv('""""'),['"'], 'escape esaped');
    Assert.deepEqual(parseCsv('","'), [','], 'escaped ,');
    Assert.deepEqual(parseCsv(' ""'), [' ""'], " \" but not escape seq");
    Assert.deepEqual(parseCsv('"aa","bb","",""'), ['aa', 'bb', '', ''], "complex");
    Assert.deepEqual(parseCsv('"aa","bb", "", ""'), ['aa', 'bb', ' ""', ' ""'], " second complex");
    Assert.deepEqual(parseCsv('11,22,33,"'), ['11', '22', '33', ''], "unclosed before end");
    Assert.deepEqual(parseCsv('",sdfasd'), [',sdfasd'], "unclosed before coma");
    Assert.deepEqual(parseCsv('"aa","'), ['aa', ''], 'unclosed before end after escaped');
    Assert.deepEqual(parseCsv('","aa","asdfas"'), [',"aa', 'asdfas'], 'this is error csv, so everything is acceptable');
    */
    var i,
      currentChar,
      NOT_FIELD = 0,
      FIELD = 1,
      FIELD_ESCAPED = 2,
      FIELD_ESCAPED_QUOTE = 3,
      state = {state: NOT_FIELD, start: 0, length: 0},
      row = [];
    if (string.length === 0) {
      return [];
    }
    for (i = 0; i <= string.length; i++) {
      currentChar = i < string.length ? string[i] : undefined;
      if (state.state === NOT_FIELD) {
        if (i === string.length || currentChar === ',') {
          row.push('');
          state.state = NOT_FIELD;
          state.start = i;
          state.end = 0;
        } else if (currentChar === '"') {
          state.state = FIELD_ESCAPED;
          state.start = i + 1;
          state.length = 0;
        } else {
          state.state = FIELD;
          state.start = i;
          state.length = 1;
        }
      } else if (state.state === FIELD) {
        if (i === string.length || currentChar === ",") {
          row.push(string.slice(state.start, state.start + state.length));
          state.state = NOT_FIELD;
          state.start = i;
          state.length = 0;
        } else {
          state.length++;
        }
      } else if (state.state === FIELD_ESCAPED) {
        if (i === string.length) {
          row.push(string.slice(state.start, state.start + state.length).replace(/""/g, '"'));
          state.state = NOT_FIELD;
          state.start = i;
          state.length = 0;
        } else if (currentChar === '"') {
          state.state = FIELD_ESCAPED_QUOTE;
        } else {
          state.length++;
        }
      } else if (state.state === FIELD_ESCAPED_QUOTE) {
        if (i === string.length || currentChar === ',') {
          row.push(string.slice(state.start, state.start + state.length).replace(/""/g, '"'));
          state.state = NOT_FIELD;
          state.start = i;
          state.length = 0;
        } else {
          state.state = FIELD_ESCAPED;
          state.length += 2;
        }
      }
    }
    return row;
  },
  findExecutable: (function () {
    var execIndex = {};
    return function (exec, cache, callback) {
      if (cache instanceof Function) {
        callback = cache;
        cache = true;
      }
      if (execIndex[exec]) {
        return  callback(null, execIndex[exec]);
      }
      ChildProcess.exec('which \'' + exec.replace('\'', '\\\'') + '\'', function (error, stdout, stderr) {
        if (error || stderr.length) {
          return callback(error || stderr.toString());
        }
        if (!stdout.length) {
          return callback(new Error(exec + "is not found. install it"));
        }
        if (cache) {
          execIndex[exec] = stdout.toString().trim();
        }
        callback(null, stdout.toString().trim());
      });
    };
  })()

};
module.exports.instance = function () {
  return Helpers;
};
