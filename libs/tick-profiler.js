var TickProfiler  = function (intervalDuration) {
  intervalDuration = intervalDuration || this.DEFAULT_TICK_INTERVAL;
  this._ticks = 0;
  this._intervalDuration = intervalDuration;
  this._interval = setInterval(function () {
    this._ticks++;
  }.bind(this), this._intervalDuration);
};
TickProfiler.prototype = {
  DEFAULT_TICK_INTERVAL: 10,

  getMeasurePoint: function () {
    return {
      ticks: this._ticks,
      timestamp: Date.now()
    };
  },

  count: function (measurePoint) {
    var ticksDiff = this._ticks - measurePoint.ticks,
      timeDiff = Date.now() - measurePoint.timestamp,
      ticksTime = ticksDiff * this._intervalDuration;
    return {
      ticks: ticksDiff,
      ticksTime: ticksTime,
      wallClockTime: timeDiff,
      timeLost: timeDiff - ticksTime,
      timeIrreality: 2 * (timeDiff - ticksTime) / (timeDiff + ticksTime)
    };
  }
};
module.exports.instance = function () {
  return TickProfiler;
};
