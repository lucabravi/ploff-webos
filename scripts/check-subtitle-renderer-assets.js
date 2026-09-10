'use strict';

var fs = require('fs');
var crypto = require('crypto');
var path = require('path');

var root = path.resolve(__dirname, '..');
var vendor = path.join(root, 'app', 'vendor');
var required = [
  'subtitles-octopus.js',
  'subtitles-octopus-worker.js',
  'subtitles-octopus-worker-legacy.js',
  'subtitles-octopus-worker-legacy.mem',
  'subtitles-octopus-worker.wasm',
  'default.woff2',
  'LICENSE.default-font.txt',
  'THIRD_PARTY_NOTICES.txt',
  'subtitles-octopus.LICENSE.txt',
  'subtitles-octopus.COPYRIGHT.txt'
];

required.forEach(function (name) {
  var file = path.join(vendor, name);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error('Missing JavascriptSubtitlesOctopus asset: app/vendor/' + name);
  }
});

var font = fs.readFileSync(path.join(vendor, 'default.woff2'));
var fontHash = crypto.createHash('sha256').update(font).digest('hex');
if (fontHash !== '886929903707c5bb28b07cd2eed69921b3d5ef5c49c73a0dd1e187ebf6546a4c') {
  throw new Error('Unexpected default.woff2 provenance hash: ' + fontHash);
}

var fontLicense = fs.readFileSync(path.join(vendor, 'LICENSE.default-font.txt'), 'utf8');
var notices = fs.readFileSync(path.join(vendor, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
if (fontLicense.indexOf('SIL OPEN FONT LICENSE Version 1.1') === -1 ||
    notices.indexOf('JavascriptSubtitlesOctopus 4.1.0') === -1 ||
    notices.indexOf('LGPL-2.1+') === -1 ||
    notices.indexOf(fontHash) === -1) {
  throw new Error('Incomplete subtitle renderer third-party notices');
}

console.log('JavascriptSubtitlesOctopus assets passed (' + required.length + ' files)');
