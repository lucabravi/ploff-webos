(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSettingsFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var statePort = values.state || {};
    var presentation = values.presentation || {};
    var shell = values.shell || {};
    var server = values.server || {};
    var account = values.account || {};
    var dialogs = values.dialogs || {};
    var environment = values.environment || {};
    var transitions = values.transitions || {};
    var document = platform.document || null;
    var controller = null;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function viewNode() {
      return document && document.getElementById ? document.getElementById('app-settings-view') : null;
    }

    function showView() {
      var node = viewNode();
      if (node) { node.className = 'app-settings-view'; }
    }

    function hideView() {
      var node = viewNode();
      if (node) { node.className = 'app-settings-view is-hidden'; }
    }

    function active() { return !destroyed && !!controller; }

    if (!modules.SettingsController || typeof modules.SettingsController.create !== 'function') {
      throw new Error('SettingsFeatureController requires SettingsController');
    }

    controller = modules.SettingsController.create({
      platform: {
        root: platform.root,
        document: document,
        credentialStorage: platform.credentialStorage
      },
      modules: {
        Settings: modules.Settings,
        SettingsCatalog: modules.SettingsCatalog,
        SettingsView: modules.SettingsView,
        I18n: modules.I18n,
        CardLayout: modules.CardLayout,
        VersionSelection: modules.VersionSelection,
        ServerStore: modules.ServerStore,
        ServerDiscovery: modules.ServerDiscovery,
        UpNextLayoutDialog: modules.UpNextLayoutDialog
      },
      presentation: {
        t: presentation.t,
        element: presentation.element,
        setText: presentation.setText,
        clearFocus: presentation.clearFocus,
        pointerActive: presentation.pointerActive
      },
      shell: {
        getSettings: statePort.getSettings,
        setSettings: function (next) {
          call(statePort.setSettings, next);
          call(statePort.publishSettings, next);
          return next;
        },
        navigationIndex: shell.navigationIndex,
        setNavigationIndex: shell.setNavigationIndex,
        navigationCount: shell.navigationCount,
        navigationTarget: shell.navigationTarget,
        renderNavigation: shell.renderNavigation,
        scheduleNavigationPreview: shell.scheduleNavigationPreview,
        activateNavigation: shell.activateNavigation,
        applyCardScale: shell.applyCardScale,
        translateStaticUi: shell.translateStaticUi,
        refreshCardsForCurrentView: shell.refreshCardsForCurrentView,
        clearBackdrop: shell.clearBackdrop,
        applyNavigationVisibility: shell.applyNavigationVisibility,
        markHomeDirty: shell.markHomeDirty,
        enterSettings: function () {
          call(transitions.enter);
          showView();
        },
        leaveSettings: function () {
          hideView();
          call(transitions.leave);
        },
        stopBackgroundAudio: shell.stopBackgroundAudio,
        transitionHome: transitions.home
      },
      server: server,
      account: account,
      dialogs: dialogs,
      environment: environment
    });

    function snapshot() {
      if (!active() || typeof controller.snapshot !== 'function') { return {}; }
      return controller.snapshot() || {};
    }

    function rows() {
      return active() && typeof controller.rows === 'function' ? (controller.rows() || []) : [];
    }

    function orderedLanguages() {
      return active() && typeof controller.orderedLanguages === 'function' ? (controller.orderedLanguages() || []) : [];
    }

    function enter(options) {
      if (!active()) { return false; }
      return controller.enter(options || {});
    }

    function suspend() {
      if (!active()) { return false; }
      hideView();
      return snapshot();
    }

    function resume(options) {
      var list;
      var focusIndex;
      options = options || {};
      if (!active()) { return false; }
      showView();
      call(shell.renderNavigation);
      list = rows();
      if (options.focusLast === true) { focusIndex = Math.max(0, list.length - 1); }
      else if (options.focusIndex !== undefined) { focusIndex = Math.max(0, Number(options.focusIndex) || 0); }
      if (focusIndex !== undefined && typeof controller.focusList === 'function') {
        controller.focusList(focusIndex, list);
      }
      if (typeof controller.render === 'function') { controller.render(); }
      if (typeof controller.focus === 'function') { controller.focus(); }
      return snapshot();
    }

    function leave() {
      if (!active()) { return false; }
      return controller.leave();
    }

    function focusNavigation() {
      if (!active()) { return false; }
      controller.focusNavigation();
      controller.focus();
      return snapshot();
    }

    function focusSetting(index) {
      if (!active()) { return false; }
      controller.focusList(index, rows());
      controller.focus();
      return snapshot();
    }

    function focusLanguage(index) {
      var languages;
      if (!active()) { return false; }
      languages = orderedLanguages();
      controller.focusLanguage(index, languages.length + 1, true);
      return snapshot();
    }

    function focusUpdate(index) {
      if (!active()) { return false; }
      return controller.focusUpdate(index);
    }

    function focusPrivacy(button) {
      if (!active() || !button) { return false; }
      call(presentation.clearFocus);
      button.className = 'privacy-dialog-close is-focused';
      return true;
    }

    function invoke(name, arg1, arg2) {
      if (!active() || typeof controller[name] !== 'function') { return false; }
      return controller[name](arg1, arg2);
    }

    function chooseUpNext(value) {
      if (!active()) { return false; }
      controller.chooseUpNext(value);
      controller.renderUpNext();
      return snapshot();
    }

    function handleUpNextLayoutClick(event) {
      var option = event && event.target;
      var value;
      while (option) {
        value = option.getAttribute && option.getAttribute('data-up-next-layout');
        if (value) { return chooseUpNext(value); }
        if (option.id === 'up-next-layout-dialog') { break; }
        option = option.parentNode;
      }
      return false;
    }

    function cancelUpNext() { return invoke('closeUpNext', false); }
    function applyUpNext() { return invoke('closeUpNext', true); }

    function destroy() {
      if (destroyed) { return; }
      if (controller && typeof controller.destroy === 'function') { controller.destroy(); }
      controller = null;
      hideView();
      destroyed = true;
    }

    return {
      activeVideoQuality: function () { return invoke('activeVideoQuality'); },
      animationDuration: function (milliseconds) { return invoke('interfaceAnimationDuration', milliseconds); },
      applyAccentColor: function () { return invoke('applyAccentColor'); },
      applyAnimationPreference: function () { return invoke('applyAnimationPreference'); },
      applyUpNext: applyUpNext,
      cancelUpNext: cancelUpNext,
      connectionRouteLabel: function (route) { return invoke('connectionRouteLabel', route); },
      destroy: destroy,
      enter: enter,
      focusLanguage: focusLanguage,
      focusNavigation: focusNavigation,
      focusPrivacy: focusPrivacy,
      focusUpdate: focusUpdate,
      focusSetting: focusSetting,
      handleKey: function (event, direction) { return invoke('handleKey', event, direction); },
      handlePrivacyKey: function (event) { return invoke('handlePrivacyKey', event); },
      handleUpNextKey: function (event) { return invoke('handleUpNextKey', event); },
      handleUpNextLayoutClick: handleUpNextLayoutClick,
      keepFocusVisible: function (container, target) { return invoke('keepFocusVisible', container, target); },
      leave: leave,
      networkStatusClass: function (network) { return invoke('networkStatusClass', network); },
      networkStatusLabel: function (network) { return invoke('networkStatusLabel', network); },
      playbackPreferenceLabel: function (value) { return invoke('playbackPreferenceLabel', value); },
      refresh: function () { return invoke('refresh'); },
      resume: resume,
      save: function () { return invoke('save'); },
      setSetupLanguage: function (language, explicit) { return invoke('setSetupLanguage', language, explicit === true); },
      selectAccentColor: function (color) { return invoke('selectAccentColor', color); },
      snapshot: snapshot,
      suspend: suspend,
      videoQualityLabel: function (value) { return invoke('videoQualityLabel', value); }
    };
  }

  return { create: create };
}));
