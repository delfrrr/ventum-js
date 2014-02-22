var Domain = require('domain'),
  Util = require('util'),
  EventEmitter = require('events').EventEmitter;

var RequestCtx = function (domain, params) {
  EventEmitter.call(this);
  this._domain = domain;
  this._uniqId = this._getUniqId();
  if (params) {
    this._params = params;
    this._inheritUid = params.request.query.marker || null;
    params.request.bindToDomain(domain);
    params.response.bindToDomain(domain);
  }
  domain.on('error', this.emit.bind(this, 'error'));
};
Util.inherits(RequestCtx, EventEmitter);
RequestCtx.prototype._getUniqId = function () {
  return Math.round(Math.random() * 1e9).toString();
};
RequestCtx.prototype.bind = function (fcn) {
  return this._domain.bind(fcn);
};
RequestCtx.prototype.getUniqId = function () {
  return this._uniqId;
};
RequestCtx.prototype.getInheritedId = function () {
  return this._inheritUid;
};
RequestCtx.prototype.getParams = function () {
  return this._params;
};
RequestCtx.init = function (params) {
  var domain = Domain.create();
  domain.enter();
  domain._ctx = new RequestCtx(domain, params);
  return domain._ctx;
};
RequestCtx.get = function () {
  return  Domain.active && Domain.active._ctx;
};

var RequestCtxFabric = function () {
  //Fake global ctx
  var domain = Domain.create();
  domain.enter();
  domain.isGlobal = true;
  this._globalCtx = new RequestCtx(domain, null);
};
RequestCtxFabric.prototype = {
  init: function (params) {
    return RequestCtx.init(params);
  },
  getCtx: function () {
    return RequestCtx.get() || this._globalCtx;
  }
};
module.exports.instance =  function () {
  return RequestCtxFabric;
};
