'use strict';

var fs = require('fs');
var path = require('path');
var documentPath = path.resolve(process.argv[2] || 'app/index.html');
var expectedVersion = String(process.argv[3] || 'dev');
var directory = path.dirname(documentPath);
var html = fs.readFileSync(documentPath, 'utf8');
var expression = /(?:src|href)="([^"]+)"/g;
var match;
var checked = 0;
var playerPath = path.join(directory, 'player.js');
if (!fs.existsSync(playerPath) || !fs.statSync(playerPath).isFile() || !fs.statSync(playerPath).size) {
  throw new Error('Missing or empty deferred shell asset: player.js');
}
if (/<script\b[^>]*src=["'](?:\.\/)?player\.js(?:[?"'])/i.test(html)) {
  throw new Error('Player must not be a static startup script');
}

while ((match = expression.exec(html))) {
  var reference = match[1];
  var parts;
  if (/^(?:https?:|data:|#)/i.test(reference)) { continue; }
  parts = reference.split('?v=');
  if (!fs.existsSync(path.join(directory, parts[0]))) {
    throw new Error('Missing local shell asset: ' + parts[0]);
  }
  var isVersionedVendorAsset = /^vendor\//.test(parts[0]) &&
    /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(parts[1] || '');
  if (/\.(?:css|js)$/i.test(parts[0]) && parts[1] !== expectedVersion && !isVersionedVendorAsset) {
    throw new Error('Inconsistent cache key for ' + parts[0] + ': expected ' + expectedVersion);
  }
  checked += 1;
}

if (!checked) { throw new Error('No local shell assets found'); }
console.log('Shell asset references passed (' + checked + ' files)');
