(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSubtitleSeriesOffset = factory(); }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.subtitle-presentation.v2';
  var LEGACY_STORAGE_KEY = 'ploff.subtitle-presentation.v1';
  var LANGUAGE_ALIASES = { eng: 'en', ita: 'it', jpn: 'ja', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', kor: 'ko', chi: 'zh', zho: 'zh' };
  var BACKGROUNDS = ['off', 'low', 'medium', 'high', 'opaque'];
  var EDGES = ['shadow', 'outline', 'both', 'double-outline-shadow'];

  function owns(source, key) { return !!source && Object.prototype.hasOwnProperty.call(source, key); }
  function text(value) { return String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' '); }
  function language(value) { var normalized = text(value).replace(/_/g, '-').split('-')[0]; return LANGUAGE_ALIASES[normalized] || normalized; }
  function external(track) { return !!(track && (track.external === true || track.external === '1' || track.key)); }
  function format(track) { return text(track && (track.format || track.codec)); }
  function supported(track) { return !!track && /^(srt|subrip|webvtt|vtt|ass|ssa)$/.test(format(track)); }
  function externalText(track) { return external(track) && /^(srt|subrip|webvtt|vtt)$/.test(format(track)); }
  function streamIndex(track) {
    var value;
    if (!track || track.index === undefined || track.index === null || track.index === '') { return null; }
    value = Number(track.index);
    return isFinite(value) ? value : null;
  }
  function signature(track) {
    if (!track) { return null; }
    return {
      language: language(track.languageTag || track.languageCode || track.language),
      format: format(track), external: external(track),
      title: text(track.title || track.extendedDisplayTitle || track.displayTitle),
      forced: track.forced === true || track.forced === '1', index: streamIndex(track)
    };
  }
  function sameTrack(firstValue, secondValue) {
    var first = signature(firstValue);
    var second = signature(secondValue);
    if (!first || !second || !supported(first) || !supported(second)) { return false; }
    if (first.language !== second.language || first.format !== second.format || first.external !== second.external || first.forced !== second.forced) { return false; }
    if (!first.external && (first.index === null || second.index === null || first.index !== second.index)) { return false; }
    return !first.title || !second.title || first.title === second.title;
  }
  function sameExternalTextIdentity(firstValue, secondValue) {
    var first = signature(firstValue);
    var second = signature(secondValue);
    return !!first && !!second && externalText(first) && externalText(second) &&
      first.language === second.language && first.format === second.format && first.forced === second.forced;
  }
  function copy(source) {
    var result = {};
    var key;
    source = source || {};
    for (key in source) { if (owns(source, key)) { result[key] = source[key]; } }
    return result;
  }
  function identity(serverId, kind, ratingKey) {
    if (!serverId || !ratingKey) { return ''; }
    return [serverId, kind, ratingKey].map(function (value) { return encodeURIComponent(String(value)); }).join('|');
  }
  function mediaRatingKey(detail) { return String(detail && detail.ratingKey || ''); }
  function seasonRatingKey(detail) {
    if (!detail) { return ''; }
    if (detail.type === 'season') { return String(detail.ratingKey || ''); }
    return String(detail.seasonRatingKey || detail.parentRatingKey || '');
  }
  function enumValue(value, allowed) { value = String(value || ''); return allowed.indexOf(value) !== -1 ? value : null; }
  function normalizeStyle(value) {
    var result = {};
    var size;
    var offset;
    var background;
    var edge;
    if (!value || typeof value !== 'object') { return null; }
    if (owns(value, 'subtitleSize')) { size = Number(value.subtitleSize); if (isFinite(size)) { result.subtitleSize = Math.max(50, Math.min(200, Math.round(size))); } }
    if (owns(value, 'offsetMs')) { offset = Number(value.offsetMs); if (isFinite(offset)) { result.offsetMs = Math.max(-600000, Math.min(600000, Math.round(offset))); } }
    if (owns(value, 'subtitleBackground')) { background = enumValue(value.subtitleBackground, BACKGROUNDS); if (background !== null) { result.subtitleBackground = background; } }
    if (owns(value, 'subtitleEdge')) { edge = enumValue(value.subtitleEdge, EDGES); if (edge !== null) { result.subtitleEdge = edge; } }
    return result;
  }
  function normalizeProfile(value) {
    /** @type {Object.<string, any>} */
    var source = value || {};
    var result = normalizeStyle(source) || {};
    var track = signature(source.track || source.subtitleTrack);
    if (track) { result['track'] = track; }
    return result;
  }
  function profileKey(track) {
    var value = signature(track);
    if (!value) { return 'default'; }
    return [value.language, value.format, value.external ? '1' : '0', value.title, value.forced ? '1' : '0', value.index === null ? '' : value.index].map(function (part) { return encodeURIComponent(String(part)); }).join('~');
  }
  function normalizeRecord(value) {
    var result = { profiles: {} };
    var profiles;
    var key;
    var normalized;
    if (!value || typeof value !== 'object') { return result; }
    if (value.profiles && typeof value.profiles === 'object') {
      profiles = value.profiles;
      Object.keys(profiles).forEach(function (profile) {
        normalized = normalizeProfile(profiles[profile]);
        if (normalized && Object.keys(normalized).length) { result.profiles[String(profile)] = normalized; }
      });
      return result;
    }
    normalized = normalizeProfile(value);
    if (normalized && Object.keys(normalized).length) {
      key = normalized.track ? profileKey(normalized.track) : 'default';
      result.profiles[key] = normalized;
    }
    return result;
  }
  function hasValues(value) { return !!value && Object.keys(value).length > 0; }
  function readJson(storage, key, fallback) {
    try { var raw = storage && storage.getItem ? storage.getItem(key) : null; return raw ? JSON.parse(raw) : fallback; }
    catch (_error) { return fallback; }
  }
  function saveLegacyStore(storage, values) {
    try {
      if (!storage || !storage.setItem || !storage.removeItem) { return false; }
      if (values && Object.keys(values).length) { storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(normalizeStore(values))); }
      else { storage.removeItem(LEGACY_STORAGE_KEY); }
      return true;
    } catch (_error) { return false; }
  }
  function loadStore(storage, serverId) {
    var current = readJson(storage, STORAGE_KEY, null);
    var legacy;
    var result;
    var legacyStore;
    var profile;
    var legacyPrefix;
    var currentPrefix;
    var migratedKeys;
    var migrated;
    if (current && typeof current === 'object') {
      result = normalizeStore(current);
      legacy = readJson(storage, LEGACY_STORAGE_KEY, {});
      legacyStore = normalizeStore(legacy);
    } else {
      legacy = readJson(storage, LEGACY_STORAGE_KEY, {});
      legacyStore = normalizeStore(legacy);
      result = {};
    }
    if (String(serverId || '').indexOf('|') !== -1) {
      legacyPrefix = encodeURIComponent(String(serverId).split('|')[0]) + '|';
      currentPrefix = encodeURIComponent(String(serverId)) + '|';
      migratedKeys = [];
      Object.keys(legacyStore).forEach(function (legacyKey) {
        if (legacyKey.indexOf(legacyPrefix) !== 0) { return; }
        migratedKeys.push(legacyKey);
        migrated = currentPrefix + legacyKey.slice(legacyPrefix.length);
        if (!result[migrated]) { result[migrated] = legacyStore[legacyKey]; }
      });
      if (migratedKeys.length && saveStore(storage, result)) {
        migratedKeys.forEach(function (legacyKey) { delete legacyStore[legacyKey]; });
        saveLegacyStore(storage, legacyStore);
      }
      return result;
    }
    Object.keys(legacyStore).forEach(function (legacyKey) {
      if (!result[legacyKey]) { result[legacyKey] = legacyStore[legacyKey]; return; }
      for (profile in legacyStore[legacyKey].profiles) {
        if (!owns(result[legacyKey].profiles, profile)) { result[legacyKey].profiles[profile] = legacyStore[legacyKey].profiles[profile]; }
      }
    });
    return result;
  }
  function normalizeStore(value) {
    var result = {};
    Object.keys(value && typeof value === 'object' ? value : {}).forEach(function (key) {
      var record = normalizeRecord(value[key]);
      if (record && Object.keys(record.profiles).length) { result[String(key)] = record; }
    });
    return result;
  }
  function saveStore(storage, values) {
    try { if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(normalizeStore(values || {}))); return true; } }
    catch (_error) {}
    return false;
  }
  function save(storage, values) { return saveStore(storage, values); }
  function readRecord(storage, serverId, kind, ratingKey) {
    var key = identity(serverId, kind, ratingKey);
    var store = loadStore(storage, serverId);
    return key && store[key] ? store[key] : null;
  }
  function profileFromRecord(record, track) {
    var profiles = record && record.profiles || {};
    var matches;
    if (!record) { return null; }
    if (track) {
      matches = Object.keys(profiles).map(function (key) { return profiles[key]; }).filter(function (profile) { return profile && profile.track && sameTrack(profile.track, track); });
      if (matches.length) { return matches[0]; }
      if (supported(track) && profiles[profileKey(track)]) { return profiles[profileKey(track)]; }
      if (externalText(track)) {
        matches = Object.keys(profiles).map(function (key) { return profiles[key]; }).filter(function (profile) {
          return profile && profile.track && sameExternalTextIdentity(profile.track, track);
        });
        if (matches.length === 1) { return matches[0]; }
      }
    }
    if (profiles['default']) { return profiles['default']; }
    return null;
  }
  function readProfile(storage, serverId, kind, ratingKey, track) { return profileFromRecord(readRecord(storage, serverId, kind, ratingKey), track); }
  function applies(value, track) { return !!value && (!value.track || !track || sameTrack(value.track, track) || sameExternalTextIdentity(value.track, track)); }
  function resolve(storage, serverId, detail, track) {
    var media = readProfile(storage, serverId, 'media', mediaRatingKey(detail), track);
    var season = readProfile(storage, serverId, 'season', seasonRatingKey(detail), track);
    if (!applies(media, track)) { media = null; }
    if (!applies(season, track)) { season = null; }
    if (!media && !season) { return null; }
    var result = merge(season, media);
    if (media && media.track || season && season.track) { result.track = media && media.track || season.track; }
    return result;
  }
  function resolveLayers(storage, serverId, detail, track) {
    return {
      media: readProfile(storage, serverId, 'media', mediaRatingKey(detail), track),
      season: readProfile(storage, serverId, 'season', seasonRatingKey(detail), track)
    };
  }
  function merge(base, override) {
    var result = copy(base);
    var key;
    for (key in (override || {})) { if (owns(override, key) && key !== 'track') { result[key] = override[key]; } }
    return result;
  }
  function parent(storage, serverId, detail, globalValues, track) { return merge(globalValues || {}, resolveLayers(storage, serverId, detail, track).season); }
  function effective(storage, serverId, detail, globalValues, track) {
    var layers = resolveLayers(storage, serverId, detail, track);
    return merge(merge(globalValues || {}, layers.season), layers.media);
  }
  function mutateProfile(store, serverId, detail, kind, track, values, deleteProfile) {
    var key = identity(serverId, kind, kind === 'season' ? seasonRatingKey(detail) : mediaRatingKey(detail));
    var record = key && store[key] ? store[key] : { profiles: {} };
    /** @type {Object.<string, any>} */
    var profile = normalizeProfile(values || {});
    /** @type {Object.<string, any>} */
    var source = values || {};
    var profileId = profileKey(track || (values && values.track));
    if (!key) { return false; }
    if (deleteProfile || !hasValues(normalizeStyle(values || {}))) { delete record.profiles[profileId]; }
    else {
      profile.track = signature(track || source.track) || profile.track || null;
      record.profiles[profileId] = profile;
    }
    if (Object.keys(record.profiles).length) { store[key] = record; } else { delete store[key]; }
    return store;
  }
  function updateProfile(storage, serverId, detail, kind, track, values, deleteProfile) {
    var updated = mutateProfile(loadStore(storage, serverId), serverId, detail, kind, track, values, deleteProfile);
    return updated ? saveStore(storage, updated) : false;
  }
  function saveProfile(storage, serverId, detail, kind, track, values) { return updateProfile(storage, serverId, detail, kind, track, values, false); }
  function clearProfile(storage, serverId, detail, kind, track) { return updateProfile(storage, serverId, detail, kind, track, {}, true); }
  function updateProfileLayers(storage, serverId, detail, track, seasonValues, removeMedia, mediaValues) {
    var store = loadStore(storage, serverId);
    var seasonKey = identity(serverId, 'season', seasonRatingKey(detail));
    var mediaKey = identity(serverId, 'media', mediaRatingKey(detail));
    var seasonProfileId = profileKey(track);
    var profile = normalizeProfile(seasonValues || {});
    var mediaRecord;
    var mediaProfileKeys;
    var hadExactMediaProfile;
    var mediaProfile;
    if (!seasonKey || !mediaKey) { return false; }
    if (hasValues(normalizeStyle(seasonValues || {}))) {
      profile['track'] = signature(track) || profile['track'] || null;
      if (!store[seasonKey]) { store[seasonKey] = { profiles: {} }; }
      store[seasonKey].profiles[seasonProfileId] = profile;
    } else if (store[seasonKey]) {
      delete store[seasonKey].profiles[seasonProfileId];
      if (!Object.keys(store[seasonKey].profiles).length) { delete store[seasonKey]; }
    }
    if (removeMedia && store[mediaKey]) {
      mediaRecord = store[mediaKey];
      hadExactMediaProfile = owns(mediaRecord.profiles, seasonProfileId);
      delete mediaRecord.profiles[seasonProfileId];
      if (!hadExactMediaProfile && externalText(track)) {
        mediaProfileKeys = Object.keys(mediaRecord.profiles).filter(function (key) {
          var mediaProfile = mediaRecord.profiles[key];
          return mediaProfile && mediaProfile.track && sameExternalTextIdentity(mediaProfile.track, track);
        });
        if (mediaProfileKeys.length === 1) { delete mediaRecord.profiles[mediaProfileKeys[0]]; }
      }
      if (seasonProfileId !== 'default') { delete mediaRecord.profiles.default; }
      if (hasValues(normalizeStyle(mediaValues || {}))) {
        mediaProfile = normalizeProfile(mediaValues || {});
        mediaProfile['track'] = signature(track) || mediaProfile['track'] || null;
        mediaRecord.profiles[seasonProfileId] = mediaProfile;
      }
      if (!Object.keys(mediaRecord.profiles).length) { delete store[mediaKey]; }
    }
    return saveStore(storage, store);
  }
  function writeLegacyCompatible(storage, serverId, detail, value, kind) {
    var track = value && (value.track || value.subtitleTrack) || null;
    var style = normalizeStyle(value);
    if (!track && value && value.subtitleMode) { track = value.subtitleTrack || null; }
    return saveProfile(storage, serverId, detail, kind, track, style);
  }
  function diff(base, values) {
    var result = {};
    var parentValue = normalizeStyle(base) || {};
    var candidate = normalizeStyle(values) || {};
    Object.keys(candidate).forEach(function (key) { if (!owns(parentValue, key) || parentValue[key] !== candidate[key]) { result[key] = candidate[key]; } });
    if (values && values.track) { result.track = signature(values.track); }
    return result;
  }

  return {
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    STORAGE_KEY: STORAGE_KEY,
    clearProfile: clearProfile,
    diff: diff,
    effective: effective,
    parent: parent,
    resolve: resolve,
    resolveLayers: resolveLayers,
    save: save,
    saveProfile: saveProfile,
    saveSeason: function (storage, serverId, detail, value) { return writeLegacyCompatible(storage, serverId, detail, value, 'season'); },
    seasonRatingKey: seasonRatingKey,
    signature: signature,
    updateProfileLayers: updateProfileLayers
  };
}));
