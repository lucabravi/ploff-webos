'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var workerPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.js');
var workerSource = fs.readFileSync(workerPath, 'utf8');

function bigEndianUint32Array(buffer) {
  var bytes = new Uint8Array(buffer);
  var view = {};
  Object.defineProperty(view, '0', {
    set: function (value) {
      bytes[0] = value >>> 24 & 255;
      bytes[1] = value >>> 16 & 255;
      bytes[2] = value >>> 8 & 255;
      bytes[3] = value & 255;
    }
  });
  return view;
}

function blendSnippet() {
  var start = workerSource.indexOf('self.PloffAssCanPackRgba=');
  var buildStart = workerSource.indexOf('self.buildResult=function');
  var end = workerSource.indexOf('if(typeof SDL', buildStart);
  assert.notStrictEqual(start, -1, 'generated worker must expose the guarded packed-RGBA capability probe');
  assert.notStrictEqual(buildStart, -1, 'generated worker must retain buildResult');
  assert.ok(start >= buildStart && end > start, 'packed-RGBA helpers must live beside the js-blend hot path');
  return workerSource.slice(buildStart, end);
}

function createRuntime(heap, options) {
  var sandbox = {
    self: {},
    Module: { HEAPU8: heap },
    ArrayBuffer: ArrayBuffer,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Uint32Array: options && options.Uint32Array !== undefined ? options.Uint32Array : Uint32Array,
    Object: Object,
    String: String,
    Math: Math
  };
  vm.createContext(sandbox);
  vm.runInContext(blendSnippet(), sandbox, { filename: 'ass-js-blend-hot-path.js' });
  return sandbox;
}

function referenceItem(ptr, heap) {
  var bitmap = ptr.bitmap;
  var stride = ptr.stride;
  var w = ptr.w;
  var h = ptr.h;
  var color = ptr.color;
  var r = color >> 24 & 255;
  var g = color >> 16 & 255;
  var b = color >> 8 & 255;
  var a = 255 - (color & 255);
  var result = new Uint8ClampedArray(4 * w * h);
  var bitmapPosition = 0;
  var resultPosition = 0;
  var y;
  var x;
  var k;
  for (y = 0; y < h; y += 1) {
    for (x = 0; x < w; x += 1) {
      k = heap[bitmap + bitmapPosition + x] * a / 255;
      result[resultPosition] = r;
      result[resultPosition + 1] = g;
      result[resultPosition + 2] = b;
      result[resultPosition + 3] = k;
      resultPosition += 4;
    }
    bitmapPosition += stride;
  }
  return result;
}

function bytes(buffer) {
  return Array.prototype.slice.call(new Uint8Array(buffer));
}

function assertItemEquivalent(runtime, ptr, heap, label) {
  var actual = runtime.self.buildResultItem(ptr);
  var expected = referenceItem(ptr, heap);
  assert.deepStrictEqual(bytes(actual.buffer), Array.prototype.slice.call(expected), label);
  assert.strictEqual(actual.w, ptr.w, label + ': width');
  assert.strictEqual(actual.h, ptr.h, label + ': height');
  assert.strictEqual(actual.x, ptr.dst_x, label + ': x');
  assert.strictEqual(actual.y, ptr.dst_y, label + ': y');
}

(function testPackedAndFallbackPathsAreByteEquivalent() {
  var heap = new Uint8Array(128);
  var values = [0, 1, 2, 3, 127, 128, 129, 254, 255, 17, 33, 65, 99, 131, 201];
  var offset = 11;
  var i;
  var runtime;
  var ptr;
  for (i = 0; i < values.length; i += 1) { heap[offset + i] = values[i]; }
  ptr = {
    ptr: 1,
    bitmap: offset,
    stride: 5,
    w: 3,
    h: 3,
    color: (0x12 << 24 | 0x34 << 16 | 0x56 << 8 | 0x7f) >>> 0,
    dst_x: 23,
    dst_y: 41,
    next: { ptr: 0 }
  };

  runtime = createRuntime(heap);
  assert.strictEqual(runtime.self.PloffAssUsePackedPixels, true, 'little-endian typed arrays should enable the packed Uint32 fast path');
  assertItemEquivalent(runtime, ptr, heap, 'packed partial-alpha output must match upstream byte-for-byte');

  runtime.self.PloffAssUsePackedPixels = false;
  assertItemEquivalent(runtime, ptr, heap, 'byte fallback must match upstream byte-for-byte');
}());

(function testAlphaExtremesAndStridePadding() {
  var heap = new Uint8Array(96);
  var offset = 7;
  var runtime = createRuntime(heap);
  var opaque;
  var transparent;
  heap.set([0, 255, 37, 99, 200, 77, 66, 55, 44, 33, 22, 11], offset);
  opaque = { ptr: 1, bitmap: offset, stride: 6, w: 4, h: 2, color: 0xa1b2c300 >>> 0, dst_x: 0, dst_y: 0, next: { ptr: 0 } };
  transparent = { ptr: 1, bitmap: offset, stride: 6, w: 4, h: 2, color: 0xa1b2c3ff >>> 0, dst_x: 0, dst_y: 0, next: { ptr: 0 } };
  assertItemEquivalent(runtime, opaque, heap, 'alpha=255 and padded stride must remain exact');
  assertItemEquivalent(runtime, transparent, heap, 'alpha=0 and padded stride must remain exact');
}());

(function testEveryCoverageAndAlphaPairMatchesUint8ClampedRounding() {
  var heap = new Uint8Array(256);
  var runtime = createRuntime(heap);
  var ptr = { ptr: 1, bitmap: 0, stride: 256, w: 256, h: 1, color: 0, dst_x: 0, dst_y: 0, next: { ptr: 0 } };
  var alpha;
  var coverage;
  var expected;
  var actual;
  for (coverage = 0; coverage < 256; coverage += 1) { heap[coverage] = coverage; }
  for (alpha = 0; alpha < 256; alpha += 1) {
    ptr.color = (0x5a6b7c << 8 | 255 - alpha) >>> 0;
    expected = referenceItem(ptr, heap);
    actual = runtime.self.buildResultItem(ptr);
    assert.deepStrictEqual(bytes(actual.buffer), Array.prototype.slice.call(expected),
      'packed output must preserve Uint8ClampedArray rounding for alpha=' + alpha);
  }
  runtime.self.PloffAssUsePackedPixels = false;
  for (alpha = 0; alpha < 256; alpha += 1) {
    ptr.color = (0x5a6b7c << 8 | 255 - alpha) >>> 0;
    expected = referenceItem(ptr, heap);
    actual = runtime.self.buildResultItem(ptr);
    assert.deepStrictEqual(bytes(actual.buffer), Array.prototype.slice.call(expected),
      'fallback output must preserve Uint8ClampedArray rounding for alpha=' + alpha);
  }
}());

(function testMultipleBitmapResultAndBoundedAlphaCache() {
  var heap = new Uint8Array(256);
  var runtime = createRuntime(heap);
  var first;
  var second;
  var result;
  var alpha;
  var i;
  for (i = 0; i < heap.length; i += 1) { heap[i] = i & 255; }
  second = { ptr: 2, bitmap: 70, stride: 4, w: 4, h: 2, color: 0x11223344 >>> 0, dst_x: 9, dst_y: 10, next: { ptr: 0 } };
  first = { ptr: 1, bitmap: 20, stride: 6, w: 5, h: 2, color: 0xabcdef20 >>> 0, dst_x: 3, dst_y: 4, next: second };
  result = runtime.self.buildResult(first);
  assert.strictEqual(result[0].length, 2, 'buildResult must retain multiple libass bitmaps');
  assert.strictEqual(result[1].length, 2, 'each bitmap buffer must remain transferable');
  assert.deepStrictEqual(bytes(result[0][0].buffer), Array.prototype.slice.call(referenceItem(first, heap)), 'first bitmap output must stay exact');
  assert.deepStrictEqual(bytes(result[0][1].buffer), Array.prototype.slice.call(referenceItem(second, heap)), 'second bitmap output must stay exact');

  for (alpha = 1; alpha <= 12; alpha += 1) {
    runtime.self.PloffAssGetAlphaLut(alpha);
  }
  assert.ok(runtime.self.PloffAssAlphaLutOrder.length <= 8, 'alpha LUT cache must remain bounded');
}());

(function testUnsupportedAndBigEndianTypedArraysUseFallback() {
  var heap = new Uint8Array(64);
  var noPacked = createRuntime(heap, { Uint32Array: null });
  var bigEndian = createRuntime(heap, { Uint32Array: bigEndianUint32Array });
  var ptr = { ptr: 1, bitmap: 0, stride: 2, w: 2, h: 2, color: 0x10203040 >>> 0, dst_x: 1, dst_y: 2, next: { ptr: 0 } };
  heap.set([0, 127, 64, 255]);
  assert.strictEqual(noPacked.self.PloffAssUsePackedPixels, false, 'missing Uint32Array support must select the byte fallback');
  assert.strictEqual(bigEndian.self.PloffAssUsePackedPixels, false, 'non-little-endian typed arrays must select the byte fallback');
  assertItemEquivalent(noPacked, ptr, heap, 'unsupported typed-array fallback must remain exact');
  assertItemEquivalent(bigEndian, ptr, heap, 'big-endian fallback must remain exact');
}());

console.log('ASS js-blend optimization checks passed');
