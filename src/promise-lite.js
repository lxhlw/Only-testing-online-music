(function (global) {
  'use strict';

  if (typeof global.Promise === 'function') return;

  var schedule = typeof global.setTimeout === 'function'
    ? function (fn) { global.setTimeout(fn, 0); }
    : function (fn) { fn(); };

  function isFunction(value) {
    return typeof value === 'function';
  }

  function isObject(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function');
  }

  function PromiseLite(executor) {
    if (!(this instanceof PromiseLite)) {
      throw new TypeError('Promises must be constructed via new');
    }
    if (!isFunction(executor)) {
      throw new TypeError('Promise resolver is not a function');
    }

    var self = this;
    var state = 0;
    var value;
    var handlers = [];

    function reject(reason) {
      if (state) return;
      state = 2;
      value = reason;
      schedule(flush);
    }

    function fulfill(result) {
      if (state) return;
      state = 1;
      value = result;
      schedule(flush);
    }

    function resolve(result) {
      var then;
      if (state) return;
      if (result === self) {
        reject(new TypeError('A promise cannot resolve itself'));
        return;
      }

      if (isObject(result)) {
        try {
          then = result.then;
        } catch (e) {
          reject(e);
          return;
        }
        if (isFunction(then)) {
          var called = false;
          try {
            then.call(
              result,
              function (nextValue) {
                if (called) return;
                called = true;
                resolve(nextValue);
              },
              function (reason) {
                if (called) return;
                called = true;
                reject(reason);
              }
            );
          } catch (e2) {
            if (!called) {
              called = true;
              reject(e2);
            }
          }
          return;
        }
      }

      fulfill(result);
    }

    function handle(handler) {
      var callback = state === 1 ? handler.onFulfilled : handler.onRejected;
      if (!isFunction(callback)) {
        if (state === 1) handler.resolve(value);
        else handler.reject(value);
        return;
      }

      try {
        handler.resolve(callback(value));
      } catch (e) {
        handler.reject(e);
      }
    }

    function flush() {
      var queue;
      if (!state) return;
      queue = handlers.slice();
      handlers.length = 0;
      for (var i = 0; i < queue.length; i += 1) handle(queue[i]);
    }

    this.then = function (onFulfilled, onRejected) {
      return new PromiseLite(function (resolveNext, rejectNext) {
        handlers.push({
          onFulfilled: onFulfilled,
          onRejected: onRejected,
          resolve: resolveNext,
          reject: rejectNext
        });
        if (state) schedule(flush);
      });
    };

    this['catch'] = function (onRejected) {
      return this.then(null, onRejected);
    };

    this['finally'] = function (onFinally) {
      return this.then(
        function (value) {
          return PromiseLite.resolve(
            isFunction(onFinally) ? onFinally() : undefined
          ).then(function () { return value; });
        },
        function (reason) {
          return PromiseLite.resolve(
            isFunction(onFinally) ? onFinally() : undefined
          ).then(function () { throw reason; });
        }
      );
    };

    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }

  PromiseLite.resolve = function (value) {
    if (value instanceof PromiseLite) return value;
    return new PromiseLite(function (resolve) { resolve(value); });
  };

  PromiseLite.reject = function (reason) {
    return new PromiseLite(function (resolve, reject) { reject(reason); });
  };

  PromiseLite.all = function (items) {
    return new PromiseLite(function (resolve, reject) {
      var list;
      var remaining;
      var results;

      if (items == null) {
        reject(new TypeError('Promise.all expects an array-like value'));
        return;
      }

      try {
        list = Array.prototype.slice.call(items);
      } catch (e) {
        reject(e);
        return;
      }

      remaining = list.length;
      results = new Array(remaining);

      if (!remaining) {
        resolve(results);
        return;
      }

      function resolveOne(index, value) {
        PromiseLite.resolve(value).then(function (result) {
          results[index] = result;
          remaining -= 1;
          if (!remaining) resolve(results);
        }, reject);
      }

      for (var i = 0; i < list.length; i += 1) {
        resolveOne(i, list[i]);
      }
    });
  };

  global.Promise = PromiseLite;
})(window);
