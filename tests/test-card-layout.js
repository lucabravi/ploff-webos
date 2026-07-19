'use strict';

var assert = require('assert');
var CardLayout = require('../shell/card-layout');

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

console.log('Card layout checks passed');
