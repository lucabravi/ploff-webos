'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var MAX_BUNDLE_BYTES = 800000;
var MAX_GZIP_BYTES = 165000;

function checkBuffer(source) {
  var rawBytes = source.length;
  var gzipBytes = zlib.gzipSync(source, { level: 9 }).length;
  var rawWithinBudget = rawBytes <= MAX_BUNDLE_BYTES;
  var gzipWithinBudget = gzipBytes <= MAX_GZIP_BYTES;
  return {
    rawBytes: rawBytes,
    gzipBytes: gzipBytes,
    rawWithinBudget: rawWithinBudget,
    gzipWithinBudget: gzipWithinBudget,
    withinBudget: rawWithinBudget && gzipWithinBudget
  };
}

function checkFile(fileName) {
  return checkBuffer(fs.readFileSync(fileName));
}

if (require.main === module) {
  var bundlePath = path.join(__dirname, '..', 'app', 'app.js');
  var result = checkFile(bundlePath);
  console.log(
    'Runtime bundle: ' + result.rawBytes + '/' + MAX_BUNDLE_BYTES +
    ' bytes raw, ' + result.gzipBytes + '/' + MAX_GZIP_BYTES + ' bytes gzip'
  );
  if (!result.withinBudget) {
    console.error('Runtime bundle exceeds the current adjustable engineering guardrail');
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_BUNDLE_BYTES: MAX_BUNDLE_BYTES,
  MAX_GZIP_BYTES: MAX_GZIP_BYTES,
  checkBuffer: checkBuffer,
  checkFile: checkFile
};
