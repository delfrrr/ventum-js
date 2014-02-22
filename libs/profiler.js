var Lib = require('ventum');
var RequestCtx = Lib('request-ctx');
var TickProfiler = Lib('tick-profiler');

var RequestProfile = function () {
  this._profile = [];
};
RequestProfile.prototype = {
  begin: function () {
    this._start = Date.now();
    this._tickMeausurePoint = TickProfiler.getMeasurePoint();

    this.message({type: 'start', time: this._start});
  },
  end: function () {
    var end = Date.now(),
      ticks = TickProfiler.count(this._tickMeausurePoint);
    this.message({type: 'end', time: end, duration: end - this._start, ticks: ticks});
  },
  message: function (msg) {
    this._profile.push(msg);
  },
  get: function () {
    return this._profile;
  }
};

var Profiler = function () {
};
Profiler.prototype = {
  _getProfileInstance: function () {
    var ctx = RequestCtx.getCtx();
    if (!ctx._profiler) {
      ctx._profiler = new RequestProfile();
    }
    return ctx._profiler;
  },
  begin: function () {
    this._getProfileInstance().begin();
  },
  end: function () {
    this._getProfileInstance().end();
  },
  message: function (msg) {
    this._getProfileInstance().message(msg);
  },
  get: function () {
    return this._getProfileInstance().get();
  }
};
module.exports.instance = function () {
  return Profiler;
};
