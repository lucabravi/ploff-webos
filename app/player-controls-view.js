(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlayerControlsView = factory(); }
}(this, function () {
  'use strict';
  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    function node(id) { return documentRef.getElementById(id); }
    function setText(id, text) { if (values.setText) { values.setText(id, text); } else { node(id).textContent = String(text || ''); } }
    function renderLoading(loading, preserveFrame) {
      node('player-video').className = 'player-video' + (loading && !preserveFrame ? ' is-loading' : '');
      node('player-loading').className = 'player-loading' + (loading ? (preserveFrame ? ' is-buffering' : '') : ' is-hidden');
    }
    function renderProgress(model) {
      var data = model || {};
      var toggle = node('player-toggle');
      node('player-progress').style.width = Math.max(0, Math.min(100, Number(data.progress || 0))) + '%';
      setText('player-current-time', data.currentTime || '');
      setText('player-duration', data.duration || '');
      toggle.className = toggle.className.replace(/\s*is-playing/g, '') + (data.paused ? '' : ' is-playing');
      toggle.setAttribute('aria-label', data.paused ? data.playLabel : data.pauseLabel);
    }
    function renderMode(mode) {
      node('player-controls').className = 'player-controls' + (mode === 'hidden' ? ' is-hidden' : (mode === 'timeline' ? ' is-timeline-only' : ''));
    }
    function renderEpisodeCommands(previousAvailable, nextAvailable) {
      node('player-previous').className = 'player-button player-icon-button player-skip player-previous' + (previousAvailable ? '' : ' is-unavailable');
      node('player-next').className = 'player-button player-icon-button player-skip player-next' + (nextAvailable ? '' : ' is-unavailable');
    }
    function buttonAvailable(index) {
      var buttons = documentRef.querySelectorAll('.player-button');
      return !!buttons[index] && buttons[index].className.indexOf('is-unavailable') === -1;
    }
    return { renderLoading: renderLoading, renderProgress: renderProgress, renderMode: renderMode, renderEpisodeCommands: renderEpisodeCommands, buttonAvailable: buttonAvailable };
  }
  return { create: create };
}));
