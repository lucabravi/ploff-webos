(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffInputController = factory(); }
}(this, function () {
  'use strict';

  var DIRECTION_BY_KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

  function create(options) {
    var values = options || {};
    var router = values.InputTargetRouter;
    var overlays = values.overlays || {};
    var domains = values.domains || {};
    var navigation = values.navigation || {};
    var lifecycle = values.lifecycle || {};
    var destroyed = false;

    function call(callback, arg1, arg2, arg3) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3); }
      return undefined;
    }

    function snapshot() {
      return call(values.sessionSnapshot) || {};
    }

    function directionForKey(keyCode) {
      return DIRECTION_BY_KEY[Number(keyCode)] || '';
    }

    function isHandled(result) {
      if (result === true) { return true; }
      return !!(result && result.handled === true);
    }

    function invoke(handler, event, direction) {
      return isHandled(call(handler, event, direction));
    }

    function capture(handler, event, direction) {
      if (typeof handler !== 'function') { return false; }
      prevent(event);
      handler(event, direction);
      return true;
    }

    function prevent(event) {
      if (event && typeof event.preventDefault === 'function') { event.preventDefault(); }
    }

    function isPlayerMediaKey(event, current) {
      var keyCode = Number(event && event.keyCode || 0);
      return current.appView === 'player' && (keyCode === 19 || keyCode === 415);
    }

    function routeMediaKeyDirectly(event, current) {
      var keyCode = Number(event && event.keyCode || 0);
      return isPlayerMediaKey(event, current) && (keyCode === 19 || !current.playerUpNextOpen);
    }

    function handleOverlay(event, direction, current) {
      if (current.choiceDialogOpen) { return capture(overlays.choiceDialog, event, direction); }
      if (current.upNextLayoutOpen) { return capture(overlays.upNextLayout, event, direction); }
      if (current.privacyDialogOpen) { return capture(overlays.privacy, event, direction); }
      if (current.viewStateOpen) { return capture(overlays.viewState, event, direction); }
      if (current.appView !== 'player') { return false; }
      if (current.queueGapOpen) { return capture(overlays.queueGap, event, direction); }
      if (current.playerMediaInfoOpen) { return capture(overlays.playerMediaInfo, event, direction); }
      if (current.resumeChoiceOpen) { return capture(overlays.resumeChoice, event, direction); }
      if (current.playerErrorOpen) { return capture(overlays.playerError, event, direction); }
      if (current.subtitleEditorOpen) { return capture(overlays.subtitleEditor, event, direction); }
      return false;
    }

    function handleNavigationReorder(event, direction, current) {
      prevent(event);
      if (direction === 'left') { call(navigation.moveReorderedLibrary, -1); }
      else if (direction === 'right') { call(navigation.moveReorderedLibrary, 1); }
      else if (event && (event.keyCode === 27 || event.keyCode === 461)) { call(navigation.finishReorder, false); }
      else if (event && event.keyCode === 13 && current.navReorderReady) { call(navigation.finishReorder, true); }
      return true;
    }

    function routeTarget(event, direction, current, target) {
      if (target === 'navigation-reorder') { return handleNavigationReorder(event, direction, current); }
      if (target === 'player') {
        prevent(event);
        if (routeMediaKeyDirectly(event, current)) {
          return invoke(domains.playerControls, event, direction);
        }
        if (invoke(domains.playerQueue, event, direction)) { return true; }
        return invoke(domains.playerControls, event, direction);
      }
      if (target === 'setup') { return invoke(domains.setup, event, direction); }
      if (target === 'diagnostics') { return invoke(domains.diagnostics, event, direction); }
      if (target === 'settings') { return invoke(domains.settings, event, direction); }
      if (target === 'detail') {
        if (invoke(domains.detail, event, direction)) { prevent(event); return true; }
        return false;
      }
      if (target === 'library') {
        call(lifecycle.clearWheelNavigation);
        return invoke(domains.library, event, direction);
      }
      if (target === 'watchlist') { return invoke(domains.watchlist, event, direction); }
      if (target === 'search') { return invoke(domains.search, event, direction); }
      return invoke(domains.home, event, direction);
    }

    function handleKeyDown(event) {
      var current;
      var direction;
      var target;
      if (destroyed) { return false; }
      current = snapshot();
      direction = directionForKey(event && event.keyCode);
      if (direction && current.pageScrollPendingFocus) {
        call(lifecycle.syncPageScrollFocus);
        call(lifecycle.clearPageScrollPendingFocus);
      }
      if (handleOverlay(event, direction, current)) { return true; }
      if (direction === 'down' && current.navigationHasFocus && current.navigationContentEntryFocused) {
        prevent(event);
        call(navigation.enterActiveView);
        return true;
      }
      if (!(current.appView === 'home' && direction) &&
          !isPlayerMediaKey(event, current) &&
          invoke(domains.queueCapture, event, direction)) { return true; }
      target = router && typeof router.resolve === 'function' ? router.resolve({
        choiceDialogOpen: current.choiceDialogOpen,
        upNextLayoutOpen: current.upNextLayoutOpen,
        privacyDialogOpen: current.privacyDialogOpen,
        appView: current.appView,
        navReorderActive: current.navReorderActive
      }) : (current.navReorderActive ? 'navigation-reorder' : (current.appView || 'home'));
      return routeTarget(event, direction, current, target);
    }

    function handleKeyUp(event) {
      var current;
      var keyCode;
      if (destroyed) { return false; }
      current = snapshot();
      keyCode = Number(event && event.keyCode || 0);
      if (keyCode === 37 || keyCode === 39) { call(domains.resetSeekRepeat); }
      if (keyCode !== 13 || !current.navigationHasFocus) { return false; }
      if (current.navHoldTriggered && current.navReorderMode) {
        call(navigation.markReorderReady);
        return true;
      }
      if (current.navHoldActive) {
        call(navigation.cancelHold);
        call(navigation.enterActiveView);
        return true;
      }
      return false;
    }

    function destroy() {
      destroyed = true;
    }

    return {
      destroy: destroy,
      directionForKey: directionForKey,
      handleKeyDown: handleKeyDown,
      handleKeyUp: handleKeyUp,
      snapshot: function () { return { destroyed: destroyed }; }
    };
  }

  return { create: create };
}));
