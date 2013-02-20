/**
 * Create new instance of Lib.
 * Lib is Abstract Factory.
 * It load all libs from lib`s folder (config),
 *
 * @constructor
 * @return {object} this for chain
 */
var fs = require('fs');
var Path = require('path');
var LibClass = function (app, service) {
  this._libs = {};
  this._levels = [];
  this._levelFolders = {};
  this._getLevels(app, service);
  this._viewLevelsContents();
  return this;
};
LibClass.prototype = {
  MOD_SEPARATOR: '_',
  _getLevels: function (app, service) {
    this._levels = [
      __dirname + '/',
      app + '/libs/',
      app + '/conf/',
      app + '/conf/local/',
      service + '/libs/',
      service + '/conf/',
      service + '/conf/local/'
    ];
  },
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
      face = this.get.bind(this),
      fileArr = this._levelFolders[level];
    if (fileArr.indexOf(name + '.js') === -1) {
      if (fileArr.indexOf(name) === -1) {
        return;
      }
      if (!fs.statSync(level + name).isDirectory()) {
        return;
      }
    }
    lib = require(level + name);
    if (lib.instance instanceof Function) {
      lib = lib.instance(face);
      libObj.type = libObj.type || 'instance';
    } else if (lib.cls instanceof Function) {
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
  _mergeJSON: function (first, second) {
    var result = {};
    if (typeof first !== typeof second ||
        typeof first === 'number' ||
        typeof first === 'string' ||
        typeof first === 'boolean' ||
        second instanceof Array) {
      return second;
    }
    Object.keys(first).forEach(function (key) {
      if (typeof second[key] === 'undefined') {
        result[key] = first[key];
        return;
      }
      if (typeof first[key] !== 'object') {
        result[key] = second[key];
      } else {
        result[key] = this._mergeJSON(first[key], second[key]);
      }
    }.bind(this));
    Object.keys(second).forEach(function (key) {
      if (typeof result[key] === 'undefined') {
        result[key] = second[key];
      }
    });
    return result;
  },
  /* when merging handle parent classes of current. that's implemented
   * only for classes  inherited with util.inherit (util inherit produces super_
   * property, and it is used to understand if there are parents, and to get parent's
   * prototype)
   * */
  _mergeSuper: function (dstPrototype, source) {
    if (source instanceof Function && source.super_ instanceof Function) {
      this._mergeSuper(dstPrototype, source.super_);
      Object.getOwnPropertyNames(source.super_.prototype).forEach(function (key) {
        dstPrototype[key] = source.super_.prototype[key];
      });
    }
  },
  _mergeSecond: function (dstPrototype, first, second) {
    var diff = second.prototype || second,
      key;
    if (second instanceof Function) {
      this._mergeSuper(dstPrototype, second);
    }
    for (key in diff) {
      if (diff[key] instanceof Function) {
        dstPrototype[key] = this._extendProtoMethod(first, diff, key);
        continue;
      }
      dstPrototype[key] = this._mergeJSON(dstPrototype[key], diff[key]);
    }
  },
  _merge: function (first, second) {
    var constructor,
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
    for (key in first) {
      constructor[key] = first[key];
    }
    for (key in second) {
      constructor[key] = second[key];
    }
    this._mergeSecond(constructor.prototype, first, second);
    return constructor;
  },
  _include: function (name, mods) {
    var libObj = {
      type: false,
      arr: []
    },
      Result = function () {},
      fullName = this._getFullName(name, mods);
    Result.prototype = {};
    Result._original = true;
    //at first load main module from all override levels
    this._levels.forEach(function (level) {
      this._require(libObj, level, name);
    }.bind(this));
    //at second, load all it's mods from all override levels
    this._levels.forEach(function (level) {
      mods.forEach(function (mod) {
        this._require(libObj, level, name + this.MOD_SEPARATOR + mod);
      }.bind(this));
    }.bind(this));
    if (!libObj.arr.length) {
      throw new Error('Can not find module "' + name + '"');
    }
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
/* Export LibClass get function to the outer world.
 * That is done in a little bit tricky way:
 * at first instance of LibClass is created,
 * and then, use it to load LibClass definition, with overridings from
 * all defined override levels
 * That gives posibility to override it's behaviour, for every custom project.
 * Also export some information about path to application, path to current service file,
 * path to all services folder, and so on
 * */
LibClass.createInstance = function () {
  var match,
    parent,
    service,
    serviceSubfolder,
    app,
    initialInstance,
    finalInstance;
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
  serviceSubfolder = match[2];
  module.exports.cls = function () {
    return LibClass;
  };
  initialInstance = new LibClass(app, service);
  finalInstance = new (initialInstance.get('lib'))(app, service);
  module.exports = finalInstance.get.bind(finalInstance);
  module.exports.app = app;
  module.exports.services = app + '/services/';
  module.exports.service = service;
  module.exports.serviceFolder = serviceSubfolder;
  module.exports.serviceFile = Path.basename(process.mainModule.filename, Path.extname(process.mainModule.filename));
};
LibClass.createInstance();
