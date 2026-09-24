'use strict';

var assert = require('assert');
var MediaSourcePreference = require('../app/media-source-preference');

function storage() {
  var data = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
    dump: function () { return data; }
  };
}

(function () {
  var store = storage();
  var pref = MediaSourcePreference.create({ storage: store });
  assert.strictEqual(pref.get('plex://movie/1'), '', 'missing source preference must be empty');
  pref.set('plex://movie/1', 'server-b');
  assert.strictEqual(pref.get('plex://movie/1'), 'server-b', 'source preference must persist by stable media GUID');
  pref.set('plex://movie/1', '');
  assert.strictEqual(pref.get('plex://movie/1'), '', 'empty server must clear source preference');
})();

(function () {
  var store = storage();
  var pref = MediaSourcePreference.create({ storage: store });
  pref.set('plex://movie/2', 'server-b');
  var raw = store.dump()[MediaSourcePreference.STORAGE_KEY] || '';
  assert.ok(raw.indexOf('server-b') !== -1, 'stable server identifier must be stored');
  assert.ok(raw.indexOf('token') === -1 && raw.indexOf('http') === -1, 'source preference storage must not contain transport credentials or URLs');
})();

console.log('media source preference tests passed');
