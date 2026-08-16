(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./settings-backup-format')); }
  else { root.PloffPlexSettingsBackupStore = factory(root.PloffSettingsBackupFormat); }
}(this, function (Format) {
  'use strict';

  var DEVICE_PROFILE_KEY = 'ploff.settingsBackup.device.v1';

  function create(options) {
    var values = options || {};
    var storage = values.storage;
    var transport = values.transport || {};
    var timer = null;
    var destroyed = false;

    function currentSettings() { return typeof values.settings === 'function' ? values.settings() : {}; }
    function currentConfig() { return typeof values.config === 'function' ? values.config() : {}; }
    function currentDeviceInfo() { return typeof values.deviceInfo === 'function' ? (values.deviceInfo() || {}) : {}; }
    function clean(value, maximum) { return String(value || '').replace(/^\s+|\s+$/g, '').slice(0, maximum); }
    function normalizedModel(value) { return clean(value, 80).toLowerCase(); }
    function readProfile() {
      var parsed;
      try { parsed = JSON.parse(storage && storage.getItem ? storage.getItem(DEVICE_PROFILE_KEY) || 'null' : 'null'); }
      catch (_error) { parsed = null; }
      if (!parsed || !clean(parsed.id, 80) || !clean(parsed.name, 80)) { return null; }
      return { id: clean(parsed.id, 80), name: clean(parsed.name, 80) };
    }
    function writeProfile(profile) {
      var normalized = { id: clean(profile && profile.id, 80), name: clean(profile && profile.name, 80) };
      if (!normalized.id || !normalized.name) { throw new Error('A device name is required'); }
      if (storage && storage.setItem) { storage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(normalized)); }
      return normalized;
    }
    function newId() {
      var now = typeof values.now === 'function' ? Number(values.now()) : new Date().getTime();
      var random = typeof values.random === 'function' ? Number(values.random()) : Math.random();
      return 'device-' + Math.max(0, now).toString(36) + '-' + Math.floor(Math.max(0, random) * 1679616).toString(36);
    }
    function deviceRecord(profile) {
      var info = currentDeviceInfo();
      return {
        id: profile.id, name: profile.name, model: clean(info.modelName || info.model, 80),
        webOS: clean(info.webOSVersion || info.version || '', 40),
        width: Math.max(0, Number(info.screenWidth || 0)), height: Math.max(0, Number(info.screenHeight || 0))
      };
    }
    function sameModel(savedDevice) {
      var info = currentDeviceInfo();
      var current = normalizedModel(info.modelName || info.model);
      var saved = normalizedModel(savedDevice && savedDevice.model);
      return !!current && !!saved && current === saved;
    }
    function unavailable(callback) {
      var config = currentConfig();
      if (!config.apiBaseUrl || !config.token) {
        callback(new Error('A connected Plex server is required'));
        return true;
      }
      return false;
    }
    function list(callback) {
      if (destroyed || unavailable(callback)) { return null; }
      return transport.list(currentConfig(), Format.PLAYLIST_PREFIX, '', callback);
    }
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function mergeLegacyPair(shared, device) {
      var merged = copy(device);
      var settings = {};
      Object.keys(shared.settings || {}).forEach(function (key) { settings[key] = copy(shared.settings[key]); });
      Object.keys(device.settings || {}).forEach(function (key) { settings[key] = copy(device.settings[key]); });
      merged.settings = settings;
      if (shared.hasLibraryOrder) { merged.libraryOrder = copy(shared.libraryOrder); merged.hasLibraryOrder = true; }
      if (shared.hasMediaPreferences) { merged.mediaPreferences = copy(shared.mediaPreferences); merged.hasMediaPreferences = true; }
      if (shared.hasSubtitleOffsets) { merged.subtitleOffsets = copy(shared.subtitleOffsets); merged.hasSubtitleOffsets = true; }
      return merged;
    }
    function records(items) {
      var result = [];
      var shared = null;
      (items || []).forEach(function (item) {
        var parsed;
        try { parsed = Format.parse(item.summary); }
        catch (_error) { return; }
        result.push({ item: item, parsed: parsed, encodedBytes: Format.encodedBytes(item.summary) });
        if (parsed.sourceVersion === 2 && parsed.legacyKind === 'shared' && (!shared || parsed.createdAt >= shared.createdAt)) {
          shared = parsed;
        }
      });
      if (shared) {
        result.forEach(function (entry) {
          if (entry.parsed.sourceVersion === 2 && entry.parsed.legacyKind === 'device') {
            entry.parsed = mergeLegacyPair(shared, entry.parsed);
          }
        });
      }
      return result;
    }
    function newest(entries, predicate) {
      var selected = null;
      entries.forEach(function (entry) {
        if (!predicate(entry.parsed)) { return; }
        if (!selected || entry.parsed.createdAt >= selected.parsed.createdAt) { selected = entry; }
      });
      return selected;
    }
    function profileList(entries) {
      var byId = {};
      entries.forEach(function (entry) {
        var device = entry.parsed.device;
        if (!device || !device.id) { return; }
        if (!byId[device.id] || entry.parsed.createdAt >= byId[device.id].createdAt) {
          byId[device.id] = {
            id: device.id, name: device.name, model: device.model, webOS: device.webOS,
            width: device.width, height: device.height, createdAt: entry.parsed.createdAt,
            appVersion: entry.parsed.appVersion, encodedBytes: entry.encodedBytes
          };
        }
      });
      return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (left, right) {
        return String(left.name).localeCompare(String(right.name));
      });
    }
    function result(entries) {
      var profiles = profileList(entries);
      var current = readProfile();
      var currentSave = current ? newest(entries, function (parsed) { return parsed.device && parsed.device.id === current.id; }) : null;
      var used = 0;
      entries.forEach(function (entry) { used += entry.encodedBytes; });
      return {
        exists: profiles.length > 0, profiles: profiles, currentProfile: current, needsDeviceName: !current,
        currentExists: !!currentSave, encodedBytes: used,
        limitBytes: Format.MAX_ENCODED_BYTES * Math.max(1, entries.length),
        settingsMatch: !!currentSave && Format.settingsEqual(currentSettings(), currentSave.parsed.settings),
        createdAt: currentSave ? currentSave.parsed.createdAt : 0,
        appVersion: currentSave ? currentSave.parsed.appVersion : ''
      };
    }
    function status(callback) {
      return list(function (error, items) {
        if (error) { callback(error); return; }
        callback(null, result(records(items)));
      });
    }
    function upsert(entries, built, title, profileId, callback) {
      var existing = newest(entries, function (parsed) { return parsed.device && parsed.device.id === profileId; });
      function update(item) {
        transport.update(currentConfig(), item.ratingKey, built.summary, function (error) {
          callback(error || null, { ratingKey: item.ratingKey, summary: built.summary });
        });
      }
      if (existing) { update(existing.item); return; }
      transport.create(currentConfig(), title, function (error, created) {
        if (error) { callback(error); return; }
        update(created);
      });
    }
    function save(callback) {
      var profile = readProfile();
      var built;
      if (destroyed || unavailable(callback)) { return null; }
      if (!profile) {
        var missing = new Error('A device name is required');
        missing.name = 'DeviceNameRequiredError';
        callback(missing);
        return null;
      }
      try { built = Format.build(storage, currentSettings(), values.appVersion, values.now, { device: deviceRecord(profile) }); }
      catch (buildError) { callback(buildError); return null; }
      return list(function (error, items) {
        var entries;
        if (error) { callback(error); return; }
        entries = records(items);
        upsert(entries, built, Format.devicePlaylistTitle(profile.name), profile.id, function (saveError) {
          var nextEntries;
          if (saveError) { callback(saveError); return; }
          nextEntries = entries.filter(function (entry) { return !(entry.parsed.device && entry.parsed.device.id === profile.id); });
          nextEntries.push({
            item: { title: Format.devicePlaylistTitle(profile.name), summary: built.summary },
            parsed: built.save, encodedBytes: built.encodedBytes
          });
          callback(null, result(nextEntries));
        });
      });
    }
    function registerDevice(name, callback) {
      var normalized = clean(name, 80);
      var profile = readProfile();
      if (!normalized) { callback(new Error('A device name is required')); return null; }
      writeProfile({ id: profile ? profile.id : newId(), name: normalized });
      return save(callback);
    }
    function load(profileId, loadOptions, callback) {
      var optionsValue = loadOptions;
      if (typeof loadOptions === 'function') { callback = loadOptions; optionsValue = {}; }
      optionsValue = optionsValue || {};
      return list(function (error, items) {
        var entries;
        var selected;
        var loaded;
        var profile;
        var name;
        if (error) { callback(error); return; }
        entries = records(items);
        selected = newest(entries, function (parsed) { return parsed.device && parsed.device.id === String(profileId || ''); });
        if (!selected) { callback(new Error('No Ploff settings save was found')); return; }
        try {
          loaded = Format.apply(storage, selected.parsed, { includeCompatibility: sameModel(selected.parsed.device) });
          if (optionsValue.sameDevice === true) {
            profile = writeProfile({ id: selected.parsed.device.id, name: selected.parsed.device.name });
          } else {
            profile = readProfile();
            name = clean(optionsValue.deviceName || (profile && profile.name), 80);
            if (!name) { throw new Error('A device name is required'); }
            profile = writeProfile({ id: profile ? profile.id : newId(), name: name });
          }
        } catch (loadError) { callback(loadError); return; }
        loaded.profile = profile;
        loaded.sameModel = sameModel(selected.parsed.device);
        callback(null, result(entries), loaded);
      });
    }
    function remove(callback) {
      var profile = readProfile();
      if (!profile) { callback(null, result([])); return null; }
      return list(function (error, items) {
        var entries;
        var selected;
        if (error) { callback(error); return; }
        entries = records(items);
        selected = newest(entries, function (parsed) { return parsed.device && parsed.device.id === profile.id; });
        if (!selected) { callback(null, result(entries)); return; }
        transport.remove(currentConfig(), selected.item.ratingKey, function (removeError) {
          var remaining = entries.filter(function (entry) { return entry !== selected; });
          callback(removeError || null, result(remaining));
        });
      });
    }
    function scheduleAutoSave() {
      if (destroyed || currentSettings().settingsBackupMode === 'off' || !readProfile()) { return false; }
      if (timer) { clearTimeout(timer); }
      timer = setTimeout(function () { timer = null; save(function () {}); }, Math.max(500, Number(values.autoSaveDelay || 3000)));
      return true;
    }
    function destroy() {
      destroyed = true;
      if (timer) { clearTimeout(timer); timer = null; }
    }
    return {
      status: status, read: status, save: save, registerDevice: registerDevice, load: load,
      remove: remove, scheduleAutoSave: scheduleAutoSave,
      deviceProfile: readProfile, destroy: destroy
    };
  }
  return { DEVICE_PROFILE_KEY: DEVICE_PROFILE_KEY, create: create };
}));
