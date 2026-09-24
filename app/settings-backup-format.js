(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./settings'), require('./library-tab-store')); }
  else { root.PloffSettingsBackupFormat = factory(root.PloffSettings, root.PloffLibraryTabStore); }
}(this, function (Settings, LibraryTabStore) {
  'use strict';

  var FORMAT = 'ploff-settings';
  var VERSION = 3;
  var MARKER = 'PLOFF_SETTINGS:3:';
  var LEGACY_MARKER = 'PLOFF_SETTINGS:2:';
  var PLAYLIST_PREFIX = 'Ploff Settings Backup - ';
  var DEVICE_PLAYLIST_PREFIX = PLAYLIST_PREFIX + 'Device - ';
  var MAX_ENCODED_BYTES = 12 * 1024;
  var MEDIA_PREFERENCE_PREFIX = 'ploff.mediaPreference.v1.';
  var MEDIA_PREFERENCE_V2_PREFIX = 'ploff.mediaPreference.v2.';
  var MEDIA_SOURCE_PREFERENCE_KEY = 'ploff.mediaSourcePreference.v1';
  var LIBRARY_ORDER_KEY = 'ploff.libraryOrder.v1';
  var LIBRARY_TABS_KEY = LibraryTabStore && LibraryTabStore.STORAGE_KEY ? LibraryTabStore.STORAGE_KEY : 'ploff.libraryTabs.v1';
  var SUBTITLE_OFFSETS_KEY = 'ploff.subtitle-offsets.v1';
  var SUBTITLE_PRESENTATION_KEY = 'ploff.subtitle-presentation.v2';
  var LEGACY_SUBTITLE_PRESENTATION_KEY = 'ploff.subtitle-presentation.v1';
  var COMPATIBILITY_KEY = 'ploff.playbackCompatibility.v3';
  var LEGACY_COMPATIBILITY_KEY = 'ploff.playbackCompatibility.v2';
  var SETTINGS_KEYS = [
    'version', 'uiLanguage', 'uiLanguageExplicit', 'backgroundMusic', 'backgroundDelay',
    'autoplayDelay', 'upNextLayout', 'skipPromptDuration', 'audioLanguages',
    'subtitleLanguages', 'subtitleSuppressedForAudio', 'subtitleMode', 'subtitleModeExplicit',
    'subtitleSourcePreference', 'videoVersionPriorities', 'accentColor', 'visualTheme',
    'searchT9Input', 'showWatchlist', 'showPlaylists', 'homeRows', 'highContrast', 'strongFocus',
    'subtitleBackground', 'subtitleEdge', 'subtitleSize', 'subtitleRenderingSrt', 'subtitleRenderingAss', 'backgroundVolume', 'lanVideoQuality',
    'remoteVideoQuality', 'playbackMode', 'adaptivePlaybackMemory', 'wheelBehavior',
    'cardScale', 'uiTextScale', 'artworkQuality', 'backdropQuality', 'artworkDataSaver', 'interfaceAnimations',
    'subtitlePosition', 'safeAreaTop', 'safeAreaRight', 'safeAreaBottom', 'safeAreaLeft',
    'settingsBackupMode'
  ];

  function isArray(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function encodedBytes(value) { return encodeURIComponent(String(value || '')).length; }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
  function readJson(storage, key, fallback) {
    try {
      var raw = storage && storage.getItem ? storage.getItem(key) : '';
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) { return fallback; }
  }
  function cleanText(value, maximum) {
    // Stored playlist metadata must not contain control characters.
    // eslint-disable-next-line no-control-regex
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, maximum);
  }
  function exportedSettings(source) {
    var validated = Settings.validate(source || Settings.defaults());
    var result = {};
    SETTINGS_KEYS.forEach(function (key) { if (own(validated, key)) { result[key] = copy(validated[key]); } });
    return result;
  }
  function exportedPresentSettings(source) {
    var raw = source && typeof source === 'object' ? source : {};
    var validated = Settings.validate(raw);
    var result = {};
    SETTINGS_KEYS.forEach(function (key) {
      if (own(raw, key) && own(validated, key)) { result[key] = copy(validated[key]); }
    });
    return result;
  }
  function settingsEqual(left, right) {
    return JSON.stringify(exportedSettings(left)) === JSON.stringify(exportedSettings(right));
  }
  function libraryOrder(storage) {
    var value = readJson(storage, LIBRARY_ORDER_KEY, []);
    return isArray(value) ? value.map(String) : [];
  }
  function libraryTabs(storage) {
    var raw;
    if (!storage || !storage.getItem || !LibraryTabStore || typeof LibraryTabStore.validate !== 'function') { return null; }
    try { raw = storage.getItem(LIBRARY_TABS_KEY); } catch (_error) { return null; }
    if (!raw) { return null; }
    return LibraryTabStore.validate(readJson(storage, LIBRARY_TABS_KEY, {}));
  }
  function subtitleOffsetsFromValue(value) {
    var result = {};
    Object.keys(value && typeof value === 'object' ? value : {}).sort().forEach(function (key) {
      var offset = Number(value[key]);
      if (isFinite(offset) && offset >= -600000 && offset <= 600000) { result[String(key)] = Math.round(offset); }
    });
    return result;
  }
  function subtitleOffsets(storage) { return subtitleOffsetsFromValue(readJson(storage, SUBTITLE_OFFSETS_KEY, {})); }
  function trackPreference(value) {
    var index;
    var result;
    if (!value || typeof value !== 'object') { return null; }
    result = {
      language: String(value.language || ''), name: String(value.name || ''), codec: String(value.codec || ''),
      channels: Math.max(0, Number(value.channels || 0)), external: value.external === true
    };
    if (own(value, 'forced')) { result.forced = value.forced === true; }
    if (own(value, 'index')) { index = Number(value.index); if (isFinite(index) && index >= 0) { result.index = index; } }
    return result;
  }
  function mediaPreference(value, preserveEmpty) {
    var mediaIndex;
    var partIndex;
    if (!value || typeof value !== 'object') { return null; }
    if (preserveEmpty === true && !Object.keys(value).length) { return {}; }
    var legacy = value.legacyVersion || value;
    mediaIndex = legacy.mediaIndex === null || legacy.mediaIndex === undefined ? null : Number(legacy.mediaIndex);
    partIndex = legacy.partIndex === null || legacy.partIndex === undefined ? null : Number(legacy.partIndex);
    var result = {
      audioTrack: trackPreference(value.audioTrack), subtitleTrack: trackPreference(value.subtitleTrack),
      subtitlesOff: value.subtitlesOff === true
    };
    if (value.versionSignature && typeof value.versionSignature === 'object') {
      result.versionSignature = {
        videoCodec: String(value.versionSignature.videoCodec || '').toLowerCase(),
        container: String(value.versionSignature.container || '').toLowerCase(),
        width: Math.max(0, Number(value.versionSignature.width || 0)),
        height: Math.max(0, Number(value.versionSignature.height || 0)),
        bitrate: Math.max(0, Number(value.versionSignature.bitrate || 0)),
        hdr: value.versionSignature.hdr === true || value.versionSignature.hdr === 1 ? 1 : 0
      };
    }
    if (mediaIndex !== null && isFinite(mediaIndex) && mediaIndex >= 0) { result.legacyVersion = { mediaIndex: mediaIndex, partIndex: isFinite(partIndex) && partIndex >= 0 ? partIndex : 0 }; }
    return result;
  }
  function mediaSourcePreferenceEntry(guidValue, machineValue) {
    var guid;
    var machine;
    if (typeof guidValue !== 'string' || typeof machineValue !== 'string') { return null; }
    guid = cleanText(guidValue, 500);
    machine = cleanText(machineValue, 240);
    if (guid.indexOf('plex://') !== 0 || !/^[A-Za-z0-9._-]+$/.test(machine)) { return null; }
    return { guid: guid, serverMachineIdentifier: machine };
  }
  function mediaSourcePreferencesFromValue(value) {
    var result = [];
    if (isArray(value)) {
      value.slice(0, 512).forEach(function (entry) {
        var sanitized = mediaSourcePreferenceEntry(entry && entry.guid, entry && entry.serverMachineIdentifier);
        if (sanitized) { result.push(sanitized); }
      });
    } else if (value && typeof value === 'object') {
      Object.keys(value).sort().slice(0, 512).forEach(function (guid) {
        var sanitized = mediaSourcePreferenceEntry(guid, value[guid]);
        if (sanitized) { result.push(sanitized); }
      });
    }
    result.sort(function (left, right) { return left.guid < right.guid ? -1 : (left.guid > right.guid ? 1 : 0); });
    return result;
  }
  function mediaSourcePreferences(storage) {
    return mediaSourcePreferencesFromValue(readJson(storage, MEDIA_SOURCE_PREFERENCE_KEY, {}));
  }
  function mediaPreferences(storage) {
    var result = [];
    var keys = [];
    var index;
    var key;
    if (!storage || !storage.key) { return result; }
    try {
      for (index = 0; index < storage.length; index += 1) {
        key = String(storage.key(index) || '');
        if (key.indexOf(MEDIA_PREFERENCE_PREFIX) === 0 || key.indexOf(MEDIA_PREFERENCE_V2_PREFIX) === 0) { keys.push(key); }
      }
    } catch (_error) { return result; }
    keys.sort().forEach(function (storageKey) {
      var isV2 = storageKey.indexOf(MEDIA_PREFERENCE_V2_PREFIX) === 0;
      var value = mediaPreference(readJson(storage, storageKey, null), isV2);
      if (value) {
        result.push({
          key: storageKey.slice(storageKey.indexOf(MEDIA_PREFERENCE_PREFIX) === 0 ? MEDIA_PREFERENCE_PREFIX.length : MEDIA_PREFERENCE_V2_PREFIX.length),
          storage: isV2 ? 'v2' : 'v1', value: value
        });
      }
    });
    return result;
  }
  function subtitleTrack(value) {
    var result;
    var index;
    if (!value || typeof value !== 'object') { return null; }
    result = {
      language: cleanText(value.language, 40), format: cleanText(value.format || value.codec, 20),
      external: value.external === true, title: cleanText(value.title, 120), forced: value.forced === true
    };
    if (value.index !== null && value.index !== undefined && isFinite(Number(value.index)) && Number(value.index) >= 0) { index = Number(value.index); result.index = index; }
    return result;
  }
  function subtitleProfile(value) {
    var result = {};
    var size;
    var offset;
    var background;
    var edge;
    var track;
    if (!value || typeof value !== 'object') { return null; }
    if (value.subtitleSize !== undefined && isFinite(Number(value.subtitleSize))) { size = Number(value.subtitleSize); result.subtitleSize = Math.max(50, Math.min(200, Math.round(size))); }
    if (value.offsetMs !== undefined && isFinite(Number(value.offsetMs))) { offset = Number(value.offsetMs); result.offsetMs = Math.max(-600000, Math.min(600000, Math.round(offset))); }
    background = String(value.subtitleBackground || '');
    edge = String(value.subtitleEdge || '');
    if (['off', 'low', 'medium', 'high', 'opaque'].indexOf(background) !== -1) { result.subtitleBackground = background; }
    if (['shadow', 'outline', 'both', 'double-outline-shadow'].indexOf(edge) !== -1) { result.subtitleEdge = edge; }
    track = subtitleTrack(value.track || value.subtitleTrack);
    if (track) { result.track = track; }
    return Object.keys(result).length ? result : null;
  }
  function subtitlePresentationFromValue(value) {
    var result = {};
    var identities;
    if (!value || typeof value !== 'object') { return result; }
    identities = Object.keys(value).sort().slice(0, 64);
    identities.forEach(function (identity) {
      var record = value[identity];
      var profiles = record && record.profiles && typeof record.profiles === 'object' ? record.profiles : { default: record };
      var output = { profiles: {} };
      Object.keys(profiles).sort().slice(0, 32).forEach(function (profileKey) {
        var profile = subtitleProfile(profiles[profileKey]);
        if (profile) { output.profiles[cleanText(profileKey, 180)] = profile; }
      });
      if (Object.keys(output.profiles).length) { result[cleanText(identity, 240)] = output; }
    });
    return result;
  }
  function subtitlePresentation(storage) {
    var current = subtitlePresentationFromValue(readJson(storage, SUBTITLE_PRESENTATION_KEY, {}));
    var legacy = subtitlePresentationFromValue(readJson(storage, LEGACY_SUBTITLE_PRESENTATION_KEY, {}));
    Object.keys(legacy).forEach(function (identity) {
      if (!current[identity]) { current[identity] = legacy[identity]; }
    });
    return current;
  }
  function compatibilitySource(value, fallback) {
    if (value === 'user-override') { return 'user-override'; }
    if (value === 'derived') { return 'derived'; }
    return fallback || 'observation';
  }
  function compatibilityMeta(value) {
    var source = value || {};
    return {
      model: cleanText(source.model, 80), runtime: cleanText(source.runtime, 120), appVersion: cleanText(source.appVersion, 40),
      ruleVersion: Math.max(1, Number(source.ruleVersion || 1)), updatedAt: Math.max(0, Number(source.updatedAt || 0))
    };
  }
  function compatibilityFormat(item) {
    if (!item || !item.key || !isArray(item.files)) { return null; }
    return {
      key: String(item.key), kind: String(item.kind || ''), files: item.files.map(String).slice(0, 96),
      failures: Math.max(0, Number(item.failures || 0)), source: 'derived'
    };
  }
  function compatibilityFile(item) {
    if (!item || !item.key) { return null; }
    return {
      key: String(item.key), formatKey: String(item.formatKey || ''), kind: String(item.kind || ''),
      failures: Math.max(0, Number(item.failures || 0)), confirmed: item.confirmed === true,
      expiresAt: Math.max(0, Number(item.expiresAt || 0)), source: compatibilitySource(item.source, 'observation')
    };
  }
  function compatibilityFromValue(value) {
    var source = value || {};
    return {
      version: 3, meta: compatibilityMeta(source.meta),
      formats: (isArray(source.formats) ? source.formats : []).map(compatibilityFormat).filter(Boolean).slice(-64),
      files: (isArray(source.files) ? source.files : []).map(compatibilityFile).filter(Boolean).slice(-96)
    };
  }
  function compatibility(storage) {
    var current = readJson(storage, COMPATIBILITY_KEY, null);
    if (!current) { current = readJson(storage, LEGACY_COMPATIBILITY_KEY, {}); }
    return compatibilityFromValue(current);
  }
  function deviceRecord(device) {
    var result = {
      id: cleanText(device && device.id, 80), name: cleanText(device && device.name, 80),
      model: cleanText(device && device.model, 80), webOS: cleanText(device && device.webOS, 40),
      width: Math.max(0, Number(device && device.width || 0)), height: Math.max(0, Number(device && device.height || 0))
    };
    if (!result.id || !result.name) { throw new Error('Ploff device profile is missing'); }
    return result;
  }
  function summaryFor(save) { return MARKER + JSON.stringify(save); }
  function fits(save) { return encodedBytes(summaryFor(save)) <= MAX_ENCODED_BYTES; }
  function addArrayWithinBudget(save, property, values, omitted, omittedPrefix) {
    var candidate;
    save[property] = [];
    values.forEach(function (entry) {
      candidate = copy(save);
      candidate[property].push(entry);
      if (fits(candidate)) { save = candidate; }
      else { omitted.push(omittedPrefix + String(entry.key || '')); }
    });
    if (!save[property].length) { delete save[property]; }
    return save;
  }
  function addMediaSourcePreferencesWithinBudget(save, values, omitted) {
    var candidate = copy(save);
    candidate.mediaSourcePreferences = [];
    if (!fits(candidate)) { omitted.push('mediaSourcePreferences'); return save; }
    save = candidate;
    values.forEach(function (entry) {
      candidate = copy(save);
      candidate.mediaSourcePreferences.push(copy(entry));
      if (fits(candidate)) { save = candidate; }
      else { omitted.push('mediaSourcePreference:' + String(entry.guid || '')); }
    });
    return save;
  }
  function addLibraryTabsWithinBudget(save, tabs, omitted) {
    var candidate;
    var base;
    if (!tabs) { return save; }
    base = {
      version: 1, legacyMigrated: tabs.legacyMigrated === true, displayMode: String(tabs.displayMode || 'text'),
      home: copy(tabs.home), serverAliases: copy(tabs.serverAliases || []),
      serverStates: copy(tabs.serverStates || []), homeOrder: copy(tabs.homeOrder || []), items: []
    };
    candidate = copy(save); candidate.libraryTabs = base;
    if (!fits(candidate)) { omitted.push('libraryTabs'); return save; }
    save = candidate;
    (tabs.items || []).forEach(function (entry) {
      candidate = copy(save); candidate.libraryTabs.items.push(copy(entry));
      if (fits(candidate)) { save = candidate; }
      else { omitted.push('libraryTab:' + String(entry.sourceId || '')); }
    });
    return save;
  }
  function build(storage, settings, appVersion, now, options) {
    var values = options || {};
    var save = {
      format: FORMAT, version: VERSION, appVersion: String(appVersion || ''),
      createdAt: Number((typeof now === 'function' ? now() : Date.now()) || 0),
      device: deviceRecord(values.device || {}), settings: exportedSettings(settings)
    };
    var included = ['settings'];
    var omitted = [];
    var candidate;
    var order = libraryOrder(storage);
    var tabs = libraryTabs(storage);
    var preferences = mediaPreferences(storage);
    var sourcePreferences = mediaSourcePreferences(storage);
    var offsets = subtitleOffsets(storage);
    var presentation = subtitlePresentation(storage);
    var learned = compatibility(storage);
    if (!fits(save)) { throw new Error('Ploff settings exceed the backup budget'); }
    if (tabs) {
      save = addLibraryTabsWithinBudget(save, tabs, omitted);
      if (save.libraryTabs) { included.push('libraryTabs'); }
    }
    if (order.length) {
      candidate = copy(save); candidate.libraryOrder = order;
      if (fits(candidate)) { save = candidate; included.push('libraryOrder'); }
      else { omitted.push('libraryOrder'); }
    }
    save = addMediaSourcePreferencesWithinBudget(save, sourcePreferences, omitted);
    if (own(save, 'mediaSourcePreferences')) { included.push('mediaSourcePreferences'); }
    if (preferences.length) {
      save = addArrayWithinBudget(save, 'mediaPreferences', preferences, omitted, 'mediaPreference:');
      if (save.mediaPreferences) { included.push('mediaPreferences'); }
    }
    if (Object.keys(offsets).length) {
      save.subtitleOffsets = {};
      Object.keys(offsets).forEach(function (key) {
        candidate = copy(save); candidate.subtitleOffsets[key] = offsets[key];
        if (fits(candidate)) { save = candidate; } else { omitted.push('subtitleOffset:' + key); }
      });
      if (Object.keys(save.subtitleOffsets).length) { included.push('subtitleOffsets'); }
      else { delete save.subtitleOffsets; }
    }
    if (Object.keys(presentation).length) {
      candidate = copy(save); candidate.subtitlePresentation = presentation;
      if (fits(candidate)) { save = candidate; included.push('subtitlePresentation'); }
      else { omitted.push('subtitlePresentation'); }
    }
    if (learned.formats.length || learned.files.length) { save.compatibility = { version: 3, meta: learned.meta, formats: [], files: [] }; }
    learned.formats.forEach(function (entry) {
      candidate = copy(save); candidate.compatibility.formats.push(entry);
      if (fits(candidate)) { save = candidate; } else { omitted.push('compatibilityFormat:' + entry.key); }
    });
    learned.files.forEach(function (entry) {
      candidate = copy(save); candidate.compatibility.files.push(entry);
      if (fits(candidate)) { save = candidate; } else { omitted.push('compatibilityFile:' + entry.key); }
    });
    if (save.compatibility && !save.compatibility.formats.length && !save.compatibility.files.length) { delete save.compatibility; }
    else if (save.compatibility) { included.push('compatibility'); }
    return { save: save, backup: save, summary: summaryFor(save), encodedBytes: encodedBytes(summaryFor(save)), included: included, omitted: omitted };
  }
  function parsedMediaPreferences(parsed) {
    return isArray(parsed.mediaPreferences) ? parsed.mediaPreferences.map(function (entry) {
      var isV2 = entry && entry.storage === 'v2';
      var preference = mediaPreference(entry && entry.value, isV2);
      return entry && entry.key && preference ? { key: String(entry.key), storage: isV2 ? 'v2' : 'v1', value: preference } : null;
    }).filter(Boolean) : [];
  }
  function parsedMediaSourcePreferences(parsed) {
    return mediaSourcePreferencesFromValue(parsed.mediaSourcePreferences);
  }
  function parseCurrent(parsed) {
    return {
      format: FORMAT, version: VERSION, sourceVersion: VERSION, legacyKind: '', appVersion: String(parsed.appVersion || ''),
      createdAt: Math.max(0, Number(parsed.createdAt || 0)), device: deviceRecord(parsed.device || {}),
      settings: exportedSettings(parsed.settings),
      libraryOrder: isArray(parsed.libraryOrder) ? parsed.libraryOrder.map(String) : [],
      libraryTabs: LibraryTabStore && typeof LibraryTabStore.validate === 'function' ? LibraryTabStore.validate(parsed.libraryTabs || {}) : null,
      mediaPreferences: parsedMediaPreferences(parsed),
      mediaSourcePreferences: parsedMediaSourcePreferences(parsed),
      subtitleOffsets: subtitleOffsetsFromValue(parsed.subtitleOffsets || {}),
      subtitlePresentation: subtitlePresentationFromValue(parsed.subtitlePresentation || {}),
      compatibility: compatibilityFromValue(parsed.compatibility || {}),
      hasLibraryOrder: own(parsed, 'libraryOrder'), hasLibraryTabs: own(parsed, 'libraryTabs'), hasMediaPreferences: own(parsed, 'mediaPreferences'),
      hasMediaSourcePreferences: own(parsed, 'mediaSourcePreferences'),
      hasSubtitleOffsets: own(parsed, 'subtitleOffsets'), hasSubtitlePresentation: own(parsed, 'subtitlePresentation'), hasCompatibility: own(parsed, 'compatibility')
    };
  }
  function parseLegacy(parsed) {
    var kind = parsed.kind === 'device' ? 'device' : 'shared';
    return {
      format: FORMAT, version: VERSION, sourceVersion: 2, legacyKind: kind, appVersion: String(parsed.appVersion || ''),
      createdAt: Math.max(0, Number(parsed.createdAt || 0)),
      device: kind === 'device' ? deviceRecord(parsed.device || {}) : null,
      settings: exportedPresentSettings(parsed.settings),
      libraryOrder: isArray(parsed.libraryOrder) ? parsed.libraryOrder.map(String) : [],
      libraryTabs: null,
      mediaPreferences: parsedMediaPreferences(parsed),
      mediaSourcePreferences: [],
      subtitleOffsets: subtitleOffsetsFromValue(parsed.subtitleOffsets || {}),
      subtitlePresentation: subtitlePresentationFromValue(parsed.subtitlePresentation || {}),
      compatibility: compatibilityFromValue(parsed.compatibility || {}),
      hasLibraryOrder: own(parsed, 'libraryOrder'), hasLibraryTabs: false, hasMediaPreferences: own(parsed, 'mediaPreferences'),
      hasMediaSourcePreferences: false,
      hasSubtitleOffsets: own(parsed, 'subtitleOffsets'), hasSubtitlePresentation: own(parsed, 'subtitlePresentation'), hasCompatibility: own(parsed, 'compatibility')
    };
  }
  function parse(summary) {
    var value = String(summary || '');
    var payload;
    var sourceVersion;
    var parsed;
    if (value.indexOf(MARKER) === 0) { payload = value.slice(MARKER.length); sourceVersion = VERSION; }
    else if (value.indexOf(LEGACY_MARKER) === 0) { payload = value.slice(LEGACY_MARKER.length); sourceVersion = 2; }
    else { throw new Error('Ploff settings marker is missing'); }
    try { parsed = JSON.parse(payload); }
    catch (_error) { throw new Error('Ploff settings JSON is invalid'); }
    if (!parsed || parsed.format !== FORMAT) { throw new Error('Ploff settings format is invalid'); }
    if (Number(parsed.version) !== sourceVersion) { throw new Error('Ploff settings version is unsupported'); }
    if (!parsed.settings || typeof parsed.settings !== 'object') { throw new Error('Ploff settings are missing'); }
    return sourceVersion === VERSION ? parseCurrent(parsed) : parseLegacy(parsed);
  }
  function removeByPrefix(storage, prefix) {
    var keys = [];
    var index;
    var key;
    if (!storage || !storage.key || !storage.removeItem) { return; }
    for (index = 0; index < storage.length; index += 1) {
      key = String(storage.key(index) || '');
      if (key.indexOf(prefix) === 0) { keys.push(key); }
    }
    keys.forEach(function (entry) { storage.removeItem(entry); });
  }
  function apply(storage, parsedSave, options) {
    var save = parsedSave && parsedSave.format === FORMAT ? parsedSave : parse(parsedSave);
    var values = options || {};
    var merged = Settings.load(storage);
    Object.keys(save.settings).forEach(function (key) { merged[key] = copy(save.settings[key]); });
    merged = Settings.save(storage, merged);
    if (save.hasLibraryOrder) { storage.setItem(LIBRARY_ORDER_KEY, JSON.stringify(save.libraryOrder)); }
    if (save.hasLibraryTabs && LibraryTabStore && typeof LibraryTabStore.validate === 'function') {
      storage.setItem(LIBRARY_TABS_KEY, JSON.stringify(LibraryTabStore.validate(save.libraryTabs)));
    }
    if (save.hasMediaPreferences) {
      removeByPrefix(storage, MEDIA_PREFERENCE_PREFIX);
      removeByPrefix(storage, MEDIA_PREFERENCE_V2_PREFIX);
      save.mediaPreferences.forEach(function (entry) {
        storage.setItem((entry.storage === 'v2' ? MEDIA_PREFERENCE_V2_PREFIX : MEDIA_PREFERENCE_PREFIX) + entry.key, JSON.stringify(entry.value));
      });
    }
    if (save.hasMediaSourcePreferences) {
      var sourcePreferenceState = {};
      save.mediaSourcePreferences.forEach(function (entry) { sourcePreferenceState[entry.guid] = entry.serverMachineIdentifier; });
      storage.setItem(MEDIA_SOURCE_PREFERENCE_KEY, JSON.stringify(sourcePreferenceState));
    }
    if (save.hasSubtitleOffsets) { storage.setItem(SUBTITLE_OFFSETS_KEY, JSON.stringify(save.subtitleOffsets)); }
    if (save.hasSubtitlePresentation) {
      if (storage.removeItem) { storage.removeItem(LEGACY_SUBTITLE_PRESENTATION_KEY); }
      storage.setItem(SUBTITLE_PRESENTATION_KEY, JSON.stringify(save.subtitlePresentation));
    }
    if (save.hasCompatibility && values.includeCompatibility === true) {
      storage.setItem(COMPATIBILITY_KEY, JSON.stringify(save.compatibility));
      if (storage.removeItem) { storage.removeItem(LEGACY_COMPATIBILITY_KEY); }
    }
    return { settings: merged, save: save, backup: save, compatibilityApplied: save.hasCompatibility && values.includeCompatibility === true };
  }
  function devicePlaylistTitle(name) { return DEVICE_PLAYLIST_PREFIX + cleanText(name, 80) + ' - Do Not Delete'; }
  return {
    FORMAT: FORMAT, VERSION: VERSION, MARKER: MARKER, PLAYLIST_PREFIX: PLAYLIST_PREFIX,
    MAX_ENCODED_BYTES: MAX_ENCODED_BYTES,
    build: build, parse: parse, apply: apply, settingsEqual: settingsEqual,
    encodedBytes: encodedBytes, devicePlaylistTitle: devicePlaylistTitle
  };
}));
