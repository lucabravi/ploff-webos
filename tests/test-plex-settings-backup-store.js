'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Store = require('../app/plex-settings-backup-store');
var Settings = require('../app/settings');

function createStorage(initial) {
  var values = Object.assign({}, initial || {});
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    key: function (index) { return Object.keys(values)[index] || null; },
    get length() { return Object.keys(values).length; },
    values: values
  };
}

var playlists = [];
var nextKey = 1;
var transport = {
  list: function (_config, prefix, marker, callback) {
    callback(null, playlists.filter(function (item) {
      return item.title.indexOf(prefix) === 0 && item.summary.indexOf(marker) === 0;
    }));
  },
  create: function (_config, title, callback) {
    var item = { ratingKey: 'save-' + nextKey, title: title, summary: '' };
    nextKey += 1;
    playlists.push(item);
    callback(null, item);
  },
  update: function (_config, ratingKey, summary, callback) {
    playlists.filter(function (item) { return item.ratingKey === ratingKey; })[0].summary = summary;
    callback(null);
  },
  remove: function (_config, ratingKey, callback) {
    playlists = playlists.filter(function (item) { return item.ratingKey !== ratingKey; });
    callback(null);
  }
};

function compatibility(key) {
  return JSON.stringify({
    version: 2,
    formats: [{ key: key, kind: 'direct-play', files: [key + '-file'], failures: 1 }],
    files: [{ key: key + '-file', formatKey: key, kind: 'direct-play', failures: 1, confirmed: true, expiresAt: 9999999999999 }]
  });
}

function createStore(storage, settings, now, model) {
  return Store.create({
    storage: storage,
    settings: function () { return settings.value; },
    config: function () { return { apiBaseUrl: 'http://plex', token: 'token' }; },
    deviceInfo: function () { return { modelName: model, webOSVersion: '9.0', screenWidth: 1920, screenHeight: 1080 }; },
    appVersion: '1.0.6', now: function () { return now.value; }, random: function () { return 0.5; },
    transport: transport
  });
}

var now = { value: 1000 };
var livingStorage = createStorage({ 'ploff.playbackCompatibility.v2': compatibility('living-format') });
var livingSettings = { value: Settings.validate({ uiLanguage: 'it', cardScale: 120, settingsBackupMode: 'on' }) };
Settings.save(livingStorage, livingSettings.value);
var livingStore = createStore(livingStorage, livingSettings, now, 'OLED55');

livingStore.save(function (error) {
  assert(error && error.name === 'DeviceNameRequiredError', 'first save must request a device name');
});
livingStore.registerDevice('Living room', function (error, saved) {
  assert.ifError(error);
  assert.strictEqual(playlists.length, 1, 'a device must create exactly one settings playlist');
  assert.strictEqual(saved.currentProfile.name, 'Living room');
  assert.strictEqual(saved.settingsMatch, true, 'a completed save must match the active settings');
});
var livingId = livingStore.deviceProfile().id;

now.value = 2000;
var bedroomStorage = createStorage({ 'ploff.playbackCompatibility.v2': compatibility('bedroom-format') });
var bedroomSettings = { value: Settings.validate({ uiLanguage: 'en', cardScale: 70, settingsBackupMode: 'on' }) };
Settings.save(bedroomStorage, bedroomSettings.value);
var bedroomStore = createStore(bedroomStorage, bedroomSettings, now, 'OLED42');
bedroomStore.registerDevice('Bedroom', function (error) { assert.ifError(error); });
var bedroomId = bedroomStore.deviceProfile().id;
assert.strictEqual(playlists.length, 2, 'two TVs must have two independent settings playlists');

livingStore.status(function (error, status) {
  assert.ifError(error);
  assert.strictEqual(status.profiles.length, 2);
  assert.strictEqual(status.sharedExists, undefined, 'shared settings state must no longer exist');
  assert.strictEqual(status.settingsMatch, true, 'the current device status must report matching saved settings');
});

livingSettings.value.cardScale = 70;
livingStore.status(function (error, status) {
  assert.ifError(error);
  assert.strictEqual(status.settingsMatch, false, 'changing an active setting must invalidate the saved-state marker');
});
livingSettings.value.cardScale = 120;

bedroomStore.load(livingId, { sameDevice: false, deviceName: 'Bedroom' }, function (error, _status, loaded) {
  assert.ifError(error);
  assert.strictEqual(bedroomStore.deviceProfile().id, bedroomId, 'loading another TV must preserve the current device id');
  assert.strictEqual(bedroomStore.deviceProfile().name, 'Bedroom');
  assert.strictEqual(loaded.settings.uiLanguage, 'it', 'portable settings must load across different models');
  assert.strictEqual(loaded.settings.cardScale, 120, 'presentation settings must load across different models');
  assert.strictEqual(loaded.compatibilityApplied, false, 'compatibility memory must not load across different models');
  assert.strictEqual(JSON.parse(bedroomStorage.getItem('ploff.playbackCompatibility.v2')).formats[0].key, 'bedroom-format');
});

now.value = 3000;
var officeStorage = createStorage({ 'ploff.playbackCompatibility.v2': compatibility('office-format') });
var officeSettings = { value: Settings.validate({ uiLanguage: 'de', cardScale: 80, settingsBackupMode: 'off' }) };
Settings.save(officeStorage, officeSettings.value);
var officeStore = createStore(officeStorage, officeSettings, now, ' oled55 ');
officeStore.registerDevice('Office', function (error) { assert.ifError(error); });
var officeId = officeStore.deviceProfile().id;
officeStore.load(livingId, { sameDevice: false, deviceName: 'Studio' }, function (error, _status, loaded) {
  assert.ifError(error);
  assert.strictEqual(officeStore.deviceProfile().id, officeId, 'same-model import from another TV must still preserve identity');
  assert.strictEqual(officeStore.deviceProfile().name, 'Studio', 'loading as another TV may rename the current device');
  assert.strictEqual(loaded.compatibilityApplied, true, 'compatibility memory may load when model names match');
  assert.strictEqual(JSON.parse(officeStorage.getItem('ploff.playbackCompatibility.v3')).formats[0].key, 'living-format');
  assert.strictEqual(officeStorage.getItem('ploff.playbackCompatibility.v2'), null, 'same-model import must migrate compatibility memory to the current key');
});

var replacementStorage = createStorage({ 'ploff.playbackCompatibility.v2': compatibility('replacement-format') });
var replacementSettings = { value: Settings.validate({ uiLanguage: 'fr', cardScale: 90, settingsBackupMode: 'off' }) };
Settings.save(replacementStorage, replacementSettings.value);
var replacementStore = createStore(replacementStorage, replacementSettings, now, 'OLED55');
replacementStore.load(livingId, { sameDevice: true }, function (error, _status, loaded) {
  assert.ifError(error);
  assert.strictEqual(replacementStore.deviceProfile().id, livingId, 'same-device recovery must adopt the saved device id');
  assert.strictEqual(replacementStore.deviceProfile().name, 'Living room');
  assert.strictEqual(loaded.compatibilityApplied, true);
  assert.strictEqual(JSON.parse(replacementStorage.getItem('ploff.playbackCompatibility.v3')).formats[0].key, 'living-format');
});

livingStore.remove(function (error, status) {
  assert.ifError(error);
  assert.strictEqual(playlists.length, 2, 'deleting one TV save must leave other device saves untouched');
  assert.strictEqual(status.profiles.some(function (profile) { return profile.id === livingId; }), false);
  assert.strictEqual(status.profiles.length, 2);
});


(function legacyV2SharedAndDeviceSavesAreRecomposedForRecovery() {
  var shared = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings-backup/v2-shared.json'), 'utf8'));
  var device = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/settings-backup/v2-device.json'), 'utf8'));
  var legacyPlaylists = [
    { ratingKey: 'legacy-shared', title: 'Ploff Settings Backup - Shared - Do Not Delete', summary: 'PLOFF_SETTINGS:2:' + JSON.stringify(shared) },
    { ratingKey: 'legacy-device', title: 'Ploff Settings Backup - Device - Legacy Living room - Do Not Delete', summary: 'PLOFF_SETTINGS:2:' + JSON.stringify(device) }
  ];
  var targetStorage = createStorage({});
  var targetSettings = { value: Settings.validate({ uiLanguage: 'en', cardScale: 100, settingsBackupMode: 'off' }) };
  var legacyTransport = {
    list: function (_config, prefix, marker, callback) {
      callback(null, legacyPlaylists.filter(function (item) {
        return item.title.indexOf(prefix) === 0 && (!marker || item.summary.indexOf(marker) === 0);
      }));
    },
    create: function () { throw new Error('legacy recovery must not create a playlist'); },
    update: function () { throw new Error('legacy recovery must not rewrite a playlist'); },
    remove: function () { throw new Error('legacy recovery must not delete a playlist'); }
  };
  var legacyStore = Store.create({
    storage: targetStorage,
    settings: function () { return targetSettings.value; },
    config: function () { return { apiBaseUrl: 'http://plex', token: 'token' }; },
    deviceInfo: function () { return { modelName: 'OLED55', webOSVersion: '9.0', screenWidth: 1920, screenHeight: 1080 }; },
    appVersion: '1.0.6', now: function () { return 5000; }, random: function () { return 0.5; },
    transport: legacyTransport
  });

  legacyStore.status(function (error, status) {
    assert.ifError(error);
    assert.strictEqual(status.profiles.length, 1, 'legacy shared/device playlists must appear as one recoverable TV profile');
    assert.strictEqual(status.profiles[0].id, 'legacy-living-room');
  });
  legacyStore.load('legacy-living-room', { sameDevice: true }, function (error, _status, loaded) {
    assert.ifError(error);
    assert.strictEqual(loaded.settings.uiLanguage, 'it', 'legacy shared settings must merge into the legacy device snapshot');
    assert.strictEqual(loaded.settings.visualTheme, 'classic', 'legacy shared presentation settings must survive recovery');
    assert.strictEqual(loaded.settings.cardScale, 70, 'legacy device settings must survive recovery');
    assert.strictEqual(loaded.settings.settingsBackupMode, 'on', 'legacy sync mode must normalize to current automatic save mode');
    assert.strictEqual(loaded.compatibilityApplied, true, 'legacy compatibility memory may be restored on the same TV model');
    assert.deepStrictEqual(JSON.parse(targetStorage.getItem('ploff.libraryOrder.v1')), ['4', '2'], 'legacy shared library order must survive recovery');
    assert.strictEqual(legacyStore.deviceProfile().id, 'legacy-living-room', 'same-device recovery must adopt the legacy device identity');
  });
}());

console.log('Plex settings save store tests passed');
