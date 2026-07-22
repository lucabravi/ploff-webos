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

  function normalizedText(value) {
    return String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  }

  function trackPreference(track) {
    if (!track) { return null; }
    return {
      language: trackLanguage(track),
      name: normalizedText(track.title || track.extendedDisplayTitle || track.displayTitle),
      codec: normalizedText(track.codec || track.format),
      channels: Math.max(0, Number(track.channels || 0)),
      external: track.external === true || track.external === '1' || !!track.key
    };
  }

  function normalizeTrackPreference(value) {
    if (!value || typeof value !== 'object') { return null; }
    return {
      language: language(value.language),
      name: normalizedText(value.name),
      codec: normalizedText(value.codec),
      channels: Math.max(0, Number(value.channels || 0)),
      external: value.external === true
    };
  }

  function matchingCandidates(candidates, predicate) {
    var matches = candidates.filter(predicate);
    return matches.length ? matches : candidates;
  }

  function findTrack(tracks, preference, forcedOnly) {
    var signature = normalizeTrackPreference(preference);
    var candidates = (tracks || []).filter(function (track) { return !forcedOnly || track.forced; });
    var languageMatches;
    if (!signature || !candidates.length) { return null; }
    if (signature.language) {
      languageMatches = candidates.filter(function (track) { return trackLanguage(track) === signature.language; });
      if (!languageMatches.length) { return null; }
      candidates = languageMatches;
    }
    if (signature.name) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).name === signature.name; }); }
    if (signature.codec) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).codec === signature.codec; }); }
    if (signature.channels) { candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).channels === signature.channels; }); }
    candidates = matchingCandidates(candidates, function (track) { return trackPreference(track).external === signature.external; });
    return candidates[0] || null;
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
      audioTrack: normalizeTrackPreference(value.audioTrack),
      subtitleTrack: normalizeTrackPreference(value.subtitleTrack),
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
      if ((!forcedOnly || tracks[index].forced) && trackLanguage(tracks[index]) === target) { candidates.push(tracks[index]); }
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
    if (mode === 'always') { return byPriorities(tracks, settings.subtitleLanguages || [], false, settings.subtitleSourcePreference || 'external') || selected(tracks); }
    if (mode === 'forced') {
      return byPriorities(tracks, settings.subtitleLanguages || [], true, settings.subtitleSourcePreference || 'external') || (function () {
        for (index = 0; index < tracks.length; index += 1) { if (tracks[index].forced) { return tracks[index]; } }
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
    var local = normalize(override) || { audioTrack: null, subtitleTrack: null, subtitlesOff: false, mediaIndex: null, partIndex: null };
    var requestedAudio = local.audioTrack ? findTrack(audioTracks, local.audioTrack, false) : null;
    var requestedSubtitle = local.subtitleTrack && !local.subtitlesOff ? findTrack(subtitleTracks, local.subtitleTrack, false) : null;
    var audio = requestedAudio || globalAudio(audioTracks, settings);
    var subtitle = local.subtitlesOff ? null : (requestedSubtitle || globalSubtitle(subtitleTracks, audio, settings));
    return {
      audioStreamID: audio ? audio.id : '',
      subtitleStreamID: subtitle ? subtitle.id : '',
      audioTrack: audio,
      subtitleTrack: subtitle,
      audioLabel: audio ? (audio.language || audio.title || trackLanguage(audio)) : '',
      subtitleLabel: subtitle ? (subtitle.language || subtitle.title || trackLanguage(subtitle)) : '',
      fallbackUsed: !!((local.audioTrack && !requestedAudio) || (local.subtitleTrack && !local.subtitlesOff && !requestedSubtitle)),
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
    findTrack: findTrack,
    key: key,
    load: load,
    resolve: resolve,
    save: save,
    storageKey: storageKey,
    trackPreference: trackPreference
  };
}));
