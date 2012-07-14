exports.instance = function () {
  var Test =  function () {
    this.childField = 'bar';
    this.__base();
  };
  Test.prototype = {
    PARENT: 'parent',
    REDEFINDED: 'good',
    get4: function () {
      return 4;
    },
    get3instead2: function () {
      return 3;
    },
    get5plus6: function () {
      return this.__base() + 6;
    },
    get5plus6plus7: function () {
      return this.get5plus6() + 7;
    }
  };
  return Test;
};
