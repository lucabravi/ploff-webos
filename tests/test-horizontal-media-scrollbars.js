'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var coreCss = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles', 'core.css'), 'utf8');

function rule(selector) {
  var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var match = coreCss.match(new RegExp(escaped + '\\s*\\{[^}]*\\}'));
  return match ? match[0] : '';
}

var mediaRowRule = rule('.media-row');
var recommendationRowRule = rule('.library-recommendation-row');
var horizontalScrollbarRule = coreCss.match(/\.media-row::-webkit-scrollbar\s*,\s*\.library-recommendation-row::-webkit-scrollbar\s*\{[^}]*\}/);

assert.ok(/scrollbar-width:\s*none/.test(mediaRowRule), 'Home horizontal media rows must hide their native scrollbar without changing scrolling');
assert.ok(/-ms-overflow-style:\s*none/.test(mediaRowRule), 'Home horizontal media rows must hide legacy scrollbar chrome');
assert.ok(/scrollbar-width:\s*none/.test(recommendationRowRule), 'Library recommendation rails must hide their native scrollbar without changing scrolling');
assert.ok(/-ms-overflow-style:\s*none/.test(recommendationRowRule), 'Library recommendation rails must hide legacy scrollbar chrome');
assert.ok(horizontalScrollbarRule && /display:\s*none/.test(horizontalScrollbarRule[0]), 'WebKit scrollbar chrome must be hidden only for horizontal media rails');
assert.ok(!/\.library-grid::-webkit-scrollbar/.test(coreCss), 'Catalog grids must keep their scrollbar behavior unchanged');

console.log('Horizontal media scrollbar checks passed');
