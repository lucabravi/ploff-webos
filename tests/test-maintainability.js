'use strict';

var assert = require('assert');
var path = require('path');
var Maintainability = require(path.join(__dirname, '..', 'scripts', 'check-maintainability.js'));

function rules(result) {
  return result.issues.map(function (issue) { return issue.rule; });
}

(function rejectsDuplicateSubtitleEditorPolicyOutsideSubtitleRuntime() {
  var source = [
    "'use strict';",
    'function subtitleEditorTrackAllowed(track) {',
    '  return SubtitleSync.availability(track, {}).enabled;',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'player-feature-controller.js');
  assert.ok(rules(result).indexOf('subtitle-editor-policy-owner') >= 0,
    'runtime subtitle-editor eligibility policy must remain owned by SubtitleRuntime');
  result = Maintainability.analyzeSource(source, 'playback-controller.js');
  assert.ok(rules(result).indexOf('subtitle-editor-policy-owner') >= 0,
    'Playback facade must delegate subtitle-editor eligibility policy to SubtitleRuntime');
}());

(function allowsSubtitleRuntimeToOwnEditorPolicyAndFailureState() {
  var source = [
    "'use strict';",
    'var failedStreams = {};',
    'function editorTrackAllowed(track) {',
    '  return SubtitleSync.availability(track, failedStreams).enabled;',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'subtitle-runtime.js');
  assert.strictEqual(rules(result).indexOf('subtitle-editor-policy-owner'), -1,
    'SubtitleRuntime must be allowed to own runtime editor policy and session-local subtitle failures');
}());

(function allowsPresentationClassificationOutsidePlayback() {
  var source = [
    "'use strict';",
    'function subtitleLabel(track) {',
    '  return SubtitleSync.classify(track).kind;',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'player-subtitle-editor-controller.js');
  assert.strictEqual(rules(result).indexOf('subtitle-editor-policy-owner'), -1,
    'presentation may classify subtitle kinds without owning runtime eligibility policy');
}());

(function rejectsNativeVideoMutationOutsideDriver() {
  var source = [
    "'use strict';",
    "var nativeVideo = document.getElementById('player-video');",
    'nativeVideo.currentTime = 42;',
    "nativeVideo.src = '/video.m3u8';",
    'nativeVideo.load();'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'player-feature-controller.js');
  assert.ok(rules(result).indexOf('native-video-owner') >= 0,
    'native player video mutation must remain owned by NativeVideoDriver');
}());

(function rejectsDirectNativeVideoLookupMutationOutsideDriver() {
  var source = [
    "'use strict';",
    "document.getElementById('player-video').currentTime = 12;"
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'pointer-controller.js');
  assert.ok(rules(result).indexOf('native-video-owner') >= 0,
    'direct player-video lookup mutation must remain owned by NativeVideoDriver');
}());

(function rejectsNativeVideoMutationInsidePlaybackFacade() {
  var source = [
    "'use strict';",
    "var video = document.getElementById('player-video');",
    'video.currentTime = 42;',
    "video.src = '/video.m3u8';",
    'video.load();'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'playback-controller.js');
  assert.ok(rules(result).indexOf('native-video-owner') >= 0,
    'Playback facade must delegate physical video mutation to NativeVideoDriver');
}());

(function allowsNativeVideoMutationInsideDriver() {
  var source = [
    "'use strict';",
    'function create(video) {',
    '  video.currentTime = 42;',
    "  video.src = '/video.m3u8';",
    '  video.load();',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'native-video-driver.js');
  assert.strictEqual(rules(result).indexOf('native-video-owner'), -1,
    'NativeVideoDriver must be the sole native-video owner');
}());

(function rejectsPlexTimelineTrafficOutsidePlaybackTimeline() {
  var source = [
    "'use strict';",
    'function report(config, current) {',
    "  PlexClient.sendTimeline(config, current, 'playing', 42000, function () {});",
    '  PlexClient.pingTranscode(config, current, function () {});',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'playback-controller.js');
  assert.ok(rules(result).indexOf('playback-timeline-owner') >= 0,
    'Plex timeline and transcode keepalive traffic must remain owned by PlaybackTimeline');
}());

(function allowsPlaybackTimelineToOwnPlexTimelineTraffic() {
  var source = [
    "'use strict';",
    'function report(config, current) {',
    "  PlexClient.sendTimeline(config, current, 'playing', 42000, function () {});",
    '  PlexClient.pingTranscode(config, current, function () {});',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'playback-timeline.js');
  assert.strictEqual(rules(result).indexOf('playback-timeline-owner'), -1,
    'PlaybackTimeline must be allowed to own Plex timeline and transcode keepalive traffic');
}());

(function rejectsRecoveryFallbackInsidePlaybackReposition() {
  var source = [
    "'use strict';",
    'function reposition(recovery, target) {',
    '  return PlaybackRecovery.rebuild(recovery, target);',
    '}'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'playback-reposition.js');
  assert.ok(rules(result).indexOf('reposition-recovery-boundary') >= 0,
    'PlaybackReposition must never advance or depend on PlaybackRecovery fallback state');
}());

(function rejectsQueuePresentationStateOutsidePlayerQueueController() {
  var source = [
    "'use strict';",
    'var playlistQueueCards = {};',
    'var playlistQueuePrefetchImages = {};',
    'var playlistQueueRenderToken = 0;'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'player-feature-controller.js');
  assert.ok(rules(result).indexOf('player-queue-presentation-owner') >= 0,
    'queue retained-card, artwork, and render state must remain owned by PlayerQueueController');
}());

(function allowsPlayerQueueControllerToOwnQueuePresentationState() {
  var source = [
    "'use strict';",
    'var playlistQueueCards = {};',
    'var playlistQueuePrefetchImages = {};',
    'var playlistQueueRenderToken = 0;'
  ].join('\n');
  var result = Maintainability.analyzeSource(source, 'player-queue-controller.js');
  assert.strictEqual(rules(result).indexOf('player-queue-presentation-owner'), -1,
    'PlayerQueueController must be allowed to own queue presentation state');
}());

(function rejectsHotspotRegressionBeyondReviewedBudget() {
  var body = [];
  var index;
  body.push("'use strict';");
  body.push('function handleKey(event, direction) {');
  for (index = 0; index < 24; index += 1) {
    body.push('  if (direction === \'zone' + index + '\') { return true; }');
  }
  body.push('  return false;');
  body.push('}');
  var result = Maintainability.analyzeSource(body.join('\n'), 'library-controller.js');
  assert.ok(rules(result).indexOf('input-hotspot-budget') >= 0,
    'decomposed input routers must not silently regrow into monoliths');
}());

(function currentProjectSatisfiesMaintainabilityBoundaries() {
  var root = path.join(__dirname, '..');
  var result = Maintainability.checkProject(root);
  assert.deepStrictEqual(result.issues, [], 'current project must satisfy maintainability boundaries');
}());

console.log('Maintainability boundary checks passed');
