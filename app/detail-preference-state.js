(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailPreferenceState = factory(); }
}(this, function () {
  'use strict';

  function owns(source, key) { return !!source && Object.prototype.hasOwnProperty.call(source, key); }
  function sameDetail(first, second) {
    return !!(first && second && String(first.ratingKey || '') === String(second.ratingKey || '') && String(first.type || '') === String(second.type || ''));
  }
  function create(options) {
    var values = options || {};
    var MediaPreferences = values.MediaPreferences;
    var VersionSelection = values.VersionSelection || {};
    var state = { profile: null, override: null, identity: '', detail: null, scopes: null };

    function snapshot() { return { profile: state.profile, override: state.override, identity: state.identity }; }
    function currentSelection(detail) {
      if (!MediaPreferences) { return null; }
      if (detail && state.detail && sameDetail(detail, state.detail) && state.scopes) {
        return MediaPreferences.effectiveSelection(state.scopes, detail);
      }
      if (detail && MediaPreferences.loadScopes) {
        return MediaPreferences.effectiveSelection(MediaPreferences.loadScopes(values.storage, state.identity, detail), detail);
      }
      return state.override;
    }
    function currentScopes(detail) {
      if (!MediaPreferences || !detail) { return state.scopes; }
      if (state.detail && sameDetail(detail, state.detail) && state.scopes) { return state.scopes; }
      return MediaPreferences.loadScopes ? MediaPreferences.loadScopes(values.storage, state.identity, detail) : null;
    }
    function refreshOverride() {
      state.override = currentSelection(state.detail);
      return state.override;
    }
    function prepare(identity, detail) {
      state.identity = String(identity || '');
      state.detail = detail || null;
      state.profile = null;
      state.scopes = state.identity && state.detail && MediaPreferences && MediaPreferences.loadScopes
        ? MediaPreferences.loadScopes(values.storage, state.identity, state.detail) : null;
      state.override = state.scopes && MediaPreferences ? MediaPreferences.effectiveSelection(state.scopes, state.detail) :
        (state.identity && MediaPreferences ? MediaPreferences.load(values.storage, state.identity) : null);
      return snapshot();
    }
    function clear() {
      state.profile = null; state.override = null; state.identity = ''; state.detail = null; state.scopes = null;
    }
    function setProfile(profile) {
      var override = currentSelection(state.detail) || {};
      var legacy = override.legacyVersion;
      var version;
      state.profile = profile || null;
      if (legacy && !override.versionSignature) {
        version = versionFor(legacy.mediaIndex, legacy.partIndex);
        if (version) { applyPatch({ versionSignature: versionSignature(version), legacyVersion: null }); }
      }
      return state.profile;
    }
    function versions() { return state.profile && state.profile.versions && state.profile.versions.length ? state.profile.versions : (state.profile ? [state.profile] : []); }
    function selectionOptions(optionsValue) {
      var source = optionsValue || {};
      return {
        capabilities: source.capabilities || {}, mode: source.mode || 'auto', priorities: source.priorities || []
      };
    }
    function selectedProfile(optionsValue) {
      var list = versions();
      var override = currentSelection(state.detail) || state.override || {};
      var requested = override.versionSignature;
      var selection = selectionOptions(optionsValue);
      var selected;
      if (requested && VersionSelection.findAffine) {
        selected = VersionSelection.findAffine(list, requested, selection.capabilities, selection.mode);
        if (selected) { return selected; }
      } else if (requested && VersionSelection.selectAffine) {
        return VersionSelection.selectAffine(list, requested, selection.capabilities, selection.mode, selection.priorities) || list[0] || null;
      }
      if ((requested || optionsValue && (optionsValue.capabilities || optionsValue.automatic)) && VersionSelection.selectAutomatic) {
        selected = VersionSelection.selectAutomatic(list, selection.capabilities, selection.mode, selection.priorities);
        if (selected) { return selected; }
      }
      return list[0] || null;
    }
    function resolved(settings, profile) {
      var selected = profile || selectedProfile();
      var override = currentSelection(state.detail) || state.override;
      return MediaPreferences && selected ? MediaPreferences.resolve({ options: {}, audioTracks: selected.audioTracks, subtitleTracks: selected.subtitleTracks }, override, settings || {}) : null;
    }
    function choiceState() {
      var selected = selectedProfile();
      return values.MediaProfile && values.MediaProfile.choiceState ? values.MediaProfile.choiceState(selected, versions()) : {
        audio: !!(selected && selected.audioTracks && selected.audioTracks.length > 1),
        subtitles: !!(selected && selected.subtitleTracks && selected.subtitleTracks.length > 0),
        versions: versions().length > 1
      };
    }
    function ensureOverride() { if (!state.override) { state.override = {}; } return state.override; }
    function memoryPatch(patch) {
      var override = ensureOverride();
      var key;
      for (key in patch) {
        if (owns(patch, key)) {
          if (patch[key] === null || patch[key] === undefined) { delete override[key]; }
          else { override[key] = patch[key]; }
        }
      }
      return override;
    }
    function applyPatch(patch) {
      var scopes;
      if (!state.detail || !MediaPreferences || !MediaPreferences.updateSelection) { return memoryPatch(patch); }
      scopes = MediaPreferences.updateSelection(values.storage, state.identity, state.detail, patch);
      if (scopes) { state.scopes = scopes; refreshOverride(); }
      else { memoryPatch(patch); }
      return state.override;
    }
    function cycleTrack(kind, direction) {
      var profile = selectedProfile();
      var override = currentSelection(state.detail) || {};
      var tracks;
      var list;
      var current;
      var currentIndex;
      var index;
      if (!profile) { return null; }
      if (kind === 'audio') {
        tracks = profile.audioTracks || []; list = [null].concat(tracks); current = override.audioTrack && MediaPreferences.findTrack(tracks, override.audioTrack, false);
        currentIndex = current ? tracks.indexOf(current) + 1 : 0;
        index = (currentIndex + Number(direction || 0) + list.length) % list.length;
        setTrack('audio', list[index], false);
      } else {
        tracks = profile.subtitleTracks || []; list = ['automatic', 'off'].concat(tracks); current = override.subtitleTrack && MediaPreferences.findTrack(tracks, override.subtitleTrack, false);
        currentIndex = override.subtitlesOff ? 1 : (current ? tracks.indexOf(current) + 2 : 0);
        index = (currentIndex + Number(direction || 0) + list.length) % list.length;
        if (list[index] === 'automatic') { setTrack('subtitles', null, false); }
        else if (list[index] === 'off') { setTrack('subtitles', null, true); }
        else { setTrack('subtitles', list[index], false); }
      }
      return snapshot();
    }
    function setTrack(kind, track, off) {
      if (kind === 'audio') { applyPatch({ audioTrack: MediaPreferences.trackPreference(track) }); }
      else if (off === true) { applyPatch({ subtitleTrack: null, subtitlesOff: true }); }
      else { applyPatch({ subtitleTrack: MediaPreferences.trackPreference(track), subtitlesOff: false }); }
      return snapshot();
    }
    function versionFor(mediaIndex, partIndex) {
      var list = versions();
      var index;
      for (index = 0; index < list.length; index += 1) {
        if (Number(list[index].mediaIndex) === Number(mediaIndex) && (partIndex === null || partIndex === undefined || Number(list[index].partIndex) === Number(partIndex))) { return list[index]; }
      }
      return null;
    }
    function versionSignature(version) {
      return VersionSelection.signature ? VersionSelection.signature(version) : (MediaPreferences.versionSignature ? MediaPreferences.versionSignature(version) : null);
    }
    function cycleVersion(direction) {
      var list = versions();
      var override = currentSelection(state.detail) || {};
      var currentIndex = 0;
      var index;
      var selected;
      if (list.length < 2) { return snapshot(); }
      if (override.versionSignature) {
        selected = selectedProfile();
        if (selected && VersionSelection.matchesAffinity && VersionSelection.matchesAffinity(selected, override.versionSignature)) { currentIndex = list.indexOf(selected) + 1; }
      }
      index = (currentIndex + Number(direction || 0) + list.length + 1) % (list.length + 1);
      selected = index === 0 ? null : list[index - 1];
      setVersion(selected ? selected.mediaIndex : null, selected ? selected.partIndex : null);
      return snapshot();
    }
    function setVersion(mediaIndex, partIndex) {
      var version;
      if (mediaIndex && typeof mediaIndex === 'object') { version = mediaIndex; }
      else if (mediaIndex === null || mediaIndex === undefined || mediaIndex === '') { applyPatch({ versionSignature: null, legacyVersion: null }); return snapshot(); }
      else { version = versionFor(mediaIndex, partIndex); }
      applyPatch({ versionSignature: versionSignature(version), legacyVersion: null });
      return snapshot();
    }
    function buildPlaybackPreferences(detail, settings, videoQuality, fallbackAffinity) {
      var preferences = {};
      var key;
      var override = currentSelection(detail) || {};
      for (key in (settings || {})) { if (owns(settings, key)) { preferences[key] = settings[key]; } }
      preferences.videoQuality = videoQuality;
      if (override.versionSignature) { preferences.versionAffinity = override.versionSignature; }
      else if (fallbackAffinity) { preferences.versionAffinity = fallbackAffinity; }
      if (override.audioTrack) { preferences.audioTrackPreference = override.audioTrack; }
      if (override.subtitlesOff) { preferences.subtitleMode = 'off'; delete preferences.subtitleTrackPreference; }
      else if (override.subtitleTrack) { preferences.subtitleTrackPreference = override.subtitleTrack; }
      return preferences;
    }
    function playbackPreferences(settings, videoQuality, fallbackAffinity, detail) { return buildPlaybackPreferences(detail || state.detail, settings, videoQuality, fallbackAffinity); }
    function playbackPreferencesFor(detail, settings, videoQuality, fallbackAffinity) { return buildPlaybackPreferences(detail, settings, videoQuality, fallbackAffinity); }
    function preferenceSource(field, detail) {
      var scopes = currentScopes(detail || state.detail);
      return MediaPreferences && MediaPreferences.selectionSource ? MediaPreferences.selectionSource(scopes, detail || state.detail, field) : 'global';
    }
    return {
      snapshot: snapshot, prepare: prepare, clear: clear, setProfile: setProfile, versions: versions,
      selectedProfile: selectedProfile, resolved: resolved, choiceState: choiceState,
      cycleTrack: cycleTrack, setTrack: setTrack, cycleVersion: cycleVersion, setVersion: setVersion,
      playbackPreferences: playbackPreferences, playbackPreferencesFor: playbackPreferencesFor,
      preferenceSource: preferenceSource
    };
  }
  return { create: create };
}));
