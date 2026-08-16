'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var CompatibilityMemory = require('../app/playback-compatibility-memory');

var storageValue = null;
var now = 1700000000000;
var storage = {
  getItem: function () { return storageValue; },
  setItem: function (key, value) { storageValue = value; }
};

function request(kind, fileIdentity) {
  return {
    kind: kind || 'direct-play',
    serverIdentity: 'server-1',
    mediaIdentity: 'episode-1',
    fileIdentity: fileIdentity || 'file-1',
    version: {
      container: 'mkv',
      videoCodec: 'hevc',
      width: 1920,
      height: 1080,
      videoDynamicRange: 'sdr',
      videoDetails: { bitDepth: '10' },
      audioCodec: 'aac',
      audioChannels: 2,
      subtitleCodec: 'srt',
      subtitleFormat: 'srt',
      subtitleSource: 'external'
    }
  };
}

var memory = CompatibilityMemory.create({
  storage: storage,
  now: function () { return now; }
});

assert.strictEqual(memory.shouldSkip(request()), false, 'an unseen compatibility combination must be attempted');
memory.recordFailure(request(), { confirmed: false });
assert.strictEqual(memory.shouldSkip(request()), true, 'a failed file must be skipped on the next automatic attempt');
assert.strictEqual(memory.shouldSkip(request('direct-stream')), false, 'Direct Play failures must not suppress Direct Stream');
assert.strictEqual(memory.snapshot().fileExceptionCount, 1, 'a failed file must be counted');
assert.strictEqual(memory.snapshot().formatRuleCount, 0, 'one weak failure must not create a global format rule');

memory.recordFailure(request('direct-play', 'file-2'), { confirmed: false });
assert.strictEqual(memory.shouldSkip(request()), true, 'repeated failures must keep the original file exception');
assert.strictEqual(memory.snapshot().formatRuleCount, 1, 'repeated failures on distinct files must create a persistent format rule');

assert.strictEqual(memory.shouldSkip(request('direct-play', 'file-3')), true, 'a known format rule must suppress another matching file');
assert.strictEqual(memory.shouldSkip(request('direct-stream', 'file-3')), false, 'format rules must remain specific to the failed delivery mode');

memory.recordFailure(request('direct-stream', 'file-3'), { confirmed: true });
assert.strictEqual(memory.shouldSkip(request('direct-stream', 'file-3')), true, 'confirmed native failures must create a file exception');
assert.strictEqual(memory.snapshot().formatRuleCount, 1, 'a single confirmed failure must not create another global rule');

var reloaded = CompatibilityMemory.create({
  storage: storage,
  now: function () { return now; }
});
assert.strictEqual(reloaded.shouldSkip(request('direct-play', 'file-4')), true, 'format rules must persist across app instances');
assert.strictEqual(reloaded.shouldSkip(request('direct-stream', 'file-3')), true, 'file exceptions must persist across app instances');

reloaded.recordSuccess(request('direct-stream', 'file-3'));
assert.strictEqual(reloaded.shouldSkip(request('direct-stream', 'file-3')), false, 'a successful direct attempt must clear only its file exception');
assert.strictEqual(reloaded.snapshot().formatRuleCount, 1, 'a successful file must not erase a persistent format rule');

now += 31 * 24 * 60 * 60 * 1000;
assert.strictEqual(reloaded.shouldSkip(request('direct-play', 'file-1')), true, 'persistent format rules must not expire');
assert.strictEqual(reloaded.shouldSkip(request('direct-stream', 'file-3')), false, 'file exceptions must expire after thirty days');
assert.strictEqual(reloaded.snapshot().fileExceptionCount, 0, 'expired file exceptions must be pruned');


var trackSpecific = request('direct-play', 'file-track');
trackSpecific.context = { serverIdentity: 'server-1', mediaIdentity: 'episode-1', fileIdentity: 'file-track', audioStreamID: '7', subtitleStreamID: '12' };
trackSpecific.audio = { codec: 'ac3', channels: 6, language: 'it' };
trackSpecific.subtitles = { codec: 'srt', format: 'srt', source: 'external', language: 'it', forced: true };
memory.recordFailure(trackSpecific, { confirmed: true });
var differentTrack = request('direct-play', 'file-track');
differentTrack.context = { serverIdentity: 'server-1', mediaIdentity: 'episode-1', fileIdentity: 'file-track', audioStreamID: '8', subtitleStreamID: '12' };
differentTrack.audio = { codec: 'aac', channels: 2, language: 'it' };
differentTrack.subtitles = { codec: 'srt', format: 'srt', source: 'external', language: 'it', forced: true };
assert.strictEqual(memory.shouldSkip(differentTrack), false, 'a different selected audio track must not inherit a file-specific exception');
var differentBitDepth = request('direct-play', 'file-bitdepth');
differentBitDepth.version.videoDetails.bitDepth = '8';
assert.strictEqual(memory.shouldSkip(differentBitDepth), false, '8-bit and 10-bit video must not share a global format rule');

var serialized = String(storageValue || '');
assert.strictEqual(serialized.indexOf('server-1'), -1, 'storage must not expose server identities');
assert.strictEqual(serialized.indexOf('file-3'), -1, 'storage must not expose file identities');
assert.strictEqual(serialized.indexOf('/opt/'), -1, 'storage must not expose file paths');

reloaded.clearFormatRules();
assert.strictEqual(reloaded.snapshot().formatRuleCount, 0, 'format rules must be clearable independently');
reloaded.clearFileExceptions();
assert.strictEqual(reloaded.snapshot().fileExceptionCount, 0, 'file exceptions must be clearable independently');

assert.strictEqual(CompatibilityMemory.VERSION, 3, 'compatibility memory must expose schema version 3');
assert.strictEqual(CompatibilityMemory.STORAGE_KEY, 'ploff.playbackCompatibility.v3', 'compatibility memory must use the v3 storage key');

var metadataStorageData = {};
var metadataStorage = {
  getItem: function (key) { return metadataStorageData[key] || null; },
  setItem: function (key, value) { metadataStorageData[key] = value; }
};
var metadataMemory = CompatibilityMemory.create({
  storage: metadataStorage,
  now: function () { return 1800000000000; },
  metadata: function () { return { model: 'OLED42', runtime: 'webOS 4 / Chrome 53', appVersion: '1.0.7' }; }
});
metadataMemory.recordFailure(request('direct-play', 'metadata-file-1'), { confirmed: true, source: 'observation' });
metadataMemory.recordFailure(request('direct-play', 'metadata-file-2'), { confirmed: true, source: 'user-override' });
var metadataStored = JSON.parse(metadataStorageData['ploff.playbackCompatibility.v3']);
assert.deepStrictEqual(metadataStored.meta, { model: 'OLED42', runtime: 'webOS 4 / Chrome 53', appVersion: '1.0.7', ruleVersion: 1, updatedAt: 1800000000000 }, 'compatibility state must persist bounded device and rule metadata');
assert.strictEqual(metadataStored.files[0].source, 'observation', 'automatic failures must be marked as observations');
assert.strictEqual(metadataStored.files[1].source, 'user-override', 'explicit overrides must retain their provenance');
assert.strictEqual(metadataStored.formats[0].source, 'derived', 'format-level rules must be marked as derived decisions');
assert.deepStrictEqual(metadataMemory.snapshot(), {
  schemaVersion: 3, ruleVersion: 1, updatedAt: 1800000000000, deviceModel: 'OLED42', runtime: 'webOS 4 / Chrome 53', appVersion: '1.0.7',
  formatRuleCount: 1, fileExceptionCount: 2, fileExceptionTtlDays: 30
}, 'compatibility snapshot must expose safe support metadata without identities');

var legacyFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/compatibility/v2.json'), 'utf8'));
var legacyData = { 'ploff.playbackCompatibility.v2': JSON.stringify(legacyFixture) };
var legacyMemory = CompatibilityMemory.create({
  storage: {
    getItem: function (key) { return legacyData[key] || null; },
    setItem: function (key, value) { legacyData[key] = value; }
  },
  now: function () { return 1800000000000; },
  metadata: { model: 'OLED55', runtime: 'webOS 5', appVersion: '1.0.7' }
});
assert.strictEqual(legacyMemory.snapshot().schemaVersion, 3, 'v2 compatibility memory must migrate in memory to v3');
assert.strictEqual(legacyMemory.snapshot().formatRuleCount, 1, 'v2 fixture format rules must survive migration');
assert.strictEqual(legacyMemory.snapshot().fileExceptionCount, 1, 'v2 fixture file exceptions must survive migration');
legacyMemory.recordSuccess(request('direct-play', 'unrelated'));
assert.ok(legacyData['ploff.playbackCompatibility.v3'], 'the next compatibility write must persist migrated state under the v3 key');


(function currentCompatibilityFixtureLoadsWithoutSchemaDrift() {
  var currentFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/compatibility/v3.json'), 'utf8'));
  var currentData = { 'ploff.playbackCompatibility.v3': JSON.stringify(currentFixture) };
  var currentMemory = CompatibilityMemory.create({
    storage: {
      getItem: function (key) { return currentData[key] || null; },
      setItem: function (key, value) { currentData[key] = value; }
    },
    now: function () { return 1800000000000; },
    metadata: { model: 'OLED55', runtime: 'webOS 5 / Chrome 53', appVersion: '1.0.6' }
  });
  assert.deepStrictEqual(currentMemory.snapshot(), {
    schemaVersion: 3,
    ruleVersion: 1,
    updatedAt: 1800000000000,
    deviceModel: 'OLED55',
    runtime: 'webOS 5 / Chrome 53',
    appVersion: '1.0.6',
    formatRuleCount: 1,
    fileExceptionCount: 1,
    fileExceptionTtlDays: 30
  }, 'current compatibility fixture must load without losing metadata or learned-state counts');
}());

console.log('Playback compatibility memory checks passed');
