(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffInputCommandRouter = factory(); }
}(this, function () {
  'use strict';

  function isBack(code) { return code === 27 || code === 461; }
  function isActivate(code) { return code === 13 || code === 415; }

  function playerQueue(values) {
    var state = values || {};
    var view = String(state.view || 'home');
    var code = Number(state.keyCode || 0);
    if (state.directPlayPending && view !== 'player') {
      return isBack(code) ? 'pending-cancel' : 'pending-consume';
    }
    if (view === 'player' && state.drawerOpen) {
      if (code === 38) { return 'drawer-up'; }
      if (code === 40) { return 'drawer-down'; }
      if (code === 13) { return 'drawer-activate'; }
      if (isBack(code) || code === 37) { return 'drawer-close'; }
      return 'drawer-consume';
    }
    if (view === 'player' && state.queueButtonFocused && code === 13) { return 'drawer-open'; }
    if (view === 'library' && state.libraryZone === 'grid') {
      if (code === 415 && state.focusedContainerPlayable) { return 'library-start-container'; }
      if (isActivate(code)) {
        if (state.playlistContainerActive && state.focusedPlaylistPlayable) {
          return code === 415 ? 'library-open-play' : 'library-open-detail';
        }
        return 'clear-pass';
      }
    }
    if (view === 'detail' && state.playlistQueue && state.detailPresent && isActivate(code)) {
      if (state.detailZone === 'episodes') { return 'clear-pass'; }
      if ((code === 415 && state.detailZone !== 'episodes') ||
          (code === 13 && state.detailZone === 'play' && Number(state.detailActionIndex || 0) === 0)) {
        return 'detail-activate';
      }
    }
    if (isActivate(code) && state.navigationFocused) { return 'clear-pass'; }
    if ((view === 'home' || view === 'search' || view === 'watchlist') && isActivate(code)) { return 'clear-pass'; }
    return 'pass';
  }

  function settings(values) {
    var context = values || {};
    var state = context.state || {};
    var code = Number(context.keyCode || 0);
    var direction = String(context.direction || '');
    var editorIndex = Number(context.editorIndex || 0);
    if (context.destroyed) { return 'ignore'; }
    if (context.safeAreaOpen) { return 'safe-area'; }
    if (context.subtitleStyleOpen) { return 'subtitle-style'; }
    if (context.playbackCompatibilityOpen) { return 'playback-compatibility'; }
    if (context.updateOpen) { return 'update'; }
    if (isBack(code)) {
      if (context.editorOpen) { return 'back-server-editor'; }
      if (state.languageKind) { return 'back-language'; }
      if (state.level === 'category') { return 'back-category'; }
      if (state.zone !== 'nav') { return 'back-navigation'; }
      return 'back-close';
    }
    if (state.zone === 'nav') {
      if (direction === 'left') { return 'nav-left'; }
      if (direction === 'right') { return 'nav-right'; }
      if (direction === 'down') { return 'nav-down'; }
      if (code === 13) { return 'nav-activate'; }
      return 'nav-noop';
    }
    if (context.editorOpen) {
      if (code === 38 && editorIndex === 0) { return 'editor-close'; }
      if (code === 38) { return 'editor-up'; }
      if (code === 40) { return 'editor-down'; }
      if (code === 13) { return 'editor-activate'; }
      return 'editor-noop';
    }
    if (state.languageKind) {
      if (code === 38) { return 'language-up'; }
      if (code === 40) { return 'language-down'; }
      if (code === 37) { return 'language-left'; }
      if (code === 39) { return 'language-right'; }
      if (code === 13) { return 'language-activate'; }
      return 'language-noop';
    }
    if (code === 38 && Number(state.index || 0) === 0) { return 'list-navigation'; }
    if (code === 38) { return 'list-up'; }
    if (code === 40) { return 'list-down'; }
    if (code === 37) { return 'list-left'; }
    if (code === 39) { return 'list-right'; }
    if (code === 13) { return 'list-activate'; }
    return 'list-noop';
  }

  return { playerQueue: playerQueue, settings: settings };
}));
