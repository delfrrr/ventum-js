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
    return Object.keys(argv).map(function (element) {
      if (argv[element] === true) {
        return element;
      }
      return element + '=' + argv[element];
    });
  }
};
module.exports.instance = function (Lib) {
  return Helpers;
};
