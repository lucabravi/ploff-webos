'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var workerPath = path.join(root, 'app', 'vendor', 'subtitles-octopus-worker-legacy.js');
var workerSource = fs.readFileSync(workerPath, 'utf8');
var buildStart = workerSource.indexOf('self.buildResult=function');
var buildEnd = workerSource.indexOf('if(typeof SDL', buildStart);
var width = 640;
var height = 96;
var stride = 672;
var offset = 16;
var heap = new Uint8Array(offset + stride * height + 16);
var selfObject = {};
var Module = { HEAPU8: heap };
var index;

if (buildStart < 0 || buildEnd <= buildStart || workerSource.indexOf('self.PloffAssCanPackRgba=', buildStart) < 0) {
  throw new Error('Generated ASS worker does not contain the optimized js-blend path');
}

for (index = 0; index < heap.length; index += 1) {
  heap[index] = (index * 37 + 11) & 255;
}

Function('self', 'Module', workerSource.slice(buildStart, buildEnd))(selfObject, Module);

function referenceItem(ptr) {
  var bitmap = ptr.bitmap;
  var color = ptr.color;
  var r = color >> 24 & 255;
  var g = color >> 16 & 255;
  var b = color >> 8 & 255;
  var a = 255 - (color & 255);
  var result = new Uint8ClampedArray(4 * ptr.w * ptr.h);
  var bitmapPosition = 0;
  var resultPosition = 0;
  var y;
  var x;
  var alpha;
  for (y = 0; y < ptr.h; y += 1) {
    for (x = 0; x < ptr.w; x += 1) {
      alpha = heap[bitmap + bitmapPosition + x] * a / 255;
      result[resultPosition] = r;
      result[resultPosition + 1] = g;
      result[resultPosition + 2] = b;
      result[resultPosition + 3] = alpha;
      resultPosition += 4;
    }
    bitmapPosition += ptr.stride;
  }
  return result;
}

function sameBytes(left, right) {
  var a = new Uint8Array(left.buffer || left);
  var b = new Uint8Array(right.buffer || right);
  var i;
  if (a.length !== b.length) { return false; }
  for (i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) { return false; }
  }
  return true;
}

function elapsedMs(callback, iterations) {
  var started = process.hrtime.bigint();
  var i;
  for (i = 0; i < iterations; i += 1) { callback(); }
  return Number(process.hrtime.bigint() - started) / 1000000;
}

function median(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmark(label, color) {
  var ptr = {
    ptr: 1,
    bitmap: offset,
    stride: stride,
    w: width,
    h: height,
    color: color >>> 0,
    dst_x: 0,
    dst_y: 0,
    next: { ptr: 0 }
  };
  var reference = referenceItem(ptr);
  var optimized = selfObject.buildResultItem(ptr);
  var referenceTimes = [];
  var optimizedTimes = [];
  var iterations = 400;
  var round;
  if (!sameBytes(reference, optimized.buffer)) {
    throw new Error(label + ' optimized output differs from reference output');
  }
  for (round = 0; round < 60; round += 1) {
    referenceItem(ptr);
    selfObject.buildResultItem(ptr);
  }
  for (round = 0; round < 7; round += 1) {
    referenceTimes.push(elapsedMs(function () { referenceItem(ptr); }, iterations));
    optimizedTimes.push(elapsedMs(function () { selfObject.buildResultItem(ptr); }, iterations));
  }
  var referenceMedian = median(referenceTimes);
  var optimizedMedian = median(optimizedTimes);
  console.log(label + ': reference=' + referenceMedian.toFixed(2) + 'ms optimized=' + optimizedMedian.toFixed(2) +
    'ms speedup=' + (referenceMedian / optimizedMedian).toFixed(2) + 'x (' + iterations + ' renders, ' + width + 'x' + height + ')');
}

if (!selfObject.PloffAssUsePackedPixels) {
  throw new Error('Benchmark host is not little-endian; packed path is unavailable');
}

benchmark('opaque alpha=255', 0xf2e1d000);
benchmark('partial alpha=176', 0xf2e1d04f);
