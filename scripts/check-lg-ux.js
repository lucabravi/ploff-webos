'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) {
    throw new Error(message);
  }
}

var appInfo = JSON.parse(read('webos-shell-app/appinfo.json'));
var input = read('app/source/70-input-bootstrap.js');
var shell = read('app/source/10-shell-home.js');
var styles = read('app/styles.css');
var index = read('app/index.html');

if (appInfo.resolution !== '1920x1080') {
  throw new Error('LG UX baseline requires a 1920x1080 application canvas');
}
if (appInfo.disableBackHistoryAPI !== true) {
  throw new Error('disableBackHistoryAPI must remain enabled so Back is handled by the app');
}

requireMatch(input, /\{\s*37:\s*'left',\s*38:\s*'up',\s*39:\s*'right',\s*40:\s*'down'\s*\}/,
  'four-way remote navigation mapping is missing');
requireMatch(input, /event\.keyCode\s*===\s*13/, 'OK key handling is missing');
requireMatch(input, /event\.keyCode\s*===\s*461/, 'webOS Back key handling is missing');
requireMatch(input, /addEventListener\('keydown',\s*onKeyDown/, 'global remote input listener is missing');

['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click', 'wheel', 'mousewheel'].forEach(function (eventName) {
  requireMatch(input, new RegExp("addEventListener\\('" + eventName + "'"),
    'Magic Remote event listener is missing: ' + eventName);
});

requireMatch(styles, /\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'global visible focus treatment is missing');
requireMatch(styles, /\.player-button\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'player focus treatment is missing');
requireMatch(styles, /\.media-card\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'media-card focus treatment is missing');

['startup-splash-spinner', 'server-activity-spinner', 'view-state-spinner', 'player-loading-spinner'].forEach(function (className) {
  requireMatch(index + styles, new RegExp(className), 'loading cue is missing: ' + className);
});
requireMatch(shell + input, /showViewState\('loading'/, 'generic loading-state support is missing');

[
  ['.search-key', /height:\s*54px/],
  ['.library-tab', /height:\s*54px/],
  ['.library-action', /height:\s*54px/],
  ['.library-control', /height:\s*54px/],
  ['.detail-choice', /height:\s*54px/],
  ['.player-chapters-hint', /height:\s*54px/],
  ['.autoplay-actions button', /height:\s*54px/]
].forEach(function (rule) {
  var selector = rule[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  requireMatch(styles, new RegExp(selector + '\\s*\\{[^}]*' + rule[1].source, 's'),
    'minimum 54px target baseline is missing for ' + rule[0]);
});

requireMatch(shell, /--poster-title-font',\s*Math\.max\(20,/,
  'poster title must not scale below 20px');
requireMatch(shell, /--poster-meta-font',\s*Math\.max\(20,/,
  'poster metadata must not scale below 20px');

console.log('LG UX static checks passed');
