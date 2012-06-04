/**
 * This service if using to run all *.test.js files in project in jasmine context
 *
 * default jasmine reporter does not hightlight colors,
 * that`s why console.log is redefined.
 */
var fs = require('fs'),
  vm = require('vm'),
  util = require('util'),
  jasmine = require('jasmine-node'),
  jasmineEnv = jasmine.getEnv(),
  reporter = new (jasmine.ConsoleReporter)(),
  context = {
    require: require
  },
  key,
  localLog = console.log;
console.log = function () {
  var st = util.format.apply(util, arguments),
    match,
    red = '\u001b[91m',
    nc = '\u001b[0m';
  match = st.match(/(\d+)\s+of\s+(\d+)/);
  if (match && match[1] !== match[2]) {
    st = red + st + nc;
  }
  st = st.replace('Failed', red + 'Failed' + nc);
  localLog(st);
};
var findAll = function (dir, re) {
  var files,
    finded = [];
  if ((/node_modules|\.git|\.svn/).test(dir)) {
    return [];
  }
  dir = (/\/$/).test(dir) ? dir : dir + '/';
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  files.forEach(function (file) {
    if (re.test(file)) {
      finded.push(dir + file);
    }
    finded = finded.concat(findAll(dir + file, re));
  });
  return finded;
};
for (key in jasmineEnv) {
  context[key] = jasmineEnv[key];
}
for (key in global) {
  context[key] = global[key];
}
console.log('Testing:');
findAll(__dirname + '/../../', /\w+\.test\.js$/)
  .forEach(function (file) {
    console.log('  ', file);
    var content = fs.readFileSync(file, 'UTF-8');
    vm.runInNewContext(content, context);
  });
jasmineEnv.addReporter(reporter);
jasmineEnv.execute();
