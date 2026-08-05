(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSetupFeatureController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var presentation = values.presentation || {};
    var state = values.state || {};
    var settings = values.settings || {};
    var language = values.language || {};
    var server = values.server || {};
    var account = values.account || {};
    var transitions = values.transitions || {};
    var root = platform.root || {};
    var document = platform.document;
    var destroyed = false;
    var loginPin = null;
    var authStatusKey = '';
    var discoveryActive = false;
    var entryGeneration = 0;
    var controller;
    var view;
    var focus;
    var scanIndicator;
    var authSession;

    function handled(value) { return { handled: value !== false }; }
    function call(callback, _arg1, _arg2, _arg3, _arg4, _arg5) {
      if (typeof callback === 'function') {
        return callback.apply(null, Array.prototype.slice.call(arguments, 1));
      }
      return undefined;
    }
    function isActive() { return !destroyed && call(state.isActive) === true; }
    function buttons() {
      return document && document.querySelectorAll ? document.querySelectorAll('#setup-view button') : [];
    }
    function surface() {
      return document && document.getElementById ? document.getElementById('setup-view') : null;
    }
    function showSurface() {
      var node = surface();
      if (node) { node.className = 'setup-view'; }
      call(transitions.show);
    }
    function hideSurface() {
      var node = surface();
      if (node) { node.className = 'setup-view is-hidden'; }
    }
    function presentationState(snapshot) {
      var result = call(presentation.snapshot, snapshot) || {};
      var current = currentSettings();
      var auth = authSnapshot();
      if (result.activeLanguage === undefined) { result.activeLanguage = current.uiLanguage || ''; }
      if (result.activeProfileId === undefined) { result.activeProfileId = auth.activeProfileId || ''; }
      if (result.ownerToken === undefined) { result.ownerToken = call(account.ownerToken) || auth.ownerToken || ''; }
      if (result.manualAddress === undefined) { result.manualAddress = call(server.apiBaseUrl) || ''; }
      if (result.returnView === undefined) { result.returnView = snapshot.returnView || ''; }
      result.loginPin = loginPin;
      result.statusKey = authStatusKey || snapshot.statusKey || result.statusKey || '';
      result.serverDiscoveryActive = discoveryActive;
      return result;
    }

    if (!modules.SetupController || typeof modules.SetupController.create !== 'function') {
      throw new Error('SetupFeatureController requires SetupController');
    }

    scanIndicator = modules.SetupScanIndicator.create({
      root: root,
      shouldContinue: function () {
        var snapshot = controller ? controller.snapshot() : { stage: '', servers: [] };
        return isActive() && snapshot.stage === 'servers' && discoveryActive && !snapshot.servers.length;
      },
      message: function (count) {
        call(presentation.setText, 'setup-message', call(presentation.t, 'setup.findServerMessage') + ' ' + new Array(count + 1).join('.'));
      }
    });

    focus = modules.SetupFocus.create({
      buttons: buttons,
      isPointerSelectionActive: function () { return call(presentation.pointerActive) === true; }
    });

    view = modules.SetupView.create({
      root: root,
      document: document,
      element: presentation.element,
      setText: presentation.setText,
      t: presentation.t,
      languages: language.available || [],
      presentation: presentationState,
      focus: function (index) { focus.apply(index); },
      scanIndicator: scanIndicator
    });

    authSession = modules.SetupAuthSession.create({
      root: root,
      createPin: account.createPin,
      pollPin: account.pollPin,
      onState: function (snapshot) {
        var current;
        if (destroyed) { return; }
        loginPin = snapshot.pin;
        if (snapshot.phase === 'idle') {
          authStatusKey = '';
          return;
        }
        if (!isActive() || !controller || controller.snapshot().stage !== 'login') { return; }
        if (snapshot.phase === 'expired') { authStatusKey = 'setup.loginExpired'; }
        else if (snapshot.phase === 'error') { authStatusKey = 'setup.loginUnavailable'; }
        else { authStatusKey = 'setup.loginWaiting'; }
        current = controller.snapshot();
        view.render(current);
      },
      onAuthenticated: function (result) {
        if (!isActive() || !controller || controller.snapshot().stage !== 'login' || !result || !result.token) { return; }
        controller.activate('login-authenticated', result);
      }
    });

    function render(snapshot) {
      if (destroyed) { return; }
      authStatusKey = snapshot.stage === 'login' ? (snapshot.statusKey || authStatusKey) : '';
      if (isActive()) { view.render(snapshot); }
      call(transitions.onState, snapshot);
    }

    function scan(snapshot, callback) {
      var request;
      discoveryActive = true;
      if (snapshot.stage === 'servers' && !snapshot.servers.length) { scanIndicator.start(); }
      request = call(server.scan, snapshot, function (error, servers) {
        if (destroyed) { return; }
        discoveryActive = false;
        scanIndicator.stop();
        callback(error, servers);
      });
      return request || null;
    }

    function finish(snapshot) {
      authSession.cancel();
      loginPin = null;
      authStatusKey = '';
      hideSurface();
      call(transitions.finish, snapshot);
    }

    function cancel(snapshot) {
      authSession.cancel();
      loginPin = null;
      authStatusKey = '';
      if (!snapshot.returnView) { controller.activate('servers'); return; }
      hideSurface();
      call(transitions.cancel, snapshot);
    }

    controller = modules.SetupController.create({
      root: root,
      authSession: authSession,
      render: render,
      scan: scan,
      selectLanguage: language.select,
      normalizeManualAddress: server.normalizeManualAddress,
      probeManualAddress: server.probeManualAddress,
      shouldOfferConnection: server.shouldOfferConnection,
      selectServerConnection: server.selectConnection,
      loadAccountServers: account.loadAccountServers,
      loadProfiles: account.loadProfiles,
      switchProfile: account.switchProfile,
      continueOffline: account.continueOffline,
      disconnect: account.disconnect,
      finish: finish,
      cancel: cancel
    });

    function currentSettings() { return call(settings.get) || {}; }
    function authSnapshot() { return call(account.authSnapshot) || {}; }
    function accountProfiles() {
      var list = call(account.profiles);
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    }
    function serverList() {
      var list = call(server.servers);
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    }
    function languageIndex(code) {
      var index;
      for (index = 0; index < (language.available || []).length; index += 1) {
        if (String(language.available[index].code || '') === String(code || '')) { return index; }
      }
      return 0;
    }
    function profileIndex(profiles, activeProfileId) {
      var index;
      for (index = 0; index < profiles.length; index += 1) {
        if (String(profiles[index].id || '') === String(activeProfileId || '')) { return index; }
      }
      return 0;
    }
    function activateEntry(kind) { call(transitions.activate, kind); }
    function openFirstRun() {
      var token = entryGeneration + 1;
      var auth = authSnapshot();
      var current = currentSettings();
      var supported = (language.available || []).map(function (item) { return item.code; });
      function openWithLanguage(detected) {
        var selected;
        if (destroyed || token !== entryGeneration) { return controller.snapshot(); }
        selected = String(detected || current.uiLanguage || '');
        if (!current.uiLanguageExplicit && selected && selected !== current.uiLanguage) {
          call(settings.setSetupLanguage, selected, false);
          current = currentSettings();
        }
        activateEntry('first-run');
        enter({
          firstRun: !auth.setupComplete,
          prefetchScan: !auth.setupComplete,
          languageExplicit: current.uiLanguageExplicit,
          language: current.uiLanguage || selected,
          servers: serverList(),
          profiles: accountProfiles(),
          selectedServer: null,
          focusIndex: languageIndex(current.uiLanguage || selected),
          returnView: ''
        });
        call(transitions.completeStartup);
        return controller.snapshot();
      }
      entryGeneration = token;
      if (auth.setupComplete || current.uiLanguageExplicit || typeof language.detect !== 'function') {
        return openWithLanguage(current.uiLanguage);
      }
      call(language.detect, supported, openWithLanguage);
      return controller.snapshot();
    }
    function openProfiles(returnView) {
      var auth = authSnapshot();
      var profiles = accountProfiles();
      var ownerToken = String(call(account.ownerToken) || auth.ownerToken || '');
      var active = call(server.active) || null;
      var apiBaseUrl = String(call(server.apiBaseUrl) || active && active.uri || '');
      activateEntry('profiles');
      enter({
        stage: ownerToken || profiles.length ? 'profiles' : 'access',
        scan: false,
        languageExplicit: true,
        language: currentSettings().uiLanguage,
        servers: serverList(),
        profiles: profiles,
        selectedServer: active,
        preferredConnectionUri: apiBaseUrl,
        focusIndex: profileIndex(profiles, auth.activeProfileId),
        returnView: String(returnView || '')
      });
      if (ownerToken) { activate('load-profiles', { token: ownerToken }); }
      return controller.snapshot();
    }
    function openManual(returnView) {
      var active = call(server.active) || null;
      activateEntry('manual');
      enter({
        stage: 'manual',
        scan: false,
        languageExplicit: true,
        language: currentSettings().uiLanguage,
        servers: serverList(),
        profiles: accountProfiles(),
        selectedServer: active,
        preferredConnectionUri: String(call(server.apiBaseUrl) || active && active.uri || ''),
        returnView: String(returnView || '')
      });
      return controller.snapshot();
    }

    function enter(openOptions) {
      if (destroyed) { return controller.snapshot(); }
      entryGeneration += 1;
      loginPin = null;
      authStatusKey = '';
      showSurface();
      return controller.open(openOptions || {});
    }

    function activate(action, payload) {
      if (destroyed) { return controller.snapshot(); }
      return controller.activate(action, payload);
    }

    function activateButton(button) {
      var index;
      var snapshot;
      if (!button || destroyed) { return false; }
      if (button.hasAttribute('data-setup-language')) {
        index = Number(button.getAttribute('data-setup-language'));
        if (language.available && language.available[index]) { activate('language', language.available[index].code); }
        return true;
      }
      if (button.hasAttribute('data-setup-action')) {
        activate(String(button.getAttribute('data-setup-action') || ''),
          button.getAttribute('data-setup-action') === 'connect-manual' ? { address: document.getElementById('setup-address').value } :
            ((button.getAttribute('data-setup-action') === 'account-servers' || button.getAttribute('data-setup-action') === 'load-profiles') ? { token: call(account.ownerToken) } : null));
        return true;
      }
      snapshot = controller.snapshot();
      if (button.hasAttribute('data-setup-server')) {
        index = Number(button.getAttribute('data-setup-server'));
        activate('select-server', index);
        return true;
      }
      if (button.hasAttribute('data-setup-profile')) {
        index = Number(button.getAttribute('data-setup-profile'));
        if (snapshot.profiles[index]) { activate('select-profile', index); }
        return true;
      }
      return false;
    }

    function handleKey(event) {
      var list;
      if (destroyed) { return handled(false); }
      list = buttons();
      var active = document && document.activeElement;
      var keyCode = Number(event && event.keyCode);
      var snapshot = controller.snapshot();
      if (keyCode === 27 || keyCode === 461) {
        if (event && event.preventDefault) { event.preventDefault(); }
        controller.back();
        return handled(true);
      }
      if (snapshot.stage === 'profile-pin') {
        if (keyCode === 8) {
          if (event && event.preventDefault) { event.preventDefault(); }
          controller.backspace();
          return handled(true);
        }
        if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
          if (event && event.preventDefault) { event.preventDefault(); }
          controller.inputDigit(keyCode);
          return handled(true);
        }
        if (keyCode === 13 && active && active.id === 'setup-address') {
          if (event && event.preventDefault) { event.preventDefault(); }
          controller.activate('unlock-profile');
          return handled(true);
        }
      }
      if (active && active.id === 'setup-address') {
        if (keyCode === 13) {
          if (event && event.preventDefault) { event.preventDefault(); }
          if (snapshot.stage === 'manual') { controller.activate('connect-manual', { address: active.value }); }
          return handled(true);
        }
        if ((keyCode === 38 || keyCode === 40) && list.length) {
          if (event && event.preventDefault) { event.preventDefault(); }
          controller.setFocus(0, list.length);
          return handled(true);
        }
        return handled(false);
      }
      if (!list.length) { return handled(false); }
      if (keyCode === 38 || keyCode === 37) { controller.moveFocus(-1, list.length); }
      else if (keyCode === 40 || keyCode === 39) { controller.moveFocus(1, list.length); }
      else if (keyCode === 13 && list[controller.snapshot().focusIndex]) { activateButton(list[controller.snapshot().focusIndex]); }
      else { return handled(false); }
      if (event && event.preventDefault) { event.preventDefault(); }
      return handled(true);
    }

    function focusButton(button) {
      var list = buttons();
      var index;
      for (index = 0; index < list.length; index += 1) {
        if (list[index] === button) {
          controller.setFocus(index, list.length, false);
          focus.apply(index);
          return true;
        }
      }
      return false;
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      entryGeneration += 1;
      discoveryActive = false;
      scanIndicator.stop();
      authSession.cancel();
      controller.destroy();
      if (view && view.destroy) { view.destroy(); }
      loginPin = null;
      authStatusKey = '';
    }

    return {
      destroy: destroy,
      handleKey: handleKey,
      openFirstRun: openFirstRun,
      openManual: openManual,
      openProfiles: openProfiles,
      focusButton: focusButton,
      snapshot: function () { return controller.snapshot(); }
    };
  }

  return { create: create };
}));
