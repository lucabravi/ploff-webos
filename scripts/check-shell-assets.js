'use strict';

var fs = require('fs');
var path = require('path');
var documentPath = path.resolve(process.argv[2] || 'shell/index.html');
var expectedVersion = String(process.argv[3] || 'dev');
var directory = path.dirname(documentPath);
var html = fs.readFileSync(documentPath, 'utf8');
var expression = /(?:src|href)="([^"]+)"/g;
var match;
var checked = 0;

while ((match = expression.exec(html))) {
  var reference = match[1];
  var parts;
  if (/^(?:https?:|data:|#)/i.test(reference)) { continue; }
  parts = reference.split('?v=');
  if (!fs.existsSync(path.join(directory, parts[0]))) {
    throw new Error('Missing local shell asset: ' + parts[0]);
  }
  if (/\.(?:css|js)$/i.test(parts[0]) && parts[1] !== expectedVersion) {
    throw new Error('Inconsistent cache key for ' + parts[0] + ': expected ' + expectedVersion);
  }
  checked += 1;
}

if (!checked) { throw new Error('No local shell assets found'); }
console.log('Shell asset references passed (' + checked + ' files)');
