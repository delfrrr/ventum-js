exports.cls = function () {
  var Test = function (num) {
    this.childField = num;
    this.__base(num);
  };
  Test.prototype = {
    get4: function () {
      return 4;
    }
  };
  return Test;
};
