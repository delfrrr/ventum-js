exports.cls = function () {
  var Test = function (num) {
    this.parentField = num / 2;
  };
  Test.prototype = {
    get1: function () {
      return 1;
    }
  };
  return Test;
};
