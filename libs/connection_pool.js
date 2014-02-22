var Vow = require('vow');
var Lib = require('ventum');
var Console = Lib('console');
/**
 * Simple pool library. Provides resources pooling.
 * @constructor
 * @param {Number} size Pool size
 * @param {Function} allocatorAsync function that creates new
 * pooled item in asyncronous way
 * @param {Function} allocatorSync function that creates new
 * pooled item in synchronous way
 */
var Pool = function (size, allocatorAsync, allocatorSync) {
	this._size = size < 1 ? 1 : size;
	this._pool = [];
	this._allocatorAsync = allocatorAsync;
	this._allocatorSync = allocatorSync;
  this._checkUVThreadPool();
};

Pool.prototype = {

  //default size of libuv's thread pool
  //(as for node  <= 0.10 libuv has fixed size)
  DEFAULT_UV_THREADPOOL_SIZE: 4,

  _checkUVThreadPool: function () {
    var threadPoolSize = Number(process.env['UV_THREADPOOL_SIZE']) || this.DEFAULT_UV_THREADPOOL_SIZE;
    if (threadPoolSize <= this._size) {
      Console.log(
        'For correct work of connection pooling libuv\'s thread pool should be correctly set.',
        'It\'s size shoud be pool size + 1-5.',
        'Use UV_THREADPOOL_SIZE environment variable to set it'
      );
    }
  },

	/**
	 * Get item from pool in syncronous way
	 * @returns {Object}
	 */
	getSync: function () {
		var newItem,
			newIndex = this._pool.reduce(function (lessUsedItem, poolItem, poolItemIndex) {
			if (poolItem.item &&
				(lessUsedItem === false || poolItem.count < this._pool[lessUsedItem].count)) {
				return poolItemIndex;
			}
			return lessUsedItem;
		}.bind(this), false);
		if ((newIndex === false || this._pool[newIndex].count !== 0) && this._pool.length < this._size) {
			newItem = {
				count: 1,
				item: this._allocatorSync()
			};
			newItem.itemPromise = Vow.fulfill(newItem.item);
			if (!newItem.item) {
				return new Error('can not connect');
			}
			this._pool.push(newItem);
			return newItem.item;
		}
		if (newIndex !== false) {
			return this._pool[newIndex].item;
		}
		return new Error('can not get apropriate pool item in syncronous way');
	},

	/**
	 * Get item from pool in syncronous way
	 * @returns {Object}
	 */
	getAsync: function () {
		var newItem,
			newIndex = this._pool.reduce(function (lessUsedItem, poolItem, poolItemIndex) {
				if (lessUsedItem === false || poolItem.count < this._pool[lessUsedItem].count) {
					return poolItemIndex;
				}
				return lessUsedItem;
			}.bind(this), false);
		if ((newIndex === false || this._pool[newIndex].count !== 0) && this._pool.length < this._size) {
			newItem = {
				count: 1,
				itemPromise: this._allocatorAsync().then(function (item) {
					newItem.item = item;
					return Vow.resolve(item);
				}).fail(function (error) {
					this._pool = this._pool.filter(function (pooledItem) {
						return pooledItem !== newItem;
					});
					return Vow.reject(error);
				}.bind(this))
			};
			this._pool.push(newItem);
			return newItem.itemPromise;
		}
		if (newIndex !== false) {
			this._pool[newIndex].count++;
			return this._pool[newIndex].itemPromise;
		}
		return Vow.reject(new Error('pool is zero sized'));
	},

	/**
	 * Free used pool item
	 * @param {Object} item
	 */
	free: function (item) {
		this._pool.forEach(function (pooledItem) {
			if (item === pooledItem.item) {
				pooledItem.count --;
			}
		});
	},

	/**
	 * Remove item from pool.
	 * usefull, for example, when item is known to be
   * broken
   * @param {Object} item
	 */
	remove: function (item) {
		this._pool = this._pool.filter(function (pooledItem) {
			return item !== pooledItem.item;
		});
	}
};
module.exports.cls = function () {
  return Pool;
};
