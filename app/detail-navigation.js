(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailNavigation = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function create() {
    var state = { zone: 'play', actionIndex: 0, seasonIndex: 0, episodeIndex: 0 };
    function snapshot() { return { zone: state.zone, actionIndex: state.actionIndex, seasonIndex: state.seasonIndex, episodeIndex: state.episodeIndex }; }
    function set(next) {
      var value = next || {};
      if (value.zone !== undefined) { state.zone = value.zone; }
      if (value.actionIndex !== undefined) { state.actionIndex = Number(value.actionIndex) || 0; }
      if (value.seasonIndex !== undefined) { state.seasonIndex = Number(value.seasonIndex) || 0; }
      if (value.episodeIndex !== undefined) { state.episodeIndex = Number(value.episodeIndex) || 0; }
      return snapshot();
    }
    function navigate(direction, context) {
      var options = context || {};
      var choices = options.choiceZones || [];
      var choiceIndex;
      var effect = '';
      if (state.zone === 'nav') {
        if (direction === 'down') { state.zone = options.hasSeries ? 'seasons' : 'play'; }
        else if (direction === 'left' || direction === 'right') { effect = 'nav-' + direction; }
      } else if (state.zone === 'seasons') {
        if (direction === 'left') { state.seasonIndex = clamp(state.seasonIndex - 1, 0, Math.max(0, Number(options.seasonCount || 0) - 1)); effect = 'season-preview'; }
        else if (direction === 'right') { state.seasonIndex = clamp(state.seasonIndex + 1, 0, Math.max(0, Number(options.seasonCount || 0) - 1)); effect = 'season-preview'; }
        else if (direction === 'down') { state.zone = 'play'; }
      } else if (state.zone === 'episodes') {
        if (direction === 'left') { state.episodeIndex = clamp(state.episodeIndex - 1, 0, Math.max(0, Number(options.episodeCount || 0) - 1)); effect = 'episode-preview'; }
        else if (direction === 'right') { state.episodeIndex = clamp(state.episodeIndex + 1, 0, Math.max(0, Number(options.episodeCount || 0) - 1)); effect = 'episode-preview'; }
        else if (direction === 'up') { state.zone = options.mediaInfoOverflowing ? 'media-info' : (choices.length ? choices[choices.length - 1] : 'play'); }
      } else if (state.zone === 'play') {
        if (direction === 'left') { state.actionIndex = clamp(state.actionIndex - 1, 0, 3); }
        else if (direction === 'right') { state.actionIndex = clamp(state.actionIndex + 1, 0, 3); }
        else if (direction === 'up' && options.summaryOverflowing) { state.zone = 'summary'; }
        else if (direction === 'up' && options.hasSeries) { state.zone = 'seasons'; }
        else if (direction === 'up') { state.zone = 'nav'; }
        else if (direction === 'down') { state.zone = choices.length ? choices[0] : (options.hasSeries ? 'episodes' : 'play'); }
      } else if (state.zone === 'summary') {
        if (direction === 'down') { state.zone = 'play'; state.actionIndex = 0; }
        else if (direction === 'up' && options.hasSeries) { state.zone = 'seasons'; }
      } else if (state.zone === 'media-info') {
        if (direction === 'up') { state.zone = choices.length ? choices[choices.length - 1] : 'play'; }
        else if (direction === 'down' && options.hasSeries) { state.zone = 'episodes'; }
      } else if (state.zone === 'audio' || state.zone === 'subtitles' || state.zone === 'version') {
        choiceIndex = choices.indexOf(state.zone);
        if (choiceIndex === -1) { state.zone = 'play'; }
        else if (direction === 'left' || direction === 'right') { effect = 'cycle-' + state.zone + '-' + direction; }
        else if (direction === 'up') { state.zone = choiceIndex > 0 ? choices[choiceIndex - 1] : 'play'; }
        else if (direction === 'down') { state.zone = choiceIndex < choices.length - 1 ? choices[choiceIndex + 1] : (options.mediaInfoOverflowing ? 'media-info' : (options.hasSeries ? 'episodes' : state.zone)); }
      }
      return { state: snapshot(), effect: effect };
    }
    return { snapshot: snapshot, set: set, navigate: navigate };
  }
  return { create: create };
}));
