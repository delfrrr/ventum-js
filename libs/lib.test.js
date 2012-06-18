var Lib = require('./../../libs/lib'),
  instance = Lib('lib.test.instance', 'child'),
  instanceDoubleChild = Lib('lib.test.instance', 'child', 'another-child'),
  Class = Lib('lib.test.class', 'child');
describe('Lib: simple merge', function () {
  it('checking parent method', function () {
    expect(instance.get1()).toEqual(1);
  });
  it('checking child method', function () {
    expect(instance.get4()).toEqual(4);
  });
  it('checking redefinded method', function () {
    expect(instance.get3instead2()).toEqual(3);
  });
  it('checking parent constant field', function () {
    expect(instance.PARENT).toEqual('parent');
  });
  it('checking child constant field', function () {
    expect(instance.CHILD).toEqual('child');
  });
  it('checking redefinded constant field', function () {
    expect(instance.REDEFINDED).toEqual('good');
  });
});
describe('Lib: constructor merge', function () {
  it('field created by parent constructor', function () {
    expect(instance.parentField).toEqual('bar');
  });
  it('field created by child constructor (calling of __base)', function () {
    expect(instance.childField).toEqual('bar');
  });
});
describe('Lib: ussage of __base', function () {
  it('calling inside child method', function () {
    expect(instance.get5plus6()).toEqual(11);
  });
  it('calling __base inside method wich calling by another method (child)', function () {
    expect(instance.get5plus6plus7()).toEqual(18);
  });
  it('calling __base inside method wich calling by another method (parent)', function () {
    expect(instance.get5plus6plus8()).toEqual(19);
  });
});
describe('Lib: disallow usage of __base', function () {
  it('__base of constructor (outside the class)', function () {
    expect(instance.__base).toThrow('Cant call __base ouside the class');
  });
  it('calling __base inside parent method', function () {
    expect(instance.noBase).toThrow('Method "noBase" have no __base');
  });
});
describe('Lib: child of child', function () {
  it('child method', function () {
    expect(instanceDoubleChild.get8()).toEqual(8);
  });
  it('parent method', function () {
    expect(instanceDoubleChild.get4()).toEqual(4);
  });
  it('grandpa method', function () {
    expect(instanceDoubleChild.get1()).toEqual(1);
  });
  it('__base inside __base', function () {
    expect(instanceDoubleChild.get5plus6plus9()).toEqual(20);
  });
});
describe('Lib: ussage of classes', function () {
  var obj = new Class(44);
  it('constructor argument', function () {
    expect(obj.childField).toEqual(44);
  });
  it('constructor argument in __base', function () {
    expect(obj.parentField).toEqual(22);
  });
});
