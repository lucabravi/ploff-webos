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
var inputController = read('app/coordinator/input-controller.js');
var pointerController = read('app/coordinator/pointer-controller.js');
var inputWiring = read('app/coordinator/application-controller.js');
var input = inputController + '\n' + pointerController + '\n' + inputWiring;
var shell = read('app/coordinator/application-controller.js') + '\n' +
  read('app/coordinator/shell-feature-controller.js') + '\n' + read('app/coordinator/shell-controller.js');
var cardLayout = read('app/card-layout.js');
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
requireMatch(inputWiring, /ApplicationEvents\.bind\([\s\S]*name: 'keydown', handler: inputController\.handleKeyDown/, 'global remote input listener is missing');

['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click', 'wheel', 'mousewheel'].forEach(function (eventName) {
  requireMatch(inputWiring, new RegExp("name: '" + eventName + "'"),
    'Magic Remote event listener is missing: ' + eventName);
});
requireMatch(pointerController, /function handleWheel\(event\)/, 'Magic Remote wheel behavior must be owned by the pointer controller');
requireMatch(inputWiring, /name: 'click', handler: pointerController\.handleClick, options: true/, 'pointer click capture must preserve queue precedence');

requireMatch(styles, /\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'global visible focus treatment is missing');
requireMatch(styles, /\.player-button\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'player focus treatment is missing');
requireMatch(styles, /\.media-card\.is-focused\s*\{[^}]*box-shadow\s*:/s,
  'media-card focus treatment is missing');
requireMatch(index, /id="autoplay-cancel"[\s\S]*id="autoplay-play"/,
  'Up Next actions must place Cancel left of Play now');
requireMatch(styles, /\.autoplay-actions\s*\{[^}]*position:\s*static/s,
  'compact Up Next actions must remain in document flow to avoid overlapping metadata');
requireMatch(styles, /\.autoplay-actions #autoplay-play\s*\{[^}]*background:\s*var\(--accent/s,
  'Play now must remain the visually primary Up Next action');

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

requireMatch(cardLayout, /titleFont:\s*Math\.max\(20,/,
  'poster title must not scale below 20px');
requireMatch(cardLayout, /metaFont:\s*Math\.max\(20,/,
  'poster metadata must not scale below 20px');
requireMatch(shell, /--poster-title-font', profile\.titleFont/,
  'the shell must apply the cached poster title font');
requireMatch(shell, /--poster-meta-font', profile\.metaFont/,
  'the shell must apply the cached poster metadata font');

console.log('LG UX static checks passed');
