(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffMediaContextController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platformRoot = values.root || {};
    var holdDelay = Math.max(250, Number(values.holdDelay || 800));
    var holdTimer = null;
    var holdTarget = null;
    var holdTriggered = false;
    var activeRequest = null;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3); }
      return undefined;
    }

    function abortRequest() {
      if (activeRequest && activeRequest.abort) { activeRequest.abort(); }
      activeRequest = null;
    }

    function supported(item) {
      var type = String(item && item.type || '');
      return !!(item && item.ratingKey && (type === 'movie' || type === 'episode'));
    }

    function progress(item) {
      return Math.max(0, Number(item && item.viewOffset || 0));
    }

    function choicesFor(target) {
      var item = target && target.item;
      var choices = [];
      if (!supported(item)) { return choices; }
      choices.push({
        label: call(values.t, item.viewed ? 'detail.markUnwatched' : 'detail.markWatched'),
        value: item.viewed ? 'mark-unwatched' : 'mark-watched'
      });
      if (progress(item) > 0) {
        choices.push({ label: call(values.t, 'mediaActions.clearProgress'), value: 'clear-progress' });
        choices.push({ label: call(values.t, 'player.playFromBeginning'), value: 'play-beginning' });
      }
      if (target.inContinueWatching === true) {
        choices.push({ label: call(values.t, 'mediaActions.removeContinue'), value: 'remove-continue' });
      }
      return choices;
    }

    function currentTarget() {
      return call(values.resolveTarget) || null;
    }

    function canOpen() {
      var target = currentTarget();
      return !!(target && choicesFor(target).length);
    }

    function finishMutation(error, target, callback) {
      activeRequest = null;
      if (destroyed) { return; }
      if (error) {
        call(values.showMessage, call(values.t, 'mediaActions.error'));
        call(callback, error, target);
        return;
      }
      call(values.refresh, target);
      call(values.showMessage, call(values.t, 'mediaActions.updated'));
      call(callback, null, target);
    }

    function mutate(target, action, callback) {
      var item = target && target.item;
      var client = values.PlexClient;
      if (!supported(item) || !client) { return false; }
      abortRequest();
      if (action === 'mark-watched' || action === 'mark-unwatched') {
        if (typeof client.setWatchedAndReset !== 'function') { return false; }
        activeRequest = client.setWatchedAndReset(values.config || {}, item.ratingKey, action === 'mark-watched', function (error) {
          finishMutation(error, target, callback);
        });
        return true;
      }
      if (action === 'clear-progress') {
        if (typeof client.resetProgress !== 'function') { return false; }
        activeRequest = client.resetProgress(values.config || {}, item.ratingKey, function (error) {
          finishMutation(error, target, callback);
        });
        return true;
      }
      if (action === 'remove-continue') {
        if (typeof client.removeFromContinueWatching !== 'function') { return false; }
        activeRequest = client.removeFromContinueWatching(values.config || {}, item.ratingKey, function (error) {
          finishMutation(error, target, callback);
        });
        return true;
      }
      return false;
    }

    function applyChoice(choice, target) {
      var action = String(choice && choice.value || '');
      if (destroyed || !target || !action) { return false; }
      if (action === 'play-beginning') {
        call(values.playFromBeginning, target.item);
        return true;
      }
      return mutate(target, action);
    }

    function removeFromContinueWatching(target, callback) {
      if (destroyed || !target || target.inContinueWatching !== true) { return false; }
      return mutate(target, 'remove-continue', callback);
    }

    function open(target) {
      var item;
      var choices;
      if (destroyed) { return false; }
      target = target || currentTarget();
      item = target && target.item;
      choices = choicesFor(target);
      if (!item || !choices.length) { return false; }
      return call(values.openChoice, {
        title: call(values.t, 'mediaActions.title', { title: call(values.mediaTitle, item) }),
        choices: choices,
        selectedValue: '',
        variant: 'media-context',
        apply: function (choice) { applyChoice(choice, target); },
        returnFocus: function () { call(values.restoreFocus, target); }
      }) !== false;
    }

    function cancelHold() {
      if (holdTimer !== null && platformRoot.clearTimeout) { platformRoot.clearTimeout(holdTimer); }
      holdTimer = null;
      holdTarget = null;
      holdTriggered = false;
      return true;
    }

    function startHold() {
      var target;
      if (destroyed) { return false; }
      if (holdTimer !== null || holdTarget) { return true; }
      target = currentTarget();
      if (!target || !choicesFor(target).length || !platformRoot.setTimeout) { return false; }
      holdTarget = target;
      holdTriggered = false;
      holdTimer = platformRoot.setTimeout(function () {
        var targetAtTrigger = holdTarget;
        holdTimer = null;
        if (destroyed || !targetAtTrigger) { return; }
        holdTriggered = open(targetAtTrigger);
      }, holdDelay);
      return true;
    }

    function releaseHold() {
      var triggered = holdTriggered;
      if (holdTimer !== null && platformRoot.clearTimeout) { platformRoot.clearTimeout(holdTimer); }
      holdTimer = null;
      holdTarget = null;
      holdTriggered = false;
      return triggered;
    }

    function holding() {
      return holdTimer !== null || !!holdTarget;
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelHold();
      abortRequest();
    }

    return {
      canOpen: canOpen,
      choicesFor: choicesFor,
      destroy: destroy,
      holding: holding,
      open: open,
      removeFromContinueWatching: removeFromContinueWatching,
      releaseHold: releaseHold,
      startHold: startHold
    };
  }

  return { create: create };
}));
