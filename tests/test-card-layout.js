'use strict';

var assert = require('assert');
var CardLayout = require('../app/card-layout');

assert.deepStrictEqual(CardLayout.metrics(100), {
  width: 248,
  imageHeight: 370,
  captionHeight: 104,
  height: 474,
  columnStep: 272,
  rowStep: 494
}, '100% must preserve the current poster dimensions');

assert.deepStrictEqual(CardLayout.metrics(70), {
  width: 174,
  imageHeight: 259,
  captionHeight: 73,
  height: 332,
  columnStep: 190,
  rowStep: 346
}, 'poster geometry must scale as one unit');

assert.strictEqual(CardLayout.columns(1612, 100), 5, 'the current Home poster size must become the shared 100% baseline');
assert.strictEqual(CardLayout.columns(1612, 70), 8, 'smaller posters must expose more columns');
assert.strictEqual(CardLayout.columns(1612, 130), 4, 'larger posters must expose fewer columns');


var profile100 = CardLayout.profile(100);
assert.strictEqual(CardLayout.profile(100), profile100, 'a supported scale must reuse one immutable layout profile');
assert.strictEqual(CardLayout.metrics(100), profile100.metrics, 'metrics must be the cached profile metrics');
assert.strictEqual(CardLayout.wideMetrics(100), profile100.wideMetrics, 'wide metrics must be the cached profile metrics');
assert.deepStrictEqual(profile100.poster, {
  width: 248,
  height: 370,
  previewWidth: 64,
  previewHeight: 96
}, 'the shared profile must include fixed poster and preview dimensions');
assert.deepStrictEqual(profile100.widePoster, {
  width: 338,
  height: 190,
  previewWidth: 96,
  previewHeight: 54
}, 'the shared profile must include fixed wide artwork dimensions');
assert.strictEqual(CardLayout.profile(999), profile100, 'unsupported scales must reuse the 100% profile');
if (Object.isFrozen) {
  assert.strictEqual(Object.isFrozen(profile100), true, 'layout profiles must be immutable when the runtime supports Object.freeze');
  assert.strictEqual(Object.isFrozen(profile100.metrics), true, 'cached metrics must be immutable');
}

console.log('Card layout checks passed');
