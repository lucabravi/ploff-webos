(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupController = factory(); }
}(this, function () {
  'use strict';

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function copyObject(value) {
    var result = {};
    var key;
    value = value || {};
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) { result[key] = value[key]; }
    }
    return result;
  }

  function copyList(values) {
    return array(values).map(function (value) { return copyObject(value); });
  }

  function sameServer(left, right) {
    if (!left || !right) { return false; }
    if (left.machineIdentifier && right.machineIdentifier) {
      return String(left.machineIdentifier) === String(right.machineIdentifier);
    }
    return String(left.uri || '') === String(right.uri || '');
  }

  function mergeServers(current, incoming) {
    var result = copyList(current);
    var additions = array(incoming);
    var index;
    var existing;
    for (index = 0; index < additions.length; index += 1) {
      if (!additions[index]) { continue; }
      existing = result.filter(function (server) { return sameServer(server, additions[index]); })[0];
      if (existing) {
        Object.keys(additions[index]).forEach(function (key) { existing[key] = additions[index][key]; });
      } else {
        result.push(copyObject(additions[index]));
      }
    }
    return result;
  }

  function create(options) {
    var values = options || {};
    var generation = 0;
    var requestGeneration = 0;
    var destroyed = false;
    var pending = {};
    var state = {
      stage: 'language',
      focusIndex: 0,
      selectedServer: null,
      preferredConnectionUri: '',
      enteredConnectionUri: '',
      profiles: [],
      selectedProfile: null,
      statusKey: '',
      returnView: '',
      profileBusy: false,
      loginPurpose: '',
      servers: [],
      selectedLanguage: '',
      languageSelectable: false,
      profilePin: ''
    };

    function snapshot() {
      return {
        stage: state.stage,
        focusIndex: state.focusIndex,
        selectedServer: state.selectedServer ? copyObject(state.selectedServer) : null,
        preferredConnectionUri: state.preferredConnectionUri,
        enteredConnectionUri: state.enteredConnectionUri,
        profiles: copyList(state.profiles),
        selectedProfile: state.selectedProfile ? copyObject(state.selectedProfile) : null,
        statusKey: state.statusKey,
        returnView: state.returnView,
        profileBusy: state.profileBusy,
        loginPurpose: state.loginPurpose,
        servers: copyList(state.servers),
        selectedLanguage: state.selectedLanguage,
        profilePinLength: state.profilePin.length,
        destroyed: destroyed
      };
    }

    function publish() {
      if (values.render) { values.render(snapshot()); }
    }

    function abortRequest(name) {
      if (pending[name] && pending[name].abort) { pending[name].abort(); }
      delete pending[name];
    }

    function cancelSessions() {
      if (values.serverSession && values.serverSession.cancel) { values.serverSession.cancel(); }
      if (values.authSession && values.authSession.cancel) { values.authSession.cancel(); }
    }

    function invalidate() {
      var name;
      generation += 1;
      for (name in pending) {
        if (Object.prototype.hasOwnProperty.call(pending, name)) { abortRequest(name); }
      }
      cancelSessions();
    }

    function token(name) {
      requestGeneration += 1;
      abortRequest(name);
      return { generation: generation, request: requestGeneration };
    }

    function reserveRequest(name, requestToken) {
      pending[name] = { request: requestToken.request, abort: null };
    }

    function retainRequest(name, requestToken, request) {
      if (current(requestToken, name)) {
        pending[name].abort = request && request.abort ? function () { request.abort(); } : null;
      } else if (request && request.abort) {
        request.abort();
      }
    }

    function current(requestToken, name) {
      return !destroyed && requestToken.generation === generation && pending[name] && pending[name].request === requestToken.request;
    }

    function setStage(stage, statusKey, focusIndex) {
      state.stage = stage;
      state.focusIndex = typeof focusIndex === 'number' ? Math.max(0, focusIndex) : 0;
      if (typeof statusKey === 'string') { state.statusKey = statusKey; }
      publish();
    }

    function serverFor(value) {
      var candidate = value || {};
      var index;
      for (index = 0; index < state.servers.length; index += 1) {
        if (sameServer(state.servers[index], candidate)) { return state.servers[index]; }
      }
      return candidate;
    }

    function beginScan() {
      var requestToken;
      if (destroyed || !values.scan) { return; }
      requestToken = token('scan');
      reserveRequest('scan', requestToken);
      state.stage = 'servers';
      state.statusKey = '';
      publish();
      retainRequest('scan', requestToken, values.scan(snapshot(), function (error, servers) {
        if (array(error) && typeof servers === 'undefined') { servers = error; error = null; }
        if (!current(requestToken, 'scan')) { return; }
        delete pending.scan;
        if (error) { state.statusKey = 'setup.noServers'; publish(); return; }
        state.servers = mergeServers(state.servers, servers);
        state.statusKey = state.servers.length ? '' : 'setup.noServers';
        publish();
      }));
    }

    function chooseConnection(uri) {
      var selected = state.selectedServer;
      state.preferredConnectionUri = String(uri || (selected && selected.uri) || '');
      if (values.selectServerConnection) { values.selectServerConnection(selected ? copyObject(selected) : null, state.preferredConnectionUri, snapshot()); }
      setStage('access', '');
    }

    function requestManualProbe(payload) {
      var address = payload && typeof payload === 'object' ? payload.address : payload;
      var uri = values.normalizeManualAddress ? values.normalizeManualAddress(address) : String(address || '');
      var requestToken;
      if (!uri) { state.statusKey = 'setup.invalidAddress'; publish(); return; }
      if (!values.probeManualAddress) { state.statusKey = 'setup.serverUnavailable'; publish(); return; }
      requestToken = token('manualProbe');
      reserveRequest('manualProbe', requestToken);
      state.statusKey = 'setup.findServerMessage';
      publish();
      retainRequest('manualProbe', requestToken, values.probeManualAddress(uri, function (error, server) {
        var selected;
        var offerChoice;
        if (!current(requestToken, 'manualProbe')) { return; }
        delete pending.manualProbe;
        if (error || !server) { state.statusKey = 'setup.serverUnavailable'; publish(); return; }
        selected = serverFor(server);
        state.servers = mergeServers(state.servers, [server]);
        state.selectedServer = copyObject(selected);
        state.enteredConnectionUri = String(server.uri || uri);
        offerChoice = values.shouldOfferConnection && values.shouldOfferConnection(
          state.selectedServer.uri,
          state.enteredConnectionUri,
          snapshot()
        );
        if (offerChoice) { setStage('connection-choice', ''); }
        else { chooseConnection(state.enteredConnectionUri); }
      }));
    }

    function loadAccountServers(ownerToken) {
      var requestToken;
      if (!values.loadAccountServers) { return; }
      requestToken = token('accountServers');
      reserveRequest('accountServers', requestToken);
      state.stage = 'servers';
      state.statusKey = 'setup.accountServersLoading';
      publish();
      retainRequest('accountServers', requestToken, values.loadAccountServers(ownerToken, function (error, servers) {
        if (!current(requestToken, 'accountServers')) { return; }
        delete pending.accountServers;
        if (error) { state.statusKey = 'setup.accountServersUnavailable'; publish(); return; }
        state.servers = mergeServers(state.servers, servers);
        state.statusKey = state.servers.length ? 'setup.accountServersFound' : 'setup.noAccountServers';
        publish();
      }));
    }

    function loadProfiles(ownerToken) {
      var requestToken;
      if (!values.loadProfiles) { setStage('profiles', ''); return; }
      requestToken = token('profiles');
      reserveRequest('profiles', requestToken);
      state.stage = 'profiles';
      state.profileBusy = false;
      state.statusKey = 'setup.loginWaiting';
      publish();
      retainRequest('profiles', requestToken, values.loadProfiles(ownerToken, function (error, profiles) {
        var previousProfileCount;
        var previousFocus;
        if (!current(requestToken, 'profiles')) { return; }
        delete pending.profiles;
        previousProfileCount = state.profiles.length;
        previousFocus = state.focusIndex;
        state.profiles = error ? [] : copyList(profiles);
        if (previousFocus >= previousProfileCount) {
          state.focusIndex = state.profiles.length + (previousFocus - previousProfileCount);
        } else {
          state.focusIndex = Math.min(previousFocus, Math.max(0, state.profiles.length - 1));
        }
        state.statusKey = error ? 'setup.profileUnavailable' : '';
        publish();
      }));
    }

    function routeAuthenticated(result, purpose) {
      var auth = result || {};
      if (!auth.token) { state.statusKey = 'setup.loginUnavailable'; publish(); return; }
      if (purpose === 'servers') { loadAccountServers(auth.token); }
      else { loadProfiles(auth.token); }
    }

    function beginLogin(purpose) {
      var requestToken = token('login');
      reserveRequest('login', requestToken);
      state.loginPurpose = purpose;
      state.statusKey = 'setup.loginWaiting';
      setStage('login', state.statusKey);
      if (values.beginLogin) {
        retainRequest('login', requestToken, values.beginLogin(purpose, function (error, result) {
          if (!current(requestToken, 'login')) { return; }
          delete pending.login;
          if (error) { state.statusKey = 'setup.loginUnavailable'; publish(); return; }
          routeAuthenticated(result, purpose);
        }));
      } else if (values.authSession && values.authSession.begin) {
        delete pending.login;
        values.authSession.begin(purpose);
      }
    }

    function finishSetup() {
      state.profileBusy = false;
      state.statusKey = '';
      if (values.finish) { values.finish(snapshot()); }
      publish();
    }

    function switchProfile(profile, pin) {
      var requestToken;
      if (!profile || state.profileBusy) { return; }
      if (profile.protected && typeof pin !== 'string') {
        state.selectedProfile = copyObject(profile);
        state.profilePin = '';
        setStage('profile-pin', '');
        return;
      }
      if (!values.switchProfile) { return; }
      requestToken = token('profileSwitch');
      reserveRequest('profileSwitch', requestToken);
      state.selectedProfile = copyObject(profile);
      state.profileBusy = true;
      state.statusKey = 'setup.profileConnecting';
      publish();
      retainRequest('profileSwitch', requestToken, values.switchProfile(copyObject(profile), String(pin || ''), function (error, result) {
        if (!current(requestToken, 'profileSwitch')) { return; }
        delete pending.profileSwitch;
        state.profileBusy = false;
        if (error || !result) {
          state.statusKey = 'setup.pinIncorrect';
          state.profilePin = '';
          setStage(profile.protected ? 'profile-pin' : 'profiles', state.statusKey);
          return;
        }
        state.selectedProfile = copyObject(result);
        finishSetup();
      }));
    }

    function open(openOptions) {
      var next = openOptions || {};
      invalidate();
      destroyed = false;
      state.focusIndex = 0;
      state.selectedServer = next.selectedServer ? copyObject(next.selectedServer) : null;
      state.preferredConnectionUri = String(next.preferredConnectionUri || '');
      state.enteredConnectionUri = '';
      state.profiles = copyList(next.profiles);
      state.selectedProfile = null;
      state.statusKey = '';
      state.returnView = String(next.returnView || '');
      state.profileBusy = false;
      state.loginPurpose = '';
      state.servers = copyList(next.servers);
      state.selectedLanguage = String(next.language || '');
      state.languageSelectable = next.firstRun === true || next.languageExplicit === false;
      state.profilePin = '';
      if (next.stage) {
        setStage(String(next.stage), '', Number(next.focusIndex) || 0);
        if (next.stage === 'servers' && next.scan !== false) { beginScan(); }
      } else if (state.languageSelectable) { setStage('language', '', Number(next.focusIndex) || 0); }
      else { setStage('servers', ''); beginScan(); }
      return snapshot();
    }

    function activate(action, payload) {
      var selected;
      var profile;
      if (destroyed) { return snapshot(); }
      if (action === 'language') {
        state.selectedLanguage = String(payload || '');
        if (values.selectLanguage) { values.selectLanguage(state.selectedLanguage, snapshot()); }
        state.languageSelectable = false;
        setStage('servers', '');
        beginScan();
      } else if (action === 'scan') { beginScan(); }
      else if (action === 'servers') { setStage('servers', ''); }
      else if (action === 'manual') { setStage('manual', ''); }
      else if (action === 'connect-manual') { requestManualProbe(payload); }
      else if (action === 'select-server' || action === 'server') {
        selected = typeof payload === 'number' ? state.servers[payload] : payload;
        if (selected) {
          state.selectedServer = copyObject(serverFor(selected));
          state.preferredConnectionUri = state.selectedServer.uri || '';
          state.enteredConnectionUri = '';
          setStage('access', '');
        }
      } else if (action === 'use-local-connection') { chooseConnection(state.selectedServer && state.selectedServer.uri); }
      else if (action === 'use-entered-connection') { chooseConnection(state.enteredConnectionUri); }
      else if (action === 'access') { setStage('access', ''); }
      else if (action === 'offline') {
        if (values.continueOffline) { values.continueOffline(snapshot()); }
        finishSetup();
      } else if (action === 'disconnect') {
        if (values.disconnect) { values.disconnect(snapshot()); }
        state.profiles = [];
        state.selectedProfile = null;
        finishSetup();
      } else if (action === 'login') { beginLogin('profiles'); }
      else if (action === 'login-servers') { beginLogin('servers'); }
      else if (action === 'login-authenticated') { routeAuthenticated(payload, state.loginPurpose); }
      else if (action === 'account-servers') { loadAccountServers(payload && payload.token); }
      else if (action === 'load-profiles') { loadProfiles(payload && payload.token); }
      else if (action === 'profiles') { setStage('profiles', ''); }
      else if (action === 'select-profile' || action === 'profile') {
        profile = typeof payload === 'number' ? state.profiles[payload] : payload;
        switchProfile(profile, null);
      } else if (action === 'unlock-profile') {
        switchProfile(state.selectedProfile, payload && typeof payload.pin === 'string' ? payload.pin : state.profilePin);
      }
      else if (action === 'cancel') { cancel(); }
      return snapshot();
    }

    function back() {
      var nextStage;
      if (destroyed) { return snapshot(); }
      invalidate();
      if (state.returnView) { cancel(); return snapshot(); }
      if (state.stage === 'manual' || state.stage === 'access') { nextStage = 'servers'; }
      else if (state.stage === 'connection-choice') { nextStage = 'manual'; }
      else if (state.stage === 'login') { nextStage = state.loginPurpose === 'servers' ? 'servers' : 'access'; }
      else if (state.stage === 'profiles') { nextStage = 'access'; }
      else if (state.stage === 'profile-pin') { nextStage = 'profiles'; }
      else if (state.stage === 'servers' && state.languageSelectable) { nextStage = 'language'; }
      else if (state.stage === 'language') { cancel(); return snapshot(); }
      else { nextStage = 'servers'; }
      state.profileBusy = false;
      if (state.stage === 'profile-pin') { state.profilePin = ''; }
      state.statusKey = '';
      setStage(nextStage, '');
      return snapshot();
    }

    function moveFocus(delta, count) {
      var limit = Math.max(0, Number(count) || 0);
      var next;
      if (destroyed) { return state.focusIndex; }
      if (!limit) { state.focusIndex = 0; publish(); return state.focusIndex; }
      next = state.focusIndex + (Number(delta) || 0);
      state.focusIndex = Math.max(0, Math.min(limit - 1, next));
      publish();
      return state.focusIndex;
    }

    function setFocus(index, count) {
      var limit = Math.max(0, Number(count) || 0);
      if (destroyed) { return state.focusIndex; }
      state.focusIndex = limit ? Math.max(0, Math.min(limit - 1, Number(index) || 0)) : 0;
      publish();
      return state.focusIndex;
    }

    function digitFrom(value) {
      var number = Number(value);
      if (typeof value === 'string' && /^[0-9]$/.test(value)) { return value; }
      if (number >= 48 && number <= 57) { return String(number - 48); }
      if (number >= 96 && number <= 105) { return String(number - 96); }
      return '';
    }

    function backspace() {
      if (destroyed || state.stage !== 'profile-pin' || state.profileBusy || !state.profilePin.length) { return false; }
      state.profilePin = state.profilePin.slice(0, -1);
      publish();
      return true;
    }

    function inputDigit(value) {
      var digit;
      if (destroyed || state.stage !== 'profile-pin' || state.profileBusy) { return false; }
      if (Number(value) === 8) { return backspace(); }
      digit = digitFrom(value);
      if (!digit || state.profilePin.length >= 4) { return false; }
      state.profilePin += digit;
      publish();
      return true;
    }

    function cancel() {
      if (destroyed) { return; }
      invalidate();
      state.profileBusy = false;
      state.statusKey = '';
      if (values.cancel) { values.cancel(snapshot()); }
      publish();
    }

    function destroy() {
      if (destroyed) { return; }
      invalidate();
      destroyed = true;
      state.profileBusy = false;
      publish();
    }

    return {
      activate: activate,
      back: back,
      backspace: backspace,
      destroy: destroy,
      inputDigit: inputDigit,
      moveFocus: moveFocus,
      open: open,
      setFocus: setFocus,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
