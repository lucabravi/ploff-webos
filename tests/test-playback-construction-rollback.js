'use strict';
var assert = require('assert');
var harness = require('./helpers/playback-controller-harness').harness;
['video', 'network'].forEach(function (failure) {
  var original = new Error('construction ' + failure);
  var active = {};
  var root;
  assert.throws(function () {
    harness({ prepare: function (options) {
      root = options.root;
      var add = options.video.addEventListener;
      var remove = options.video.removeEventListener;
      options.video.addEventListener = function (name, callback) {
        if (failure === 'video' && name === 'seeked') { throw original; }
        active[name] = callback;
        add(name, callback);
      };
      options.video.removeEventListener = function (name, callback) {
        delete active[name];
        remove(name, callback);
        if (name === 'seeking') { throw new Error('one detach failed'); }
      };
      options.document.addEventListener = function (name, callback) { active[name] = callback; };
      options.document.removeEventListener = function (name) { delete active[name]; };
      options.subscribeNetwork = function () { throw original; };
    } });
  }, function (error) { return error === original; });
  assert.deepStrictEqual(Object.keys(active), [], 'failed Playback construction must detach all earlier bindings despite one cleanup error');
  assert.strictEqual(root.timeoutCount(), 0);
  assert.strictEqual(root.intervalCount(), 0);
});
console.log('Playback constructor event rollback checks passed');
