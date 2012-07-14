exports.instance = function () {
  var Test =  function () {
    this.childField = 'bar';
    this.__base();
  };
  Test.prototype = {
    get8: function () {
      return 8;
    },
    get5plus6plus9: function () {
      return this.get5plus6() + 9;
    }
  };
  return Test;
};
