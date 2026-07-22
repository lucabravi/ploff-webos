(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailPreferenceState = factory(); }
}(this, function () {
  'use strict';
  function emptyOverride() { return { audioTrack: null, subtitleTrack: null, subtitlesOff: false, mediaIndex: null, partIndex: null }; }
  function create(options) {
    var values = options || {};
    var state = { profile: null, override: null, identity: '' };
    function snapshot() { return { profile: state.profile, override: state.override, identity: state.identity }; }
    function prepare(identity) {
      state.identity = String(identity || ''); state.profile = null;
      state.override = state.identity && values.MediaPreferences ? values.MediaPreferences.load(values.storage, state.identity) : null;
      return snapshot();
    }
    function clear() { state.profile = null; state.override = null; state.identity = ''; }
    function setProfile(profile) { state.profile = profile || null; return state.profile; }
    function versions() { return state.profile && state.profile.versions && state.profile.versions.length ? state.profile.versions : (state.profile ? [state.profile] : []); }
    function selectedProfile() {
      var list = versions();
      var requested = state.override && state.override.mediaIndex;
      var partIndex = state.override && state.override.partIndex;
      var index;
      if (requested !== null && requested !== undefined) {
        for (index = 0; index < list.length; index += 1) {
          if (list[index].mediaIndex === requested && (partIndex === null || partIndex === undefined || list[index].partIndex === partIndex)) { return list[index]; }
        }
      }
      return list[0] || null;
    }
    function resolved(settings) {
      var profile = selectedProfile();
      return values.MediaPreferences && profile ? values.MediaPreferences.resolve({ options: {}, audioTracks: profile.audioTracks, subtitleTracks: profile.subtitleTracks }, state.override, settings) : null;
    }
    function choiceState() { return values.MediaProfile.choiceState(selectedProfile(), versions()); }
    function ensureOverride() { if (!state.override) { state.override = emptyOverride(); } return state.override; }
    function save() {
      if (!values.MediaPreferences || !state.identity) { return state.override; }
      if (!state.override || (!state.override.audioTrack && !state.override.subtitleTrack && !state.override.subtitlesOff && state.override.mediaIndex === null)) {
        values.MediaPreferences.clear(values.storage, state.identity); state.override = null;
      } else { state.override = values.MediaPreferences.save(values.storage, state.identity, state.override); }
      return state.override;
    }
    function cycleTrack(kind, direction) {
      var profile = selectedProfile(); var override; var tracks; var list; var currentTrack; var currentIndex = 0; var index;
      if (!profile) { return null; }
      override = ensureOverride();
      if (kind === 'audio') {
        tracks = profile.audioTracks || []; list = [null].concat(tracks);
        currentTrack = override.audioTrack && values.MediaPreferences.findTrack(tracks, override.audioTrack, false);
        if (currentTrack) { currentIndex = tracks.indexOf(currentTrack) + 1; }
        index = (currentIndex + direction + list.length) % list.length; override.audioTrack = values.MediaPreferences.trackPreference(list[index]);
      } else {
        tracks = profile.subtitleTracks || []; list = ['automatic', 'off'].concat(tracks);
        currentTrack = override.subtitleTrack && values.MediaPreferences.findTrack(tracks, override.subtitleTrack, false);
        currentIndex = override.subtitlesOff ? 1 : (currentTrack ? tracks.indexOf(currentTrack) + 2 : 0);
        index = (currentIndex + direction + list.length) % list.length;
        override.subtitlesOff = list[index] === 'off'; override.subtitleTrack = index < 2 ? null : values.MediaPreferences.trackPreference(list[index]);
      }
      save(); return snapshot();
    }
    function setTrack(kind, track, off) {
      var override = ensureOverride();
      if (kind === 'audio') { override.audioTrack = values.MediaPreferences.trackPreference(track); }
      else {
        override.subtitlesOff = off === true;
        override.subtitleTrack = off ? null : values.MediaPreferences.trackPreference(track);
      }
      save(); return snapshot();
    }
    function cycleVersion(direction) {
      var list = versions(); var candidates; var override; var currentIndex = 0; var index;
      if (list.length < 2) { return snapshot(); }
      override = ensureOverride(); candidates = [{ mediaIndex: null, partIndex: null }].concat(list.map(function (profile) { return { mediaIndex: profile.mediaIndex, partIndex: profile.partIndex }; }));
      for (index = 1; index < candidates.length; index += 1) { if (candidates[index].mediaIndex === override.mediaIndex && candidates[index].partIndex === override.partIndex) { currentIndex = index; break; } }
      currentIndex = (currentIndex + direction + candidates.length) % candidates.length;
      override.mediaIndex = candidates[currentIndex].mediaIndex; override.partIndex = candidates[currentIndex].partIndex; save(); return snapshot();
    }
    function setVersion(mediaIndex, partIndex) {
      var override = ensureOverride();
      override.mediaIndex = mediaIndex === null ? null : Number(mediaIndex);
      override.partIndex = partIndex === null ? null : Number(partIndex);
      save(); return snapshot();
    }
    function playbackPreferences(settings, videoQuality) {
      var preferences = {}; var key; var override = state.override;
      for (key in settings) { if (Object.prototype.hasOwnProperty.call(settings, key)) { preferences[key] = settings[key]; } }
      preferences.videoQuality = videoQuality;
      if (!override) { return preferences; }
      if (override.mediaIndex !== null) { preferences.mediaIndex = override.mediaIndex; preferences.partIndex = override.partIndex || 0; }
      if (override.audioTrack) { preferences.audioTrackPreference = override.audioTrack; }
      if (override.subtitlesOff) { preferences.subtitleMode = 'off'; }
      else if (override.subtitleTrack) { preferences.subtitleTrackPreference = override.subtitleTrack; preferences.subtitleMode = 'always'; preferences.subtitleSuppressedForAudio = []; }
      return preferences;
    }
    return { snapshot: snapshot, prepare: prepare, clear: clear, setProfile: setProfile, versions: versions, selectedProfile: selectedProfile, resolved: resolved, choiceState: choiceState, ensureOverride: ensureOverride, save: save, cycleTrack: cycleTrack, setTrack: setTrack, cycleVersion: cycleVersion, setVersion: setVersion, playbackPreferences: playbackPreferences };
  }
  return { create: create };
}));
