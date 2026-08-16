(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlaybackCompatibilityMemory = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.playbackCompatibility.v3';
  var LEGACY_STORAGE_KEY = 'ploff.playbackCompatibility.v2';
  var VERSION = 3;
  var RULE_VERSION = 1;
  var FILE_TTL = 30 * 24 * 60 * 60 * 1000;
  var MAX_FORMAT_RULES = 64;
  var MAX_FILE_EXCEPTIONS = 96;

  function text(value) {
    return String(value === undefined || value === null ? '' : value).toLowerCase();
  }

  function boundedText(value, maximum) {
    return String(value === undefined || value === null ? '' : value).replace(/[\r\n]+/g, ' ').slice(0, maximum);
  }

  function first(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : value;
  }

  function sourceType(value) {
    return value === 'user-override' ? 'user-override' : 'observation';
  }

  function hash(value) {
    var source = String(value || '');
    var result = 2166136261;
    var index;
    for (index = 0; index < source.length; index += 1) {
      result = (result ^ source.charCodeAt(index)) * 16777619;
      result = result >>> 0;
    }
    return ('00000000' + result.toString(16)).slice(-8);
  }

  function versionParts(request) {
    var value = request && request.version || {};
    var audio = request && request.audio || {};
    var subtitles = request && request.subtitles || {};
    return [
      text(first(value.container, request && request.container)),
      text(first(value.videoCodec, request && request.videoCodec)),
      text(first(value.videoProfile, request && request.videoProfile)),
      text(first(value.width, request && request.width)),
      text(first(value.height, request && request.height)),
      text(first(value.videoDynamicRange, request && request.videoDynamicRange)),
      text(first(value.bitDepth, value.videoDetails && value.videoDetails.bitDepth || request && request.bitDepth)),
      text(first(value.audioCodec, audio.codec)),
      text(first(value.audioProfile, audio.profile)),
      text(first(value.audioChannels, audio.channels)),
      text(first(value.audioLanguage, audio.language)),
      text(first(value.subtitleCodec, subtitles.codec)),
      text(first(value.subtitleFormat, subtitles.format)),
      text(first(value.subtitleSource, subtitles.source)),
      text(first(value.subtitleLanguage, subtitles.language)),
      text(first(value.subtitleForced, subtitles.forced))
    ];
  }

  function formatKey(request, kind) {
    return hash(text(kind) + '|' + versionParts(request).join('|'));
  }

  function fileKey(request, kind, technicalKey) {
    var identity = [
      request && request.serverIdentity,
      request && request.mediaIdentity,
      request && (request.fileIdentity || request.partIdentity),
      request && request.mediaIndex,
      request && request.partIndex,
      request && request.audioStreamID,
      request && request.subtitleStreamID
    ].map(text).join('|');
    return technicalKey + ':' + text(kind) + ':' + hash(identity);
  }

  function metadataRecord(value, fallback, updatedAt) {
    var source = value || {};
    var previous = fallback || {};
    return {
      model: boundedText(source.model || previous.model, 80),
      runtime: boundedText(source.runtime || previous.runtime, 120),
      appVersion: boundedText(source.appVersion || previous.appVersion, 40),
      ruleVersion: RULE_VERSION,
      updatedAt: Math.max(0, Number(updatedAt === undefined ? previous.updatedAt : updatedAt) || 0)
    };
  }

  function emptyState(metadata) {
    return { version: VERSION, meta: metadataRecord(metadata, null, 0), formats: [], files: [] };
  }

  function safeState(value, metadata) {
    var source = value || {};
    var formats = [];
    var files = [];
    var index;
    var item;
    if (Object.prototype.toString.call(source.formats) === '[object Array]') {
      for (index = 0; index < source.formats.length; index += 1) {
        item = source.formats[index];
        if (item && item.key && Object.prototype.toString.call(item.files) === '[object Array]') {
          formats.push({
            key: String(item.key), kind: String(item.kind || ''), files: item.files.slice(0, MAX_FILE_EXCEPTIONS),
            failures: Number(item.failures || 0), source: 'derived'
          });
        }
      }
    }
    if (Object.prototype.toString.call(source.files) === '[object Array]') {
      for (index = 0; index < source.files.length; index += 1) {
        item = source.files[index];
        if (item && item.key) {
          files.push({
            key: String(item.key), formatKey: String(item.formatKey || ''), kind: String(item.kind || ''),
            failures: Number(item.failures || 0), confirmed: item.confirmed === true,
            expiresAt: Number(item.expiresAt || 0), source: sourceType(item.source)
          });
        }
      }
    }
    return {
      version: VERSION,
      meta: metadataRecord(source.meta, metadata, source.meta && source.meta.updatedAt),
      formats: formats,
      files: files
    };
  }

  function create(options) {
    var values = options || {};
    var storage = values.storage;
    var now = typeof values.now === 'function' ? values.now : function () { return Date.now(); };
    var state = load(storage, currentMetadata());

    function currentMetadata() {
      return typeof values.metadata === 'function' ? (values.metadata() || {}) : (values.metadata || {});
    }

    function refreshMetadata(timestampValue) {
      state.meta = metadataRecord(currentMetadata(), state.meta, timestampValue);
    }

    function save() {
      refreshMetadata(Number(now()));
      if (storage && typeof storage.setItem === 'function') {
        try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_error) {}
      }
      if (typeof values.onChange === 'function') { values.onChange(); }
    }

    function prune() {
      var current = Number(now());
      var index;
      var changed = false;
      for (index = state.files.length - 1; index >= 0; index -= 1) {
        if (Number(state.files[index].expiresAt) <= current) {
          state.files.splice(index, 1);
          changed = true;
        }
      }
      if (changed) { save(); }
      return changed;
    }

    function keys(request) {
      var kind = text(request && request.kind);
      var technicalKey = formatKey(request || {}, kind);
      return {
        kind: kind,
        formatKey: technicalKey,
        fileKey: fileKey(request && request.context || request || {}, kind, technicalKey)
      };
    }

    function find(list, key, field) {
      var index;
      for (index = 0; index < list.length; index += 1) {
        if (list[index][field] === key) { return list[index]; }
      }
      return null;
    }

    function trim(list, maximum) {
      while (list.length > maximum) { list.shift(); }
    }

    function shouldSkip(request) {
      var identity;
      var format;
      prune();
      if (!request || (request.kind !== 'direct-play' && request.kind !== 'direct-stream')) { return false; }
      if (request.enabled === false || request.context && request.context.enabled === false) { return false; }
      identity = keys(request);
      format = find(state.formats, identity.formatKey, 'key');
      return !!find(state.files, identity.fileKey, 'key') || !!(format && format.files.length >= 2);
    }

    function recordFailure(request, details) {
      var identity;
      var file;
      var format;
      var current;
      var confirmed = details && details.confirmed === true;
      var provenance = sourceType(details && details.source);
      if (!request || (request.kind !== 'direct-play' && request.kind !== 'direct-stream')) { return; }
      prune();
      identity = keys(request);
      current = Number(now());
      file = find(state.files, identity.fileKey, 'key');
      if (!file) {
        file = {
          key: identity.fileKey, formatKey: identity.formatKey, kind: identity.kind,
          failures: 0, confirmed: false, expiresAt: current + FILE_TTL, source: provenance
        };
        state.files.push(file);
      }
      file.failures += 1;
      file.confirmed = file.confirmed || confirmed;
      file.expiresAt = current + FILE_TTL;
      if (provenance === 'user-override') { file.source = provenance; }

      format = find(state.formats, identity.formatKey, 'key');
      if (!format) {
        format = { key: identity.formatKey, kind: identity.kind, files: [], failures: 0, source: 'derived' };
        state.formats.push(format);
      }
      if (format.files.indexOf(identity.fileKey) === -1) { format.files.push(identity.fileKey); }
      trim(format.files, MAX_FILE_EXCEPTIONS);
      format.failures += 1;
      format.source = 'derived';
      trim(state.formats, MAX_FORMAT_RULES);
      trim(state.files, MAX_FILE_EXCEPTIONS);
      save();
    }

    function recordSuccess(request) {
      var identity;
      var index;
      if (!request || (request.kind !== 'direct-play' && request.kind !== 'direct-stream')) { return; }
      prune();
      identity = keys(request);
      for (index = state.files.length - 1; index >= 0; index -= 1) {
        if (state.files[index].key === identity.fileKey) { state.files.splice(index, 1); }
      }
      save();
    }

    function snapshot() {
      var activeRules = 0;
      var index;
      prune();
      for (index = 0; index < state.formats.length; index += 1) {
        if (state.formats[index].files.length >= 2) { activeRules += 1; }
      }
      return {
        schemaVersion: VERSION,
        ruleVersion: RULE_VERSION,
        updatedAt: Number(state.meta.updatedAt || 0),
        deviceModel: String(state.meta.model || ''),
        runtime: String(state.meta.runtime || ''),
        appVersion: String(state.meta.appVersion || ''),
        formatRuleCount: activeRules,
        fileExceptionCount: state.files.length,
        fileExceptionTtlDays: 30
      };
    }

    function clearFormatRules() {
      state.formats = [];
      save();
    }

    function clearFileExceptions() {
      state.files = [];
      save();
    }

    function clear() {
      state = emptyState(currentMetadata());
      save();
    }

    return {
      clear: clear,
      clearFileExceptions: clearFileExceptions,
      clearFormatRules: clearFormatRules,
      recordFailure: recordFailure,
      recordSuccess: recordSuccess,
      shouldSkip: shouldSkip,
      snapshot: snapshot
    };
  }

  function load(storage, metadata) {
    var raw;
    try {
      raw = storage && storage.getItem && storage.getItem(STORAGE_KEY);
      if (raw) { return safeState(JSON.parse(raw), metadata); }
    } catch (_error) {}
    try {
      raw = storage && storage.getItem && storage.getItem(LEGACY_STORAGE_KEY);
      if (raw) { return safeState(JSON.parse(raw), metadata); }
    } catch (_legacyError) {}
    return emptyState(metadata);
  }

  return {
    FILE_TTL: FILE_TTL,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    RULE_VERSION: RULE_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    create: create
  };
}));
