(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMediaPreferences = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_PREFIX = 'ploff.mediaPreference.v1.';
  var LANGUAGE_ALIASES = { eng: 'en', ita: 'it', jpn: 'ja', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', por: 'pt', kor: 'ko', chi: 'zh', zho: 'zh', rus: 'ru' };

  function language(value) {
    var normalized = String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/_/g, '-').split('-')[0];
    return LANGUAGE_ALIASES[normalized] || normalized;
  }

  function trackLanguage(track) {
    return language(track && (track.languageTag || track.languageCode));
  }

  function key(serverId, profileId, detail) {
    var mediaKind = detail && (detail.type === 'episode' || detail.type === 'season' || detail.type === 'show') ? 'show' : 'movie';
    var mediaKey = mediaKind === 'show'
      ? (detail && (detail.showRatingKey || (detail.type === 'show' ? detail.ratingKey : '') || detail.grandparentRatingKey))
      : (detail && detail.ratingKey);
    return [String(serverId || 'default'), String(profileId || 'default'), mediaKind, String(mediaKey || '')].join(':');
  }

  function storageKey(identity) {
    return STORAGE_PREFIX + encodeURIComponent(String(identity || ''));
  }

  function normalize(value) {
    var mediaIndex;
    var partIndex;
    if (!value || typeof value !== 'object') { return null; }
    mediaIndex = value.mediaIndex === null || value.mediaIndex === undefined || value.mediaIndex === '' ? null : Number(value.mediaIndex);
    partIndex = value.partIndex === null || value.partIndex === undefined || value.partIndex === '' ? null : Number(value.partIndex);
    return {
      audioLanguage: language(value.audioLanguage),
      subtitleLanguage: language(value.subtitleLanguage),
      subtitlesOff: value.subtitlesOff === true,
      mediaIndex: isFinite(mediaIndex) && mediaIndex >= 0 ? mediaIndex : null,
      partIndex: isFinite(partIndex) && partIndex >= 0 ? partIndex : null
    };
  }

  function load(storage, identity) {
    try {
      var value = storage && storage.getItem(storageKey(identity));
      return value ? normalize(JSON.parse(value)) : null;
    } catch (error) {
      return null;
    }
  }

  function save(storage, identity, value) {
    var normalized = normalize(value);
    if (storage && storage.setItem && normalized) {
      storage.setItem(storageKey(identity), JSON.stringify(normalized));
    }
    return normalized;
  }

  function clear(storage, identity) {
    if (storage && storage.removeItem) { storage.removeItem(storageKey(identity)); }
  }

  function byLanguage(tracks, requested, forcedOnly) {
    var target = language(requested);
    var index;
    if (!target) { return null; }
    for (index = 0; index < tracks.length; index += 1) {
      if ((!forcedOnly || tracks[index].forced) && trackLanguage(tracks[index]) === target) { return tracks[index]; }
    }
    return null;
  }

  function byPriorities(tracks, priorities, forcedOnly) {
    var index;
    var found;
    for (index = 0; index < (priorities || []).length; index += 1) {
      found = byLanguage(tracks, priorities[index], forcedOnly);
      if (found) { return found; }
    }
    return null;
  }

  function selected(tracks) {
    var index;
    for (index = 0; index < tracks.length; index += 1) {
      if (tracks[index].selected) { return tracks[index]; }
    }
    return null;
  }

  function globalAudio(tracks, settings) {
    return byPriorities(tracks, settings.audioLanguages || [], false) || selected(tracks) || tracks[0] || null;
  }

  function globalSubtitle(tracks, audio, settings) {
    var mode = settings.subtitleMode || 'audio-mismatch';
    var suppressed = (settings.subtitleSuppressedForAudio || []).map(language);
    var preferred = settings.subtitleLanguages && settings.subtitleLanguages.length ? language(settings.subtitleLanguages[0]) : '';
    var index;
    if (audio && suppressed.indexOf(trackLanguage(audio)) !== -1) { mode = 'off'; }
    if (mode === 'always') { return byPriorities(tracks, settings.subtitleLanguages || [], false) || selected(tracks); }
    if (mode === 'forced') {
      return byPriorities(tracks, settings.subtitleLanguages || [], true) || (function () {
        for (index = 0; index < tracks.length; index += 1) { if (tracks[index].forced) { return tracks[index]; } }
        return null;
      }());
    }
    if (mode === 'audio-mismatch' && (!audio || !preferred || trackLanguage(audio) !== preferred)) {
      return byPriorities(tracks, settings.subtitleLanguages || [], false) || selected(tracks);
    }
    return null;
  }

  function resolve(playback, override, globalSettings) {
    var current = playback && playback.options || {};
    var audioTracks = playback && playback.audioTracks || [];
    var subtitleTracks = playback && playback.subtitleTracks || [];
    var settings = globalSettings || {};
    var local = normalize(override) || { audioLanguage: '', subtitleLanguage: '', subtitlesOff: false, mediaIndex: null, partIndex: null };
    var requestedAudio = local.audioLanguage ? byLanguage(audioTracks, local.audioLanguage, false) : null;
    var requestedSubtitle = local.subtitleLanguage && !local.subtitlesOff ? byLanguage(subtitleTracks, local.subtitleLanguage, false) : null;
    var audio = requestedAudio || globalAudio(audioTracks, settings);
    var subtitle = local.subtitlesOff ? null : (requestedSubtitle || globalSubtitle(subtitleTracks, audio, settings));
    return {
      audioStreamID: audio ? audio.id : '',
      subtitleStreamID: subtitle ? subtitle.id : '',
      audioLabel: audio ? (audio.language || audio.title || trackLanguage(audio)) : '',
      subtitleLabel: subtitle ? (subtitle.language || subtitle.title || trackLanguage(subtitle)) : '',
      fallbackUsed: !!((local.audioLanguage && !requestedAudio) || (local.subtitleLanguage && !local.subtitlesOff && !requestedSubtitle)),
      mediaIndex: local.mediaIndex === null ? current.mediaIndex : local.mediaIndex,
      partIndex: local.partIndex === null ? current.partIndex : local.partIndex,
      subtitleSize: current.subtitleSize || 100,
      offset: current.offset || 0,
      videoQuality: settings.videoQuality || current.videoQuality || 'original',
      playbackMode: settings.playbackMode || current.playbackMode || 'auto'
    };
  }

  return {
    STORAGE_PREFIX: STORAGE_PREFIX,
    clear: clear,
    key: key,
    load: load,
    resolve: resolve,
    save: save,
    storageKey: storageKey
  };
}));
