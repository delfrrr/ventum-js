exports.instance = function () {
  var Test = function () {
    this.parentField = 'bar';
  };
  Test.prototype = {
    CHILD: 'child',
    REDEFINDED: 'not so good',
    get1: function () {
      return 1;
    },
    get3instead2: function () {
      return 2;
    },
    get5plus6: function () {
      return 5;
    },
    get5plus6plus8: function () {
      return this.get5plus6() + 8;
    },
    noBase: function () {
      return this.__base();
    }
  };
  return Test;
};
