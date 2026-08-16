(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPointerController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platformRoot = values.root || {};
    var document = values.document;
    var focus = values.focus || {};
    var capture = values.capture || {};
    var navigation = values.navigation || {};
    var page = values.page || {};
    var player = values.player || {};
    var contextMenu = values.contextMenu || {};
    var state = {
      selectionActive: false,
      suppressNextClick: false,
      originX: null,
      originY: null,
      originTarget: null,
      primed: false,
      suppressedUntil: 0,
      currentButton: null,
      wheelDebounceTimer: null,
      wheelNavigationTimer: null,
      wheelNavigationActive: false,
      pageScrollPendingFocus: false,
      wheelPointerLocked: false,
      wheelPointerLockX: null,
      wheelPointerLockY: null,
      lastX: null,
      lastY: null,
      destroyed: false
    };
    var wheelPointerUnlockDistance = Math.max(1, Number(platformRoot.innerHeight) || 0) * 0.3;

    function call(callback, arg1, arg2, arg3, arg4) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4); }
      return undefined;
    }

    function now() {
      return typeof values.now === 'function' ? Number(values.now()) : new Date().getTime();
    }

    function currentSession() {
      return typeof values.sessionSnapshot === 'function' ? (values.sessionSnapshot() || {}) : {};
    }

    function has(button, name) {
      return !!(button && button.hasAttribute && button.hasAttribute(name));
    }

    function attribute(button, name) {
      return button && button.getAttribute ? button.getAttribute(name) : null;
    }

    function classContains(button, name) {
      return String(button && button.className || '').indexOf(name) !== -1;
    }

    function closestButton(node) {
      while (node && node !== document) {
        if (node.tagName && String(node.tagName).toLowerCase() === 'button') { return node; }
        node = node.parentNode;
      }
      return null;
    }

    function withSelection(callback) {
      state.selectionActive = true;
      try { return callback(); }
      finally { state.selectionActive = false; }
    }

    function focusCall(callback, arg1, arg2, arg3) {
      if (typeof callback !== 'function') { return false; }
      return callback(arg1, arg2, arg3) !== false;
    }

    function keyEvent(keyCode, sourceEvent) {
      return {
        keyCode: keyCode,
        target: sourceEvent && sourceEvent.target,
        preventDefault: function () {
          if (sourceEvent && sourceEvent.preventDefault) { sourceEvent.preventDefault(); }
        },
        stopPropagation: function () {
          if (sourceEvent && sourceEvent.stopPropagation) { sourceEvent.stopPropagation(); }
        },
        stopImmediatePropagation: function () {
          if (sourceEvent && sourceEvent.stopImmediatePropagation) { sourceEvent.stopImmediatePropagation(); }
          else if (sourceEvent && sourceEvent.stopPropagation) { sourceEvent.stopPropagation(); }
        }
      };
    }

    function playerButtonsIndex(button) {
      var buttons = document.querySelectorAll('.player-button');
      var index;
      for (index = 0; index < buttons.length; index += 1) {
        if (buttons[index] === button) { return index; }
      }
      return -1;
    }

    function playerSettingIndex(button) {
      var rows = call(player.settingRows) || [];
      var index;
      for (index = 0; index < rows.length; index += 1) {
        if (rows[index] === button) { return index; }
      }
      return -1;
    }

    function syncPointerFocus(button) {
      var index;
      var session = currentSession();
      if (state.destroyed || !button || button.disabled) { return false; }
      state.pageScrollPendingFocus = false;
      return withSelection(function () {
        if (call(capture.focus, button, session) === true) { return true; }
        if (has(button, 'data-subtitle-editor') && session.subtitleEditorOpen) {
          return focusCall(focus.subtitleEditor, button);
        } else if (has(button, 'data-diagnostics-action') && session.appView === 'diagnostics') {
          index = ['refresh', 'export', 'back'].indexOf(attribute(button, 'data-diagnostics-action'));
          return index >= 0 ? focusCall(focus.diagnostics, index) : false;
        } else if (has(button, 'data-resume-index') && session.resumeChoiceOpen) {
          return focusCall(focus.resume, Number(attribute(button, 'data-resume-index')));
        } else if (has(button, 'data-setup-language') || has(button, 'data-setup-action') || has(button, 'data-setup-server') || has(button, 'data-setup-profile')) {
          return focusCall(focus.setup, button);
        } else if (has(button, 'data-nav-index')) {
          return focusCall(focus.navigation, Number(attribute(button, 'data-nav-index')), session.appView);
        } else if (has(button, 'data-row-index')) {
          return focusCall(focus.home, Number(attribute(button, 'data-row-index')), Number(attribute(button, 'data-column')));
        } else if (has(button, 'data-season-position')) {
          return focusCall(focus.detail, 'season', Number(attribute(button, 'data-season-position')));
        } else if (has(button, 'data-episode-position')) {
          return focusCall(focus.detail, 'episode', Number(attribute(button, 'data-episode-position')));
        } else if (button.id === 'detail-play' || button.id === 'detail-watched' || button.id === 'detail-watchlist' || button.id === 'detail-options') {
          index = button.id === 'detail-play' ? 0 : (button.id === 'detail-watched' ? 1 : (button.id === 'detail-watchlist' ? 2 : 3));
          return focusCall(focus.detail, 'play', index);
        } else if (button.id === 'detail-audio' || button.id === 'detail-subtitles' || button.id === 'detail-version') {
          return focusCall(focus.detail, button.id === 'detail-audio' ? 'audio' : (button.id === 'detail-subtitles' ? 'subtitles' : 'version'), 0);
        } else if (button.id === 'detail-summary-button') {
          return focusCall(focus.detail, 'summary', 0);
        } else if (has(button, 'data-safe-area-index') && session.safeAreaOpen) {
          return focusCall(focus.safeArea, Number(attribute(button, 'data-safe-area-index')), button);
        } else if (has(button, 'data-subtitle-style-index') && session.subtitleStyleOpen) {
          return focusCall(focus.subtitleStyle, Number(attribute(button, 'data-subtitle-style-index')), button);
        } else if (has(button, 'data-setting-index')) {
          return focusCall(focus.settings, Number(attribute(button, 'data-setting-index')));
        } else if (has(button, 'data-text-input-index') && session.textInputDialogOpen) {
          return focusCall(focus.textInput, Number(attribute(button, 'data-text-input-index')));
        } else if (has(button, 'data-playback-compatibility-index') && session.playbackCompatibilityOpen) {
          return focusCall(focus.playbackCompatibility, Number(attribute(button, 'data-playback-compatibility-index')));
        } else if (has(button, 'data-update-index') && session.updateDialogOpen) {
          return focusCall(focus.updateDialog, Number(attribute(button, 'data-update-index')));
        } else if (button.id === 'privacy-dialog-close') {
          return focusCall(focus.privacy, button);
        } else if (has(button, 'data-language-index')) {
          return focusCall(focus.language, Number(attribute(button, 'data-language-index')));
        } else if (has(button, 'data-server-index')) {
          return focusCall(focus.server, Number(attribute(button, 'data-server-index')));
        } else if (has(button, 'data-search-key') || has(button, 'data-search-index')) {
          return focusCall(focus.search, button);
        } else if (has(button, 'data-library-tab')) {
          if (button.disabled) { return false; }
          return focusCall(focus.library, 'tabs', Number(attribute(button, 'data-library-tab')), button);
        } else if (button.id === 'library-refresh' || button.id === 'library-refresh-metadata') {
          return focusCall(focus.library, 'actions', button.id === 'library-refresh' ? 0 : 1, button);
        } else if (has(button, 'data-library-sort')) {
          return focusCall(focus.library, 'sort', ['titleSort', 'audienceRating', 'year'].indexOf(attribute(button, 'data-library-sort')), button);
        } else if (has(button, 'data-library-filter')) {
          return focusCall(focus.library, 'filter', ['all', 'unwatched', 'watched'].indexOf(attribute(button, 'data-library-filter')), button);
        } else if (has(button, 'data-library-filter-open')) {
          return focusCall(focus.library, 'filter', 3, button);
        } else if (has(button, 'data-library-advanced-filter') || has(button, 'data-library-filter-option') || has(button, 'data-library-filter-action')) {
          return focusCall(focus.libraryFilter, button);
        } else if (has(button, 'data-library-index') || has(button, 'data-library-recommendation-row')) {
          return focusCall(focus.library, 'grid', 0, button);
        } else if (has(button, 'data-watchlist-index')) {
          return focusCall(focus.watchlist, button);
        } else if (button.id === 'player-timeline-button') {
          return focusCall(focus.player, 'timeline', 0);
        } else if (button.id === 'player-skip-marker') {
          return focusCall(focus.player, 'skip', 0);
        } else if (button.id === 'player-chapters-hint') {
          return focusCall(focus.player, 'chapter-hint', 0);
        } else if (has(button, 'data-chapter-index')) {
          return focusCall(focus.player, 'chapter', Number(attribute(button, 'data-chapter-index')));
        } else if (classContains(button, 'player-button')) {
          index = playerButtonsIndex(button);
          return index >= 0 ? focusCall(focus.player, 'button', index) : false;
        } else if (has(button, 'data-choice-index') && session.choiceDialogOpen) {
          return focusCall(focus.choice, Number(attribute(button, 'data-choice-index')));
        } else if (classContains(button, 'setting-row') || button.id === 'player-media-info') {
          index = playerSettingIndex(button);
          return index >= 0 ? focusCall(focus.player, 'setting', index) : false;
        }
        return false;
      });
    }

    function notePlayerPointerActivity(button) {
      var session = currentSession();
      var controls;
      var settings;
      if (session.appView !== 'player' || session.playerControlsMode !== 'full' || !button) { return; }
      controls = document.getElementById('player-controls');
      settings = document.getElementById('player-settings');
      if ((controls && controls.contains(button)) ||
          (settings && settings.contains(button)) ||
          button.id === 'player-skip-marker' ||
          button.id === 'player-chapters-hint' ||
          has(button, 'data-chapter-index')) {
        call(player.renewControls);
      }
    }

    function handleOver(event) {
      var button;
      if (state.destroyed) { return; }
      button = closestButton(event && event.target);
      if (button && withSelection(function () { return call(capture.focus, button, currentSession()) === true; })) { return; }
      if (state.wheelPointerLocked || now() < state.suppressedUntil) { return; }
      if (!state.primed) {
        if (!state.originTarget) { state.originTarget = button; }
        return;
      }
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) { return; }
      if (button !== state.currentButton) {
        if (call(contextMenu.holding) === true) { call(contextMenu.releaseHold); }
        state.currentButton = button;
        syncPointerFocus(button);
        notePlayerPointerActivity(button);
      }
    }

    function handleMove(event) {
      var x;
      var y;
      var button;
      var distance;
      if (state.destroyed) { return; }
      x = Number(event && event.clientX);
      y = Number(event && event.clientY);
      button = closestButton(event && event.target);
      if (!isFinite(x) || !isFinite(y)) { return; }
      state.lastX = x;
      state.lastY = y;
      if (state.wheelPointerLocked) {
        if (state.wheelPointerLockX === null || state.wheelPointerLockY === null) {
          state.wheelPointerLockX = x;
          state.wheelPointerLockY = y;
          return;
        }
        distance = Math.sqrt(Math.pow(x - state.wheelPointerLockX, 2) + Math.pow(y - state.wheelPointerLockY, 2));
        if (distance < wheelPointerUnlockDistance) { return; }
        state.wheelPointerLocked = false;
        state.wheelPointerLockX = null;
        state.wheelPointerLockY = null;
        state.currentButton = null;
      }
      if (now() < state.suppressedUntil) { return; }
      if (state.originX === null || state.originY === null) {
        state.originX = x;
        state.originY = y;
        state.originTarget = button;
        return;
      }
      if (!state.primed) {
        distance = Math.sqrt(Math.pow(x - state.originX, 2) + Math.pow(y - state.originY, 2));
        if (distance < 20 || button === state.originTarget) { return; }
        state.primed = true;
      }
      if (currentSession().appView === 'player') { call(player.activity); }
      if (button && button !== state.currentButton) {
        state.currentButton = button;
        syncPointerFocus(button);
        notePlayerPointerActivity(button);
      }
    }

    function wheelKeyEvent(direction) {
      return { keyCode: direction < 0 ? 38 : 40, preventDefault: function () {} };
    }

    function pageScrollContainer(session) {
      if (session.appView === 'home' && session.homeArea === 'media') { return document.getElementById('content'); }
      if (session.appView === 'library' && session.libraryZone === 'grid') { return document.getElementById(session.libraryViewKey === 'recommended' ? 'library-recommended' : 'library-grid'); }
      if (session.appView === 'watchlist' && session.watchlistZone === 'grid') { return document.getElementById('watchlist-grid'); }
      if (session.appView === 'search' && session.searchZone === 'results') { return document.getElementById('search-results'); }
      if (session.appView === 'settings' && session.serverEditorOpen) { return document.getElementById('app-settings-list'); }
      if (session.appView === 'settings' && !session.languageKind) { return document.getElementById('app-settings-list'); }
      if (session.appView === 'settings' && session.languageKind) { return document.getElementById('language-editor-list'); }
      return null;
    }

    function firstVisibleButton(container, selector) {
      var buttons = container ? container.querySelectorAll(selector) : [];
      var containerRect = container ? container.getBoundingClientRect() : null;
      var best = null;
      var bestScore = Infinity;
      var index;
      var rect;
      var score;
      for (index = 0; index < buttons.length; index += 1) {
        rect = buttons[index].getBoundingClientRect();
        if (!containerRect || rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) { continue; }
        score = Math.abs(rect.top - containerRect.top) + Math.abs(rect.left - containerRect.left) / 100;
        if (score < bestScore) { best = buttons[index]; bestScore = score; }
      }
      return best;
    }

    function syncPageFocus() {
      var session;
      var container;
      var button;
      if (state.destroyed) { return false; }
      session = currentSession();
      container = pageScrollContainer(session);
      if (!container) { return false; }
      if (session.appView === 'home') {
        button = firstVisibleButton(container, '[data-row-index][data-column]');
        if (button) { call(page.restoreHome, Number(attribute(button, 'data-row-index')), Number(attribute(button, 'data-column'))); }
      } else if (session.appView === 'library') {
        button = firstVisibleButton(container, session.libraryViewKey === 'recommended' ? '[data-library-recommendation-row]' : '[data-library-index]');
        if (button) { call(page.restoreLibrary, button); }
      } else if (session.appView === 'watchlist') {
        button = firstVisibleButton(container, '[data-watchlist-index]');
        if (button) { call(page.restoreWatchlist, button); }
      } else if (session.appView === 'search') {
        button = firstVisibleButton(container, '[data-search-index]');
        if (button) { call(page.restoreSearch, Number(attribute(button, 'data-search-index'))); }
      } else if (session.appView === 'settings' && session.serverEditorOpen) {
        button = firstVisibleButton(container, '[data-server-index]');
        if (button) { call(page.restoreServer, Number(attribute(button, 'data-server-index'))); }
      } else if (session.appView === 'settings' && session.languageKind) {
        button = firstVisibleButton(container, '[data-language-index]');
        if (button) { call(page.restoreLanguage, Number(attribute(button, 'data-language-index'))); }
      } else if (session.appView === 'settings') {
        button = firstVisibleButton(container, '[data-setting-index]');
        if (button) { call(page.restoreSettings, Number(attribute(button, 'data-setting-index'))); }
      }
      return !!button;
    }

    function clearWheelNavigation() {
      if (state.wheelNavigationTimer !== null && platformRoot.clearTimeout) { platformRoot.clearTimeout(state.wheelNavigationTimer); }
      state.wheelNavigationTimer = null;
      state.wheelNavigationActive = false;
    }

    function beginWheelNavigation(duration) {
      clearWheelNavigation();
      state.wheelNavigationActive = true;
      if (platformRoot.setTimeout) {
        state.wheelNavigationTimer = platformRoot.setTimeout(function () {
          state.wheelNavigationTimer = null;
          state.wheelNavigationActive = false;
        }, Math.max(0, Number(duration || 350)));
      }
    }

    function scrollCurrentPage(direction) {
      var session = currentSession();
      var container = pageScrollContainer(session);
      var amount;
      if (!container) { return false; }
      state.pageScrollPendingFocus = true;
      amount = Math.max(180, Math.round(container.clientHeight * 0.55));
      beginWheelNavigation(350);
      if (session.appView === 'library') { call(page.beginLibraryWheel, 350); }
      if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
      if (container.scrollBy) { container.scrollBy({ top: direction * amount, left: 0, behavior: 'smooth' }); }
      else { container.scrollTop += direction * amount; }
      return true;
    }

    function handleWheel(event) {
      var delta;
      var direction;
      var session;
      if (state.destroyed) { return; }
      delta = Number(event && event.deltaY);
      if (!isFinite(delta) || delta === 0) { delta = -Number(event && event.wheelDelta || 0); }
      if (!isFinite(delta) || delta === 0) { return; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (state.wheelDebounceTimer !== null) { return; }
      direction = delta < 0 ? -1 : 1;
      state.wheelPointerLocked = true;
      state.wheelPointerLockX = state.lastX;
      state.wheelPointerLockY = state.lastY;
      state.suppressedUntil = now() + 500;
      if (platformRoot.setTimeout) {
        state.wheelDebounceTimer = platformRoot.setTimeout(function () { state.wheelDebounceTimer = null; }, 70);
      }
      session = currentSession();
      if (session.summaryDialogOpen) {
        call(page.scrollSummary, direction);
      } else if (call(values.wheelBehavior) === 'items') {
        call(values.inputKey, wheelKeyEvent(direction));
      } else if (call(values.wheelBehavior) === 'page' && scrollCurrentPage(direction)) {
        return;
      } else {
        call(values.inputKey, wheelKeyEvent(direction));
      }
    }

    function handleDown(event) {
      var button;
      var session;
      if (state.destroyed || (event && event.button !== undefined && Number(event.button) !== 0)) { return; }
      button = closestButton(event && event.target);
      session = currentSession();
      if (!button) { return; }
      if (has(button, 'data-nav-index') && session.navigationHasFocus && !session.navReorderMode) {
        syncPointerFocus(button);
        call(navigation.startHold, Number(attribute(button, 'data-nav-index')));
        return;
      }
      if (syncPointerFocus(button) && call(contextMenu.canOpen) === true) { call(contextMenu.startHold); }
    }

    function handleUp(event) {
      var session;
      if (state.destroyed) { return; }
      if (call(contextMenu.holding) === true && call(contextMenu.releaseHold) === true) {
        state.suppressNextClick = true;
        if (event && event.preventDefault) { event.preventDefault(); }
        if (event && event.stopPropagation) { event.stopPropagation(); }
      }
      session = currentSession();
      if (session.navHoldTriggered && session.navReorderMode) {
        call(navigation.markReorderReady);
        state.suppressNextClick = true;
      }
      call(navigation.cancelHold);
    }

    function seekTimelineFromPointer(event, button) {
      var rect = button.getBoundingClientRect();
      var clientX = Number(event && event.clientX);
      var ratio;
      var total;
      var playback = call(player.playbackSnapshot) || {};
      if (!isFinite(clientX) && isFinite(Number(event && event.pageX))) { clientX = Number(event.pageX) - Number(platformRoot.pageXOffset || 0); }
      if (rect.width <= 0 || !isFinite(clientX) || !playback.active || playback.streamSwitching) { return false; }
      total = Number(playback.durationSeconds || 0);
      if (!isFinite(total) || total <= 0) { return false; }
      ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (!isFinite(ratio)) { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      call(player.seekTimeline, ratio * total);
      return true;
    }

    function handleClick(event) {
      var button;
      var accentColor;
      var session;
      if (state.destroyed) { return; }
      button = closestButton(event && event.target);
      accentColor = event && event.target && event.target.getAttribute ? event.target.getAttribute('data-accent-color') : '';
      if (!button || button.disabled) { return; }
      if (state.suppressNextClick) {
        state.suppressNextClick = false;
        if (event && event.preventDefault) { event.preventDefault(); }
        if (event && event.stopPropagation) { event.stopPropagation(); }
        return;
      }
      session = currentSession();
      if (call(capture.click, event, button, session) === true) { return; }
      if (typeof button.onclick === 'function') {
        notePlayerPointerActivity(button);
        return;
      }
      if (session.navReorderMode && has(button, 'data-nav-index')) {
        if (session.navReorderReady) { call(navigation.finishReorder, true); }
        return;
      }
      if (button.id === 'player-timeline-button') {
        syncPointerFocus(button);
        notePlayerPointerActivity(button);
        seekTimelineFromPointer(event, button);
        return;
      }
      if (accentColor && has(button, 'data-setting-index')) {
        syncPointerFocus(button);
        call(values.selectAccent, accentColor);
        return;
      }
      if (!syncPointerFocus(button)) { return; }
      notePlayerPointerActivity(button);
      call(values.inputPress, keyEvent(13, event));
    }

    function clearPageScrollPendingFocus() { state.pageScrollPendingFocus = false; }

    function snapshot() {
      return {
        selectionActive: state.selectionActive,
        primed: state.primed,
        suppressedUntil: state.suppressedUntil,
        wheelNavigationActive: state.wheelNavigationActive,
        pageScrollPendingFocus: state.pageScrollPendingFocus,
        wheelPointerLocked: state.wheelPointerLocked,
        destroyed: state.destroyed
      };
    }

    function destroy() {
      if (state.destroyed) { return; }
      state.destroyed = true;
      if (state.wheelDebounceTimer !== null && platformRoot.clearTimeout) { platformRoot.clearTimeout(state.wheelDebounceTimer); }
      state.wheelDebounceTimer = null;
      clearWheelNavigation();
      if (call(contextMenu.holding) === true) { call(contextMenu.releaseHold); }
      state.selectionActive = false;
      state.pageScrollPendingFocus = false;
      state.currentButton = null;
      state.originTarget = null;
    }

    return {
      clearPageScrollPendingFocus: clearPageScrollPendingFocus,
      clearWheelNavigation: clearWheelNavigation,
      destroy: destroy,
      handleClick: handleClick,
      handleDown: handleDown,
      handleMove: handleMove,
      handleOver: handleOver,
      handleUp: handleUp,
      handleWheel: handleWheel,
      isSelectionActive: function () { return state.selectionActive; },
      isWheelNavigationActive: function () { return state.wheelNavigationActive; },
      seekTimelineFromPointer: seekTimelineFromPointer,
      snapshot: snapshot,
      syncFocus: syncPointerFocus,
      syncPageFocus: syncPageFocus
    };
  }

  return { create: create };
}));
