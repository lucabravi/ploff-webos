'use strict';

var assert = require('assert');
var path = require('path');
var Architecture = require('../scripts/check-coordinator-architecture');

function rules(source, fileName) {
  return Architecture.analyzeSource(source, fileName).issues.map(function (issue) { return issue.rule; });
}

assert.deepStrictEqual(
  rules("(function () { video.currentTime = 12; }());", 'player-feature-controller.js'),
  ['native-video-write'],
  'only PlaybackController may assign native playback position'
);
assert.deepStrictEqual(
  rules("(function () { video.src = '/next'; }());", 'detail-feature-controller.js'),
  ['native-video-write'],
  'only PlaybackController may replace the native playback source'
);
assert.deepStrictEqual(
  rules("(function () { video.currentTime = 12; video.src = '/next'; }());", 'playback-controller.js'),
  [],
  'PlaybackController remains the native video owner'
);
assert.deepStrictEqual(
  rules("function create() { PlexClient.loadHome(); }", 'application-controller.js'),
  ['root-direct-plex'],
  'the composition root must not perform Plex transport'
);
assert.deepStrictEqual(
  rules("function create() { var searchPlexClient = PlexFeaturePorts.search(PlexClient); var playerPlexClient = PlexFeaturePorts.player(PlexClient); searchPlexClient.search(); playerPlexClient.preparePlayback(); }", 'application-controller.js'),
  ['root-direct-plex', 'root-direct-plex'],
  'the composition root must not invoke transport through feature-specific Plex ports'
);
assert.deepStrictEqual(
  rules("function create() { var renamedTransport = PlexFeaturePorts.search(PlexClient); renamedTransport.search(); }", 'application-controller.js'),
  ['root-direct-plex'],
  'the composition root must derive Plex transport ownership from port construction instead of known alias names'
);
assert.deepStrictEqual(
  rules("function create() { root.setTimeout(run, 10); setInterval(run, 20); }", 'application-controller.js'),
  ['root-feature-timer', 'root-feature-timer'],
  'the composition root must not own feature timers'
);
assert.deepStrictEqual(
  rules("function create() { node.innerHTML = ''; node.style.display = 'none'; node.className = 'hidden'; }", 'application-controller.js'),
  ['root-dom-mutation', 'root-dom-mutation', 'root-dom-mutation'],
  'the composition root must not mutate feature presentation'
);
assert.deepStrictEqual(
  rules("function create() { node.appendChild(child); node.setAttribute('hidden', ''); node.classList.add('active'); node.style.setProperty('display', 'none'); }", 'application-controller.js'),
  ['root-dom-mutation', 'root-dom-mutation', 'root-dom-mutation', 'root-dom-mutation'],
  'the composition root must not mutate feature presentation through DOM methods'
);
assert.deepStrictEqual(
  rules("function create() { ShellController.create({}); PlaybackController.create({}); }", 'application-controller.js'),
  ['root-forbidden-construction', 'root-forbidden-construction'],
  'the composition root must construct vertical features instead of their private controllers'
);
assert.deepStrictEqual(
  rules("function create() { var appView = 'home'; var playbackController = {}; }", 'application-controller.js'),
  ['root-private-state', 'root-private-state'],
  'the composition root must not retain duplicate view or Player state'
);
assert.deepStrictEqual(
  rules("function create() { var compatibility = {}; return compatibilityState(); }", 'detail-feature-controller.js'),
  ['legacy-compatibility-state', 'legacy-compatibility-state'],
  'legacy mutable compatibility facades must remain forbidden in every coordinator'
);
assert.deepStrictEqual(
  rules("function create() { detailSnapshot().zone = 'play'; queue.index = 2; }", 'application-controller.js'),
  ['root-snapshot-mutation', 'root-private-state-mutation'],
  'cross-feature snapshots and queue internals must remain read-only'
);

var longLine = new Array(230).join('x');
var report = Architecture.analyzeSource('var value = 1;\n// ' + longLine + '\n', 'application-controller.js');
assert.strictEqual(report.issues.length, 0, 'readability metrics must not masquerade as architectural failures');
assert.strictEqual(report.metrics.lineCount, 3);
assert.strictEqual(report.metrics.longLineCount, 1);
assert.ok(report.metrics.maxLineLength > 200);

var project = Architecture.checkProject(path.join(__dirname, '..'));
assert.deepStrictEqual(project.issues, [], 'the real coordinator architecture must satisfy every semantic static invariant');
assert.ok(project.applicationMetrics.lineCount > 0, 'the checker must publish composition-root readability metrics');

console.log('Coordinator architecture AST checks passed');
