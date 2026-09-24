(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaPreferences = factory();
  }
}(this, function () {
  'use strict';

  /**
   * @typedef {Object} MediaPlaybackOptionsRecord
   * @property {string} audioStreamID
   * @property {string} subtitleStreamID
   * @property {number} subtitleSize
   * @property {number} offset
   * @property {string} videoQuality
   * @property {string} playbackMode
   * @property {number=} mediaIndex
   * @property {number=} partIndex
   */

  var STORAGE_PREFIX = 'ploff.mediaPreference.v2.';
  var LEGACY_STORAGE_PREFIX = 'ploff.mediaPreference.v1.';
  var LANGUAGE_ALIASES = { eng: 'en', ita: 'it', jpn: 'ja', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', kor: 'ko', chi: 'zh', zho: 'zh', rus: 'ru' };

  function owns(source, key) { return !!source && Object.prototype.hasOwnProperty.call(source, key); }
  function language(value) {
    var normalized = String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/_/g, '-').split('-')[0];
    return LANGUAGE_ALIASES[normalized] || normalized;
  }
  function normalizedText(value) { return String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '); }
  function trackLanguage(track) { return language(track && (track.languageTag || track.languageCode || track.language)); }
  function trackPreference(track) {
    var result;
    var index;
    if (!track) { return null; }
    result = {
      language: trackLanguage(track),
      name: normalizedText(track.title || track.extendedDisplayTitle || track.displayTitle),
      codec: normalizedText(track.codec || track.format),
      channels: Math.max(0, Number(track.channels || 0)),
      external: track.external === true || track.external === '1' || !!track.key
    };
    if (owns(track, 'forced')) { result.forced = track.forced === true || track.forced === '1'; }
    if (owns(track, 'index')) {
      index = Number(track.index);
      if (isFinite(index) && index >= 0) { result.index = index; }
    }
    return result;
  }
  function normalizeTrackPreference(value) {
    var result;
    var index;
    if (!value || typeof value !== 'object') { return null; }
    result = {
      language: language(value.language),
      name: normalizedText(value.name || value.title),
      codec: normalizedText(value.codec || value.format),
      channels: Math.max(0, Number(value.channels || 0)),
      external: value.external === true
    };
    if (owns(value, 'forced')) { result.forced = value.forced === true; }
    if (owns(value, 'index')) {
      index = Number(value.index);
      if (isFinite(index) && index >= 0) { result.index = index; }
    }
    if (!result.language && !result.name && !result.codec && !result.channels && !owns(result, 'index')) { return null; }
    return result;
  }
  function normalizeVersionSignature(value) {
    var result;
    if (!value || typeof value !== 'object') { return null; }
    result = {
      videoCodec: normalizedText(value.videoCodec || value.codec),
      container: normalizedText(value.container),
      width: Math.max(0, Number(value.width || 0)),
      height: Math.max(0, Number(value.height || 0)),
      bitrate: Math.max(0, Number(value.bitrate || 0)),
      hdr: value.hdr === true || value.hdr === 1 || value.hdr === '1' ? 1 : 0
    };
    if (!result.videoCodec && !result.container && !result.width && !result.height && !result.bitrate) { return null; }
    return result;
  }
  function matchingCandidates(candidates, predicate) {
    var matches = candidates.filter(predicate);
    return matches.length ? matches : candidates;
  }
  function findTrack(tracks, preference, forcedOnly) {
    var signature = normalizeTrackPreference(preference);
    var candidates = (tracks || []).filter(function (track) { return !forcedOnly || track.forced === true || track.forced === '1'; });
    var languageMatches;
    if (!signature || !candidates.length) { return null; }
    if (signature.language) {
      languageMatches = candidates.filter(function (track) { return trackLanguage(track) === signature.language; });
      if (!languageMatches.length) { return null; }
      candidates = languageMatches;
    }
    candidates = candidates.filter(function (track) { return trackPreference(track).external === signature.external; });
    if (!candidates.length) { return null; }
    if (owns(signature, 'forced')) {
      candidates = candidates.filter(function (track) { return (track.forced === true || track.forced === '1') === signature.forced; });
      if (!candidates.length) { return null; }
    }
    if (signature.name) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).name === signature.name; }); }
    if (signature.codec) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).codec === signature.codec; }); }
    if (signature.channels) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).channels === signature.channels; }); }
    if (owns(signature, 'index')) {
      if (signature.external === false) {
        candidates = candidates.filter(function (track) { return Number(track.index) === signature.index; });
        if (!candidates.length) { return null; }
      } else {
        candidates = matchingCandidates(candidates, function (track) { return Number(track.index) === signature.index; });
      }
    }
    return candidates[0] || null;
  }
  function identity(serverId, profileId) {
    if (serverId && typeof serverId === 'object') { profileId = serverId.profile; serverId = serverId.server; }
    return [String(serverId || 'default'), String(profileId || 'default')].join('|');
  }
  function isSeriesDetail(detail) { return !!(detail && (detail.type === 'episode' || detail.type === 'season' || detail.type === 'show')); }
  function seasonRatingKey(detail) {
    if (!detail) { return ''; }
    if (detail.type === 'season') { return String(detail.ratingKey || ''); }
    return String(detail.seasonRatingKey || detail.parentRatingKey || '');
  }
  function mediaRatingKey(detail) { return String(detail && detail.ratingKey || ''); }
  function scopeForDetail(detail) { return isSeriesDetail(detail) && seasonRatingKey(detail) ? 'season' : 'media'; }
  function scopeRatingKey(detail, scope) { return scope === 'season' ? seasonRatingKey(detail) : mediaRatingKey(detail); }
  function storageKey(value) { return STORAGE_PREFIX + encodeURIComponent(String(value || '')); }
  function scopedStorageKey(identityValue, scope, ratingKey) {
    return storageKey([String(identityValue || 'default'), String(scope || 'media'), String(ratingKey || '')].join('|'));
  }
  function legacyKey(serverId, profileId, detail) {
    var kind = isSeriesDetail(detail) ? 'show' : 'movie';
    var ratingKey = isSeriesDetail(detail)
      ? String(detail && (detail.showRatingKey || (detail.type === 'show' ? detail.ratingKey : '') || detail.grandparentRatingKey) || '')
      : mediaRatingKey(detail);
    return [String(serverId || 'default'), String(profileId || 'default'), kind, ratingKey].join(':');
  }
  function legacyStorageKey(serverId, profileId, detail) { return LEGACY_STORAGE_PREFIX + encodeURIComponent(legacyKey(serverId, profileId, detail)); }
  function normalizeLegacyVersion(value) {
    var mediaIndex;
    var partIndex;
    if (!value || typeof value !== 'object') { return null; }
    if (value.mediaIndex === null || value.mediaIndex === undefined || value.mediaIndex === '') { return null; }
    mediaIndex = Number(value.mediaIndex);
    partIndex = Number(value.partIndex);
    if (!isFinite(mediaIndex) || mediaIndex < 0) { return null; }
    return { mediaIndex: mediaIndex, partIndex: isFinite(partIndex) && partIndex >= 0 ? partIndex : 0 };
  }
  function normalize(value) {
    var result = {};
    var track;
    var version;
    var legacyVersion;
    if (!value || typeof value !== 'object') { return null; }
    if (owns(value, 'audioTrack')) { track = normalizeTrackPreference(value.audioTrack); if (track) { result.audioTrack = track; } }
    if (owns(value, 'subtitleTrack')) { track = normalizeTrackPreference(value.subtitleTrack); if (track) { result.subtitleTrack = track; } }
    if (value.subtitlesOff === true) { result.subtitlesOff = true; }
    if (owns(value, 'versionSignature')) { version = normalizeVersionSignature(value.versionSignature); if (version) { result.versionSignature = version; } }
    legacyVersion = normalizeLegacyVersion(value.legacyVersion || value);
    if (legacyVersion) { result.legacyVersion = legacyVersion; }
    return result;
  }
  function hasValues(value) { return !!value && Object.keys(value).length > 0; }
  function readJson(storage, key) {
    try {
      var raw = storage && storage.getItem ? storage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    } catch (_error) { return null; }
  }
  function hasStoredValue(storage, key) {
    var raw;
    var parsed;
    try {
      raw = storage && storage.getItem ? storage.getItem(key) : null;
      if (raw === null) { return false; }
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Object.prototype.toString.call(parsed) === '[object Array]') { return false; }
      if (!Object.keys(parsed).length) { return true; }
      return hasValues(normalize(parsed));
    } catch (_error) { return false; }
  }
  function readScope(storage, identityValue, scope, ratingKey) {
    var value = normalize(readJson(storage, scopedStorageKey(identityValue, scope, ratingKey)));
    return hasValues(value) ? value : null;
  }
  function writeScope(storage, identityValue, scope, ratingKey, value) {
    var key = scopedStorageKey(identityValue, scope, ratingKey);
    var normalized = normalize(value);
    try {
      if (!storage || !storage.setItem || !storage.removeItem) { return false; }
      // An empty record means explicitly reset, not never migrated.
      storage.setItem(key, JSON.stringify(normalized || {}));
      return true;
    } catch (_error) { return false; }
  }
  function readLegacy(storage, identityValue, detail) {
    var parts = String(identityValue || 'default').split('|');
    return normalize(readJson(storage, legacyStorageKey(parts[0], parts[1], detail)));
  }
  function migrateLegacy(storage, identityValue, detail) {
    var legacy = readLegacy(storage, identityValue, detail);
    var migrated = {};
    if (!legacy) { return null; }
    if (legacy.audioTrack) { migrated.audioTrack = legacy.audioTrack; }
    if (legacy.subtitleTrack) { migrated.subtitleTrack = legacy.subtitleTrack; }
    if (legacy.subtitlesOff) { migrated.subtitlesOff = true; }
    if (legacy.legacyVersion) { migrated.legacyVersion = legacy.legacyVersion; }
    return hasValues(migrated) ? migrated : null;
  }
  function loadScopes(storage, identityValue, detail) {
    var result = {
      season: readScope(storage, identityValue, 'season', seasonRatingKey(detail)),
      media: readScope(storage, identityValue, 'media', mediaRatingKey(detail)),
      migrated: false
    };
    var scope = scopeForDetail(detail);
    var ratingKey = scopeRatingKey(detail, scope);
    var scopedKey = scopedStorageKey(identityValue, scope, ratingKey);
    var migrated;
    if (!hasStoredValue(storage, scopedKey)) {
      migrated = migrateLegacy(storage, identityValue, detail);
      if (migrated && writeScope(storage, identityValue, scope, ratingKey, migrated)) {
        result[scope] = migrated;
        result.migrated = true;
      }
    }
    return result;
  }
  function mergeSelection(scopes, detail) {
    var result = {};
    var season = scopes && scopes.season;
    var media = scopes && scopes.media;
    var key;
    if (season) { for (key in season) { if (owns(season, key)) { result[key] = season[key]; } } }
    if (media && scopeForDetail(detail) === 'media') { for (key in media) { if (owns(media, key)) { result[key] = media[key]; } } }
    return hasValues(result) ? result : null;
  }
  function effectiveSelection(scopes, detail) { return mergeSelection(scopes, detail); }
  function selectionSource(scopes, detail, field) {
    var media = scopes && scopes.media;
    var season = scopes && scopes.season;
    if (media && scopeForDetail(detail) === 'media' && owns(media, field)) { return 'media'; }
    if (season && owns(season, field)) { return 'season'; }
    return 'global';
  }
  function updateSelection(storage, identityValue, detail, patch) {
    var scope = scopeForDetail(detail);
    var ratingKey = scopeRatingKey(detail, scope);
    /** @type {Object.<string, any>} */
    var current = readScope(storage, identityValue, scope, ratingKey) || {};
    var normalized;
    var key;
    patch = patch || {};
    if (owns(patch, 'audioTrack')) {
      normalized = normalizeTrackPreference(patch.audioTrack);
      if (normalized) { current.audioTrack = normalized; } else { delete current.audioTrack; }
    }
    if (owns(patch, 'subtitleTrack')) {
      normalized = normalizeTrackPreference(patch.subtitleTrack);
      if (normalized) { current.subtitleTrack = normalized; } else { delete current.subtitleTrack; }
    }
    if (owns(patch, 'subtitlesOff')) {
      if (patch.subtitlesOff === true) { current.subtitlesOff = true; } else { delete current.subtitlesOff; }
    }
    if (owns(patch, 'versionSignature')) {
      normalized = normalizeVersionSignature(patch.versionSignature);
      if (normalized) { current.versionSignature = normalized; } else { delete current.versionSignature; }
    }
    if (owns(patch, 'legacyVersion')) {
      normalized = normalizeLegacyVersion(patch.legacyVersion);
      if (normalized) { current.legacyVersion = normalized; } else { delete current.legacyVersion; }
    }
    for (key in current) { if (owns(current, key) && current[key] === null) { delete current[key]; } }
    if (!ratingKey) { return null; }
    if (!writeScope(storage, identityValue, scope, ratingKey, current)) { return null; }
    return loadScopes(storage, identityValue, detail);
  }
  function preferredSource(tracks, preference) {
    var external = preference !== 'internal';
    var matches = tracks.filter(function (track) { return trackPreference(track).external === external; });
    return matches.length ? matches[0] : (tracks[0] || null);
  }
  function byLanguage(tracks, requested, forcedOnly, sourcePreference) {
    var target = language(requested);
    var candidates = [];
    var index;
    if (!target) { return null; }
    for (index = 0; index < tracks.length; index += 1) {
      if ((!forcedOnly || tracks[index].forced === true || tracks[index].forced === '1') && trackLanguage(tracks[index]) === target) { candidates.push(tracks[index]); }
    }
    return sourcePreference ? preferredSource(candidates, sourcePreference) : (candidates[0] || null);
  }
  function byPriorities(tracks, priorities, forcedOnly, sourcePreference) {
    var index;
    var found;
    for (index = 0; index < (priorities || []).length; index += 1) {
      found = byLanguage(tracks, priorities[index], forcedOnly, sourcePreference);
      if (found) { return found; }
    }
    return null;
  }
  function selected(tracks) {
    var index;
    for (index = 0; index < tracks.length; index += 1) { if (tracks[index].selected) { return tracks[index]; } }
    return null;
  }
  function globalAudio(tracks, settings) { return byPriorities(tracks, settings.audioLanguages || [], false) || selected(tracks) || tracks[0] || null; }
  function globalSubtitle(tracks, audio, settings) {
    var mode = settings.subtitleMode || 'audio-mismatch';
    var suppressed = (settings.subtitleSuppressedForAudio || []).map(language);
    var preferred = settings.subtitleLanguages && settings.subtitleLanguages.length ? language(settings.subtitleLanguages[0]) : '';
    var index;
    if (audio && suppressed.indexOf(trackLanguage(audio)) !== -1) { mode = 'off'; }
    if (mode === 'always') { return byPriorities(tracks, settings.subtitleLanguages || [], false, settings.subtitleSourcePreference || 'external') || selected(tracks); }
    if (mode === 'forced') {
      return byPriorities(tracks, settings.subtitleLanguages || [], true, settings.subtitleSourcePreference || 'external') || (function () {
        for (index = 0; index < tracks.length; index += 1) { if (tracks[index].forced === true || tracks[index].forced === '1') { return tracks[index]; } }
        return null;
      }());
    }
    if (mode === 'audio-mismatch' && (!audio || !preferred || trackLanguage(audio) !== preferred)) {
      return byPriorities(tracks, settings.subtitleLanguages || [], false, settings.subtitleSourcePreference || 'external') || selected(tracks);
    }
    return null;
  }
  function resolve(playback, override, globalSettings) {
    var current = playback && playback.options || {};
    var audioTracks = playback && playback.audioTracks || [];
    var subtitleTracks = playback && playback.subtitleTracks || [];
    var settings = globalSettings || {};
    /** @type {Object.<string, any>} */
    var local = normalize(override) || {};
    var requestedAudio = local.audioTrack ? findTrack(audioTracks, local.audioTrack, false) : null;
    var requestedSubtitle = local.subtitleTrack && !local.subtitlesOff ? findTrack(subtitleTracks, local.subtitleTrack, false) : null;
    var audio = requestedAudio || globalAudio(audioTracks, settings);
    var subtitle = local.subtitlesOff ? null : (requestedSubtitle || globalSubtitle(subtitleTracks, audio, settings));
    return {
      audioStreamID: audio ? audio.id : '', subtitleStreamID: subtitle ? subtitle.id : '',
      audioTrack: audio, subtitleTrack: subtitle,
      audioLabel: audio ? (audio.language || audio.title || trackLanguage(audio)) : '',
      subtitleLabel: subtitle ? (subtitle.language || subtitle.title || trackLanguage(subtitle)) : '',
      fallbackUsed: !!((local.audioTrack && !requestedAudio) || (local.subtitleTrack && !local.subtitlesOff && !requestedSubtitle)),
      subtitleSize: settings.subtitleSize === undefined ? (current.subtitleSize || 100) : Number(settings.subtitleSize),
      offset: current.offset || 0, videoQuality: settings.videoQuality || current.videoQuality || 'original',
      playbackMode: settings.playbackMode || current.playbackMode || 'auto'
    };
  }

  function normalizePlaybackOptionPreferences(playback, preferences) {
    return {
      current: playback.options || {},
      settings: preferences || {}
    };
  }

  function materializePlaybackOptions(context, audio, subtitle) {
    var current = context.current;
    var settings = context.settings;
    /** @type {MediaPlaybackOptionsRecord} */
    var result = {
      audioStreamID: audio ? audio.id : '',
      subtitleStreamID: subtitle ? subtitle.id : '',
      subtitleSize: settings.subtitleSize === undefined ? (current.subtitleSize || 100) : Number(settings.subtitleSize),
      offset: current.offset || 0,
      videoQuality: settings.videoQuality || current.videoQuality || 'original',
      playbackMode: settings.playbackMode || current.playbackMode || 'auto'
    };
    if (settings.mediaIndex !== undefined || current.mediaIndex !== undefined) {
      result.mediaIndex = settings.mediaIndex === undefined ? current.mediaIndex : Number(settings.mediaIndex);
      result.partIndex = settings.partIndex === undefined ? Number(current.partIndex || 0) : Number(settings.partIndex);
    }
    return result;
  }

  function resolvePlaybackOptions(playback, preferences) {
    var context = normalizePlaybackOptionPreferences(playback, preferences);
    var resolved = resolve(playback, {
      audioTrack: context.settings.audioTrackPreference,
      subtitleTrack: context.settings.subtitleTrackPreference
    }, context.settings);
    return materializePlaybackOptions(context, resolved.audioTrack, resolved.subtitleTrack);
  }

  function load(storage, identityValue) { return normalize(readJson(storage, storageKey(identityValue))); }
  function save(storage, identityValue, value) {
    var normalized = normalize(value);
    try {
      if (storage && storage.setItem && storage.removeItem) {
        if (hasValues(normalized)) { storage.setItem(storageKey(identityValue), JSON.stringify(normalized)); }
        else { storage.removeItem(storageKey(identityValue)); }
      }
    } catch (_error) {}
    return normalized;
  }
  function clear(storage, identityValue) {
    try { if (storage && storage.removeItem) { storage.removeItem(storageKey(identityValue)); } }
    catch (_error) {}
  }

  return {
    LEGACY_STORAGE_PREFIX: LEGACY_STORAGE_PREFIX,
    clear: clear,
    effectiveSelection: effectiveSelection,
    findTrack: findTrack,
    identity: identity,
    key: identity,
    load: load,
    loadScopes: loadScopes,
    normalize: normalize,
    resolve: resolve,
    resolvePlaybackOptions: resolvePlaybackOptions,
    save: save,
    scopeForDetail: scopeForDetail,
    scopeKey: scopedStorageKey,
    selectionSource: selectionSource,
    storageKey: storageKey,
    trackPreference: trackPreference,
    updateSelection: updateSelection,
    versionSignature: normalizeVersionSignature
  };
}));
