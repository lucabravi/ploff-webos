'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Build = require('../scripts/build-app');

var project = path.join(__dirname, '..');
var coordinatorDirectory = path.join(project, 'app/coordinator');
var coordinatorFiles = fs.readdirSync(coordinatorDirectory).filter(function (name) { return /\.js$/.test(name); }).sort();
var applicationSource = fs.readFileSync(path.join(coordinatorDirectory, 'application-controller.js'), 'utf8');
var shellFeatureSource = fs.readFileSync(path.join(coordinatorDirectory, 'shell-feature-controller.js'), 'utf8');
var detailFeatureSource = fs.readFileSync(path.join(coordinatorDirectory, 'detail-feature-controller.js'), 'utf8');

assert.strictEqual((applicationSource.match(/ShellFeatureController\.create\(/g) || []).length, 1, 'composition root must construct exactly one ShellFeatureController');
assert.ok(!/ShellController\.create\(/.test(applicationSource), 'composition root must not construct ShellController directly');
assert.ok(!/ProgressiveImages\.create\(/.test(applicationSource), 'composition root must not construct the shared progressive-image loader');
assert.ok(!/BackgroundAudio\.create\(/.test(applicationSource), 'composition root must not construct background audio directly');
assert.ok(!/NavigationModel\.createPreviewScheduler\(/.test(applicationSource), 'composition root must not own navbar preview scheduling');
['activeViewState', 'navHoldTimer', 'navHoldTriggered', 'navReorderMode', 'navReorderReady', 'navReorderOriginalItems', 'clockTimer', 'navbarResizeTimer', 'posterLoader', 'backgroundAudio'].forEach(function (name) {
  assert.ok(new RegExp('var\\s+' + name + '\\b').test(applicationSource) === false, 'composition root must not declare shell-owned ' + name);
});
assert.ok(/ShellController\.create\(/.test(shellFeatureSource), 'ShellFeatureController must own ShellController construction');
assert.ok(/ProgressiveImages\.create\(/.test(shellFeatureSource), 'ShellFeatureController must own the shared progressive-image loader');
assert.ok(/BackgroundAudio\.create\(/.test(shellFeatureSource), 'ShellFeatureController must own background audio');
assert.ok(!/state\s*=\s*shellFeature\.focusState\(\)/.test(applicationSource), 'composition root must not retain a mutable alias of Shell focus state');
assert.ok(!/shellFeature\.focusState\(\)\.[A-Za-z0-9_]+\s*=/.test(applicationSource), 'composition root must mutate Shell focus only through semantic methods');

assert.strictEqual((applicationSource.match(/DetailFeatureController\.create\(/g) || []).length, 1, 'composition root must construct exactly one DetailFeatureController');
assert.ok(!/DetailController\.create\(/.test(applicationSource), 'composition root must not construct DetailController directly');
assert.ok(!/DetailPresentationView\.create\(/.test(applicationSource), 'composition root must not construct DetailPresentationView directly');
assert.ok(!/DetailEpisodeView\.create\(/.test(applicationSource), 'composition root must not construct DetailEpisodeView directly');
assert.ok(!/DetailPreferenceState\.create\(/.test(applicationSource), 'composition root must not construct DetailPreferenceState directly');
assert.ok(!/\b(?:detailController|detailPresentationView|detailEpisodeView|detailPreferenceState|pendingDetailProgress|lastDetailPresentationKey)\b/.test(applicationSource), 'composition root must not retain Detail feature internals');
assert.ok(/DetailController\.create\(/.test(detailFeatureSource), 'DetailFeatureController must own DetailController construction');
assert.ok(/DetailPresentationView\.create\(/.test(detailFeatureSource), 'DetailFeatureController must own DetailPresentationView construction');
assert.ok(/DetailEpisodeView\.create\(/.test(detailFeatureSource), 'DetailFeatureController must own DetailEpisodeView construction');
assert.ok(/DetailPreferenceState\.create\(/.test(detailFeatureSource), 'DetailFeatureController must own DetailPreferenceState construction');
assert.ok(!/getElementById\(['"]detail-view['"]\)/.test(applicationSource), 'composition root must not mutate the Detail surface directly');
assert.ok(!/(?:setText|getElementById)\(['"]detail-(?:play|refresh-metadata|file-info|version-label)['"]/.test(applicationSource), 'composition root must not translate Detail-owned controls directly');

coordinatorFiles.forEach(function (name) {
  var source = fs.readFileSync(path.join(coordinatorDirectory, name), 'utf8');
  assert.ok(/\(function \(root, factory\)/.test(source), name + ' must remain an independently scoped UMD module');
  assert.ok(!/compatibilityState/.test(source), name + ' must not restore a mutable legacy compatibility facade');
  assert.ok(!/var compatibility\s*=/.test(source), name + ' must not mirror controller state through compatibility objects');
});

assert.ok(!/\bdetailState\b|\bplaybackQueueState\b/.test(applicationSource), 'composition root must use semantic controller APIs instead of retained private-state aliases');
assert.ok(!/detailSnapshot\(\)\.[A-Za-z0-9_.]+\s*=(?!=)/.test(applicationSource), 'detail snapshots must remain read-only at the composition boundary');
assert.ok(!/playbackQueueSnapshot\(\)\.[A-Za-z0-9_.]+\s*=(?!=)/.test(applicationSource), 'queue snapshots must remain read-only at the composition boundary');
assert.ok(!/\bqueue\.index\s*=/.test(applicationSource), 'composition root must not mutate playback queue internals directly');
assert.ok(!/function renderDetail\([\s\S]{0,500}detail\.(?:guid|cloudRatingKey|cloudGuid)\s*=/.test(applicationSource), 'detail identity enrichment must use the controller mutation contract instead of aliasing controller-owned objects');
assert.ok(!/PlaybackQueueController\.create\s*\(/.test(applicationSource), 'composition root must not construct the playback queue controller');
assert.ok(!/PlaybackController\.create\s*\(/.test(applicationSource), 'composition root must not construct the playback controller');
assert.ok(!/PlayerControlsController\.create\s*\(/.test(applicationSource), 'composition root must not construct the player controls controller');
assert.ok(!/\bvar\s+(?:playbackQueueController|playbackController|playerControlsController|playerControlsView|playerChaptersView|subtitleEditorView|upNextView|resumeChoiceState|playerErrorVisible)\b/.test(applicationSource), 'composition root must not retain Player-owned controllers, views, or overlay state');
assert.ok(!/function\s+(?:openPlayer|closePlayer|renderPlayer|handlePlayer|handleSubtitleEditor|handlePlaylistQueue|renderPlaylistQueue|startAutoplayCountdown|cancelAutoplayCountdown|openResumeChoice|renderResumeChoice)\b/.test(applicationSource), 'composition root must not implement Player presentation or input');
assert.ok(!/getElementById\(['"](?:player-|autoplay-|subtitle-editor-|playlist-queue-)/.test(applicationSource), 'composition root must not access Player-owned DOM surfaces');
assert.ok(!/ChoiceDialogView\.create|var choiceDialogView|choiceDialogApply|choiceDialogReturnFocus|function handleChoiceDialogKey/.test(applicationSource), 'composition root must not own the shared choice dialog implementation');
assert.ok(!/MediaInfoView\.create|var mediaInfoView|function openAdvancedMediaInfo|function closeAdvancedMediaInfo|function handlePlayerMediaInfoKey/.test(applicationSource), 'composition root must not own the shared media-information dialog implementation');
assert.ok(!/SearchController\.create\s*\(/.test(applicationSource), 'composition root must not construct SearchController directly');
assert.ok(!/\bsearchView\b/.test(applicationSource), 'composition root must not retain the Search view');
assert.ok(!/function loadCloudSearchItems\b/.test(applicationSource), 'Search provider transport must belong to SearchFeatureController');
assert.ok(!/function measureSearchResults\b/.test(applicationSource), 'Search DOM measurement must belong to SearchFeatureController');
assert.ok(!/SettingsController\.create\(/.test(applicationSource), 'composition root must not construct the Settings domain controller');
assert.ok(!/var settingsView\s*=\s*\{/.test(applicationSource), 'composition root must not retain a mutable Settings view facade');
assert.ok(!/var upNextLayoutDialog\s*=\s*\{/.test(applicationSource), 'composition root must not retain a mutable Up Next Settings facade');
assert.ok(!/getElementById\(['"]app-settings-view['"]\)/.test(applicationSource), 'composition root must not mutate Settings-owned DOM');
assert.ok(!/function (?:settingsRows|renderAppSettings|updateSettingsFocus|closePrivacyPolicy|openAppSettingChoice|renderUpNextLayoutEditor|closeUpNextLayoutEditor|selectAccentColor|orderedEditorLanguages|renderLanguageEditor|toggleEditorLanguage|openAppSettings|leaveAppSettings)\(/.test(applicationSource), 'composition root must call the Settings feature semantic API directly instead of retaining forwarding wrappers');
assert.ok(!/DiagnosticsController\.create\(/.test(applicationSource), 'composition root must not construct DiagnosticsController directly');
assert.ok(!/var diagnosticsView\s*=\s*\{/.test(applicationSource), 'composition root must not retain a mutable Diagnostics view facade');
assert.ok(!/getElementById\(['"]diagnostics-view['"]\)/.test(applicationSource), 'composition root must not mutate the Diagnostics-owned surface directly');
assert.ok(!/function (?:webOSVersion|bufferedPlaybackRanges|playbackSourceSummary|currentPlaybackDiagnostics|openDiagnostics|activateDiagnosticsAction|capturePlaybackDiagnostics|setDiagnosticsError)\(/.test(applicationSource), 'composition root must call the Diagnostics feature semantic API directly instead of retaining formatting or forwarding wrappers');
assert.ok(!/\bSetupAdapter\b|\bsetupAdapter\b/.test(applicationSource), 'composition root must use SetupFeatureController without retaining the transitional adapter API');
assert.ok(!/getElementById\(['"]setup-view['"]\)/.test(applicationSource), 'composition root must not mutate the Setup-owned surface directly');
assert.ok(!/adapters:\s*\{/.test(applicationSource), 'Setup feature wiring must use explicit state, language, server, account, and transition ports');
assert.ok(!/ServerController\.create\(/.test(applicationSource), 'composition root must not construct ServerController directly');
assert.ok(!/ServerEditorView\.create\(/.test(applicationSource), 'composition root must not construct ServerEditorView directly');
assert.ok(!/\bserverController\b|\bserverEditorView\b/.test(applicationSource), 'composition root must not retain Server controller or editor aliases');
assert.ok(!/function (?:renderServerEditor|serverConnectionAddresses|appendServerEditorAddresses|attemptServerFailover|openServerEditor|closeServerEditor|serverForUri|serverForIdentity|applyServer|discoverLocalServers|waitForServerActivity|persistRemoteConnectionState|verifyRemoteConnectionsInBackground|resumeRemoteConnectionVerification|switchServer|activateServerEditorRow)\(/.test(applicationSource), 'composition root must call the Server feature semantic API directly instead of retaining presentation or forwarding wrappers');
assert.ok(!/serverState\.servers\s*=/.test(applicationSource), 'composition root must not mutate the Server feature collection in place');
assert.ok(!/LibraryController\.create\s*\(/.test(applicationSource), 'composition root must not construct LibraryController directly');
assert.ok(!/LibraryFilterView\.create\s*\(/.test(applicationSource), 'composition root must not construct LibraryFilterView directly');
assert.ok(!/(?:PloffLibraryGridView|LibraryGridView)\.create\s*\(/.test(applicationSource), 'composition root must not construct LibraryGridView directly');
assert.ok(!/LibraryLifecycle\.create\s*\(/.test(applicationSource), 'composition root must not construct LibraryLifecycle directly');
assert.ok(!/WatchlistView\.create\s*\(/.test(applicationSource), 'composition root must not construct WatchlistView directly');
assert.ok(!/\b(?:libraryGridView|libraryLifecycle|libraryFilterView|watchlistView)\b/.test(applicationSource), 'composition root must not retain Library feature view or lifecycle aliases');
assert.ok(!/getElementById\(['"](?:library|watchlist)-/.test(applicationSource), 'composition root must not mutate or bind Library-owned DOM directly');

assert.deepStrictEqual(Build.MODULE_FILES.slice().sort(), coordinatorFiles, 'the generated bundle must include every coordinator module exactly once');

assert.strictEqual(fs.existsSync(path.join(coordinatorDirectory, 'setup-adapter.js')), false, 'the transitional Setup adapter must stay removed');
assert.strictEqual(fs.existsSync(path.join(project, 'app/source')), false, 'legacy shared-scope source fragments must stay removed');

console.log('Coordinator ownership checks passed');
