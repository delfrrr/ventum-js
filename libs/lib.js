/**
 * Create new instance of Lib.
 * Lib is Abstract Factory.
 * It load all libs from lib`s folder (config),
 *
 * @constructor
 * @return {object} this for chain
 */
var fs = require('fs'),
  parent,
  match,
  service,
  app,
  instance,
  LibClass;
LibClass = function (app, service) {
  this._libs = {};
  this._levels = [];
  this._levelFolders = {};
  this._levels = [
    __dirname + '/',
    app + '/libs/',
    app + '/conf/current/',
    service + '/libs/',
    service + '/conf/current/'
  ];
  this._viewLevelsContents();
  return this;
};
LibClass.prototype = {
  MOD_SEPARATOR: '_',
  _viewLevelsContents: function () {
    this._levels.forEach(function (path) {
      try {
        this._levelFolders[path] = fs.readdirSync(path);
      } catch (e) {
        this._levelFolders[path] = [];
      }
    }.bind(this));
  },
  _getFullName: function (name, mods) {
    return name + this.MOD_SEPARATOR + mods.join();
  },
  _require: function (libObj, level, name) {
    var lib,
      face = this.get.bind(this);
    if (this._levelFolders[level].indexOf(name + '.js') === -1) {
      return;
    }
    lib = require(level + name);
    if (lib.instance instanceof Function) {
      lib = lib.instance(face);
      libObj.type = libObj.type || 'instance';
    }
    if (lib.cls instanceof Function) {
      lib = lib.cls(face);
      libObj.type = libObj.type || 'class';
    }
    libObj.arr.push(lib);
  },
  _extendProtoMethod: function (original, mod, key) {
    return function () {
      var savedBase = this.__base,
        result;
      this.__base = original.prototype[key] ||
        function () {
          throw new Error('Method "' + key + '" have no __base');
        };
      result = mod[key].apply(this, arguments);
      this.__base = savedBase;
      return result;
    };
  },
  _merge: function (first, second) {
    var diff = second.prototype || second,
      constructor,
      key;
    if (second instanceof Function) {
      constructor = function () {
        var savedBase = this.__base,
          result;
        this.__base = first;
        result = second.apply(this, arguments);
        this.__base = savedBase;
        return result;
      };
    } else {
      constructor = first;
    }
    for (key in first.prototype) {
      constructor.prototype[key] = first.prototype[key];
    }
    for (key in diff) {
      if (diff[key] instanceof Function) {
        constructor.prototype[key] = this._extendProtoMethod(first, diff, key);
        continue;
      }
      constructor.prototype[key] = diff[key];
    }
    return constructor;
  },
  _include: function (name, mods) {
    var libObj = {
      type: false,
      arr: []
    },
      Result = function () {},
      lib,
      fullName = this._getFullName(name, mods),
      instance;
    Result.prototype = {};
    Result._original = true;
    this._levels.forEach(function (level) {
      this._require(libObj, level, name);
      mods.forEach(function (mod) {
        this._require(libObj, level, name + this.MOD_SEPARATOR + mod);
      }.bind(this));
    }.bind(this));
    libObj.arr.forEach(function (piece) {
      Result = this._merge(Result, piece);
    }.bind(this));
    // deny to call instance.__base();
    Result.prototype.__base = function () {
      throw new Error('Cant call __base ouside the class');
    };
    Result.prototype.__base._original = true;
    if (libObj.type === 'instance') {
      Result = new Result();
      return (this._libs[fullName] = Result);
    }
    return (this._libs[fullName] = Result);
  },
  _getMods: function (mods) {
    return mods instanceof Array ? mods : (mods ? [mods] : []);
  },
  /**
   * Geting instance or class of lib if it exist.
   * If it not, it will be created
   * creating was successfull, lib will stored.
   * If lib defined with module.exports.instance 
   * it will be stored as singletone.
   * If lib defined with modele.exports.cls
   * it will be stored as class.
   * First definition overvrite others.
   * (if parent lib defined as instance you cant change it in mod)
   *
   * @param {string} name Name of lib
   * @param {string|array.<string>} [mods] if required load lib with mods
   * @return {object} instance or class of lib or null if lib does not exitst
   */
  get: function (name) {
    var mods = Array.prototype.splice.call(arguments, 1),
      fullName = this._getFullName(name, mods);
    return this._libs[fullName] || this._include(name, mods);
  }
};
// geting application and service folders
parent = module;
while (parent.parent) {
  parent = parent.parent;
}
match = parent.filename.match(/(.*)\/services\/([^\/]+)/);
if (!match) {
  throw new Error('Allowed to call "ventum" only insine service');
}
service = match[0];
app = match[1];
instance = new LibClass(app, service);
module.exports = instance.get.bind(instance);
