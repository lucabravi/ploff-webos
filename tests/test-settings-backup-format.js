'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Settings = require('../app/settings');
var Backup = require('../app/settings-backup-format');

function storage(initial) {
  var values = Object.assign({}, initial || {});
  return {
    get length() { return Object.keys(values).length; },
    key: function (index) { return Object.keys(values)[index] || null; },
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    values: values
  };
}

var source = storage({
  'ploff.libraryOrder.v1': JSON.stringify(['4', '2']),
  'ploff.subtitle-offsets.v1': JSON.stringify({ 'server|part|stream': 300 }),
  'ploff.mediaPreference.v1.sample': JSON.stringify({ audioTrack: { language: 'ja' }, subtitlesOff: false }),
  'ploff.mediaPreference.v2.server%7Cprofile%7Cseason%7Cseason-a': JSON.stringify({ versionSignature: { videoCodec: 'h264', container: 'mp4', width: 1920, height: 1080, bitrate: 5000, hdr: 0 } }),
  'ploff.subtitle-presentation.v2': JSON.stringify({
    'server%7Cprofile|media|movie-1': { profiles: { 'it~srt~1': { subtitleSize: 125, track: { language: 'it', format: 'srt', external: true, title: 'Dialoghi' } } } }
  }),
  'ploff.playbackCompatibility.v2': JSON.stringify({
    version: 2,
    formats: [{ key: 'format', kind: 'direct-play', files: ['file-a'], failures: 2 }],
    files: [{ key: 'file-a', formatKey: 'format', kind: 'direct-play', failures: 1, confirmed: true, expiresAt: 9999999999999 }]
  }),
  'ploff.auth.v1': JSON.stringify({ ownerToken: 'secret' }),
  'ploff.servers.v1': JSON.stringify({ servers: [{ uri: 'http://private' }] })
});
var settings = Settings.validate({
  uiLanguage: 'it', cardScale: 120, uiTextScale: 115, artworkDataSaver: true,
  adaptivePlaybackMemory: true, homeRows: ['recent', 'continue'], settingsBackupMode: 'on',
  subtitleRenderingSrt: true, subtitleRenderingAss: true
});
var built = Backup.build(source, settings, '1.0.6', function () { return 123456789; }, {
  device: { id: 'living-room', name: 'Living room', model: 'OLED55', webOS: '9.0', width: 1920, height: 1080 }
});
var parsed = Backup.parse(built.summary);

assert(built.encodedBytes <= Backup.MAX_ENCODED_BYTES, 'device settings save must remain inside the encoded budget');
assert.strictEqual(parsed.version, 3, 'new saves must use format version 3');
assert.strictEqual(parsed.device.id, 'living-room');
assert.strictEqual(parsed.device.name, 'Living room');
assert.strictEqual(parsed.device.model, 'OLED55');
assert.strictEqual(parsed.settings.uiLanguage, 'it', 'device save must contain portable preferences');
assert.strictEqual(parsed.settings.cardScale, 120, 'device save must contain TV presentation settings');
assert.strictEqual(parsed.settings.uiTextScale, 115, 'device save must retain TV text scaling');
assert.strictEqual(parsed.settings.artworkDataSaver, true, 'device save must retain artwork data saver mode');
assert.strictEqual(parsed.settings.settingsBackupMode, 'on');
assert.strictEqual(parsed.settings.subtitleRenderingSrt, true, 'global SRT/WebVTT renderer setting must survive settings save');
assert.strictEqual(parsed.settings.subtitleRenderingAss, true, 'global ASS/SSA renderer setting must survive settings save');
assert.deepStrictEqual(parsed.settings.homeRows, ['recent', 'continue'], 'device settings save must retain Home row visibility and order');
assert.deepStrictEqual(parsed.libraryOrder, ['4', '2']);
assert.strictEqual(parsed.mediaPreferences.length, 2);
assert.strictEqual(parsed.mediaPreferences[1].storage, 'v2');
assert.strictEqual(parsed.mediaPreferences[1].value.versionSignature.width, 1920);
assert.strictEqual(parsed.subtitleOffsets['server|part|stream'], 300);
assert.strictEqual(Object.keys(parsed.subtitlePresentation).length, 1);
assert.strictEqual(parsed.subtitlePresentation['server%7Cprofile|media|movie-1'].profiles['it~srt~1'].subtitleSize, 125);
assert.strictEqual(parsed.compatibility.version, 3, 'legacy v2 compatibility memory must be normalized to schema v3 inside settings saves');
assert.strictEqual(parsed.compatibility.formats.length, 1);
assert.strictEqual(parsed.compatibility.files.length, 1);
assert.strictEqual(parsed.compatibility.formats[0].source, 'derived');
assert.strictEqual(parsed.compatibility.files[0].source, 'observation');
assert.strictEqual(built.summary.indexOf('secret'), -1, 'auth tokens must never enter the settings save');
assert.strictEqual(built.summary.indexOf('private'), -1, 'server addresses must never enter the settings save');
assert.strictEqual(Backup.isTechnicalPlaylist({ title: Backup.devicePlaylistTitle('Living room'), summary: built.summary }), true);
assert.strictEqual(Backup.isTechnicalPlaylist({ title: Backup.devicePlaylistTitle('Living room'), summary: 'normal user text' }), false);

var originalCompatibility = JSON.stringify({
  version: 2,
  formats: [{ key: 'existing-format', kind: 'transcode', files: ['existing-file'], failures: 1 }],
  files: [{ key: 'existing-file', formatKey: 'existing-format', kind: 'transcode', failures: 1, confirmed: true, expiresAt: 5000 }]
});
var target = storage({
  'ploff.settings.v2': JSON.stringify(Settings.validate({ uiLanguage: 'en', cardScale: 70, settingsBackupMode: 'off' })),
  'ploff.libraryOrder.v1': JSON.stringify(['old']),
  'ploff.mediaPreference.v1.old': '{}',
  'ploff.mediaPreference.v2.old': '{}',
  'ploff.subtitle-offsets.v1': JSON.stringify({ old: 1 }),
  'ploff.subtitle-presentation.v1': JSON.stringify({ old: { subtitleSize: 90 } }),
  'ploff.playbackCompatibility.v2': originalCompatibility,
  'ploff.auth.v1': JSON.stringify({ ownerToken: 'keep-secret' })
});
Backup.apply(target, parsed, { includeCompatibility: false });
assert.strictEqual(Settings.load(target).uiLanguage, 'it');
assert.strictEqual(Settings.load(target).cardScale, 120);
assert.strictEqual(Settings.load(target).uiTextScale, 115);
assert.strictEqual(Settings.load(target).artworkDataSaver, true);
assert.strictEqual(Settings.load(target).settingsBackupMode, 'on');
assert.strictEqual(Settings.load(target).subtitleRenderingSrt, true, 'global SRT/WebVTT renderer setting must restore from settings save');
assert.strictEqual(Settings.load(target).subtitleRenderingAss, true, 'global ASS/SSA renderer setting must restore from settings save');
assert.deepStrictEqual(Settings.load(target).homeRows, ['recent', 'continue']);
assert.deepStrictEqual(JSON.parse(target.getItem('ploff.libraryOrder.v1')), ['4', '2']);
assert.strictEqual(target.getItem('ploff.mediaPreference.v1.old'), null);
assert.strictEqual(JSON.parse(target.getItem('ploff.mediaPreference.v1.sample')).audioTrack.language, 'ja');
assert.strictEqual(target.getItem('ploff.mediaPreference.v2.old'), null);
assert.ok(target.getItem('ploff.mediaPreference.v2.server%7Cprofile%7Cseason%7Cseason-a'));
assert.strictEqual(target.getItem('ploff.subtitle-presentation.v1'), null);
assert.ok(target.getItem('ploff.subtitle-presentation.v2'));
assert.strictEqual(JSON.parse(target.getItem('ploff.subtitle-offsets.v1'))['server|part|stream'], 300);
assert.strictEqual(target.getItem('ploff.playbackCompatibility.v2'), originalCompatibility, 'compatibility memory must be preserved when models differ');
assert.strictEqual(target.getItem('ploff.auth.v1'), JSON.stringify({ ownerToken: 'keep-secret' }));

Backup.apply(target, parsed, { includeCompatibility: true });
assert.ok(target.getItem('ploff.playbackCompatibility.v3'), 'compatibility memory must load into the current v3 key when models match');
assert.strictEqual(target.getItem('ploff.playbackCompatibility.v2'), null, 'loading current compatibility memory must remove the stale v2 key');
assert.strictEqual(JSON.parse(target.getItem('ploff.playbackCompatibility.v3')).formats[0].key, 'format');

var currentCompatibilitySource = storage({
  'ploff.playbackCompatibility.v3': JSON.stringify({
    version: 3,
    meta: { model: 'OLED55', runtime: 'webOS 9 / Chrome 53', appVersion: '1.0.6', ruleVersion: 1, updatedAt: 123456700 },
    formats: [{ key: 'current-format', kind: 'direct-play', files: ['current-file-a', 'current-file-b'], failures: 2, source: 'derived' }],
    files: [{ key: 'current-file-a', formatKey: 'current-format', kind: 'direct-play', failures: 1, confirmed: true, expiresAt: 9999999999999, source: 'user-override' }]
  })
});
var currentBuilt = Backup.build(currentCompatibilitySource, settings, '1.0.6', function () { return 123456789; }, {
  device: { id: 'living-room', name: 'Living room', model: 'OLED55' }
});
var currentParsed = Backup.parse(currentBuilt.summary);
assert.deepStrictEqual(currentParsed.compatibility.meta, { model: 'OLED55', runtime: 'webOS 9 / Chrome 53', appVersion: '1.0.6', ruleVersion: 1, updatedAt: 123456700 }, 'current compatibility metadata must survive a settings save');
assert.strictEqual(currentParsed.compatibility.files[0].source, 'user-override', 'compatibility provenance must survive a settings save');

var oversizedValues = {};
var index;
for (index = 0; index < 300; index += 1) {
  oversizedValues['ploff.mediaPreference.v1.' + index] = JSON.stringify({ audioTrack: { language: 'ja', name: new Array(101).join('x') }, subtitlesOff: false });
}
var bounded = Backup.build(storage(oversizedValues), settings, '1.0.6', function () { return 123456789; }, {
  device: { id: 'living-room', name: 'Living room', model: 'OLED55' }
});
assert(bounded.encodedBytes <= Backup.MAX_ENCODED_BYTES, 'lower-priority data must be trimmed to the budget');
assert(bounded.omitted.length > 0);

assert.throws(function () { Backup.parse('not-a-save'); }, /marker/i);
assert.throws(function () { Backup.parse(Backup.MARKER + '{"format":"ploff-settings","version":99,"settings":{}}'); }, /version/i);


(function legacyV2FixturesNormalizeWithoutInventingMissingSettings() {
  var sharedFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings-backup/v2-shared.json'), 'utf8'));
  var deviceFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings-backup/v2-device.json'), 'utf8'));
  var currentFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings-backup/v3-device.json'), 'utf8'));
  var shared = Backup.parse('PLOFF_SETTINGS:2:' + JSON.stringify(sharedFixture));
  var device = Backup.parse('PLOFF_SETTINGS:2:' + JSON.stringify(deviceFixture));
  var current = Backup.parse(Backup.MARKER + JSON.stringify(currentFixture));

  assert.strictEqual(shared.sourceVersion, 2, 'legacy shared saves must retain their source version for migration logic');
  assert.strictEqual(shared.legacyKind, 'shared');
  assert.strictEqual(shared.settings.uiLanguage, 'it');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(shared.settings, 'cardScale'), false, 'legacy shared parsing must not invent device settings from current defaults');
  assert.strictEqual(device.sourceVersion, 2, 'legacy device saves must retain their source version for migration logic');
  assert.strictEqual(device.legacyKind, 'device');
  assert.strictEqual(device.device.id, 'legacy-living-room');
  assert.strictEqual(device.settings.cardScale, 70);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(device.settings, 'uiLanguage'), false, 'legacy device parsing must not invent shared settings from current defaults');
  assert.strictEqual(device.compatibility.version, 3, 'legacy device compatibility must normalize to the current compatibility schema');
  assert.strictEqual(current.sourceVersion, 3, 'current saves must report their current source version');
  assert.strictEqual(current.device.id, 'current-bedroom');
}());

console.log('Settings save format tests passed');

(function migrationStateSurvivesBackupRoundTrip() {
  var MediaPreferences = require('../app/media-preferences');
  var source = storage();
  var detail = { type: 'episode', ratingKey: 'ep', parentRatingKey: 'season', showRatingKey: 'show' };
  var id = 'server|profile';
  source.setItem(MediaPreferences.LEGACY_STORAGE_PREFIX + encodeURIComponent('server:profile:show:show'), JSON.stringify({ audioTrack: { language: 'ja' } }));
  MediaPreferences.loadScopes(source, id, detail);
  MediaPreferences.updateSelection(source, id, detail, { audioTrack: null });
  source.setItem(MediaPreferences.scopeKey(id, 'season', 'pending'), JSON.stringify({ legacyVersion: { mediaIndex: 2, partIndex: 1 } }));
  var restored = storage();
  Backup.apply(restored, Backup.parse(Backup.build(source, settings, '1.0.6', function () { return 123; }, {
    device: { id: 'test-device', name: 'Test device' }
  }).summary));
  assert.strictEqual(MediaPreferences.loadScopes(restored, id, detail).season, null,
    'backup restore must retain the reset marker and not resurrect legacy selection');
  assert.deepStrictEqual(JSON.parse(restored.getItem(MediaPreferences.scopeKey(id, 'season', 'pending'))).legacyVersion, { mediaIndex: 2, partIndex: 1 },
    'pending version migration must survive serialization and parsing');
}());
