(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSetupView = factory(); }
}(this, function () {
  'use strict';

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;

    function text(key) {
      return values.t ? values.t(key) : key;
    }

    function presentation(snapshot) {
      var state = typeof values.presentation === 'function' ? values.presentation(snapshot) : values.presentation;
      return state || {};
    }

    function element(tagName, className, content) {
      return values.element(tagName, className, content);
    }

    function setText(id, value) {
      if (values.setText) { values.setText(id, value); }
    }

    function reset(step, title, message) {
      setText('setup-step', step);
      setText('setup-title', title);
      setText('setup-message', message);
      documentRef.getElementById('setup-server-list').className = 'setup-list is-hidden';
      documentRef.getElementById('setup-server-list').innerHTML = '';
      documentRef.getElementById('setup-profile-list').className = 'setup-list is-hidden';
      documentRef.getElementById('setup-profile-list').innerHTML = '';
      documentRef.getElementById('setup-login').className = 'setup-login is-hidden';
      documentRef.getElementById('setup-manual').className = 'setup-manual is-hidden';
      documentRef.getElementById('setup-actions').innerHTML = '';
    }

    function button(label, action, primary) {
      var value = element('button', 'setup-action' + (primary ? ' is-primary' : ''), label);
      value.type = 'button';
      value.setAttribute('data-setup-action', action);
      return value;
    }

    function connectionOption(label, action, uri) {
      var value = element('button', 'setup-option setup-connection-option');
      value.type = 'button';
      value.setAttribute('data-setup-action', action);
      value.appendChild(element('span', 'setup-connection-label', label));
      value.appendChild(element('span', 'setup-option-meta', uri || ''));
      return value;
    }

    function appendAction(actionList, labelKey, actionName, primary) {
      actionList.appendChild(button(text(labelKey), actionName, primary));
    }

    function uriLabel(uri) {
      return String(uri || '').replace(/^https?:\/\//, '');
    }

    function statusKey(snapshot, state) {
      return state.statusKey || snapshot.statusKey || '';
    }

    function showInput(type, value, maxLength, placeholder) {
      var input = documentRef.getElementById('setup-address');
      documentRef.getElementById('setup-manual').className = 'setup-manual';
      input.type = type;
      input.maxLength = maxLength;
      input.value = value;
      input.placeholder = placeholder;
      return input;
    }

    function buttonCount() {
      return documentRef.getElementById('setup-server-list').children.length +
        documentRef.getElementById('setup-profile-list').children.length +
        documentRef.getElementById('setup-actions').children.length;
    }

    function applyFocus(snapshot) {
      if (values.focus) { values.focus(snapshot.focusIndex, buttonCount(), snapshot); }
    }

    function renderLanguage(snapshot, state) {
      var list = documentRef.getElementById('setup-server-list');
      var source = array(values.languages);
      var active = state.activeLanguage || snapshot.selectedLanguage;
      var index;
      var language;
      var option;
      var meta;
      reset(text('setup.stepLanguage'), text('setup.chooseLanguageTitle'), text('setup.chooseLanguageMessage'));
      list.className = 'setup-list setup-language-list';
      list.innerHTML = '';
      for (index = 0; index < source.length; index += 1) {
        language = source[index];
        option = element('button', 'setup-option' + (language.code === active ? ' is-active' : ''));
        option.type = 'button';
        option.setAttribute('data-setup-language', index);
        option.appendChild(element('span', '', language.label));
        meta = language.code === active ? '\u2713' : '';
        option.appendChild(element('span', 'setup-option-meta', meta));
        list.appendChild(option);
      }
    }

    function renderServers(snapshot, state) {
      var list = documentRef.getElementById('setup-server-list');
      var actions = documentRef.getElementById('setup-actions');
      var servers = array(snapshot.servers);
      var index;
      var server;
      var option;
      reset(text('setup.stepServer'), text('setup.findServerTitle'), statusKey(snapshot, state) ? text(statusKey(snapshot, state)) : text('setup.findServerMessage'));
      list.className = 'setup-list';
      list.innerHTML = '';
      for (index = 0; index < servers.length; index += 1) {
        server = servers[index];
        option = element('button', 'setup-option');
        option.type = 'button';
        option.setAttribute('data-setup-server', index);
        option.appendChild(element('span', '', server.name));
        option.appendChild(element('span', 'setup-option-meta', uriLabel(server.uri) + (server.version ? ' - ' + server.version : '')));
        list.appendChild(option);
      }
      appendAction(actions, 'setup.scanAgain', 'scan', true);
      appendAction(actions, 'setup.manualAddress', 'manual', false);
      if (!servers.length) {
        appendAction(actions, 'setup.findAccountServers', state.ownerToken ? 'account-servers' : 'login-servers', false);
      }
      if (snapshot.returnView || state.returnView) { appendAction(actions, 'setup.cancel', 'cancel', false); }
      if (state.serverDiscoveryActive && !servers.length) {
        if (values.scanIndicator && values.scanIndicator.start) { values.scanIndicator.start(); }
      } else if (values.scanIndicator && values.scanIndicator.stop) { values.scanIndicator.stop(); }
    }

    function renderManual(snapshot, state) {
      var actions = documentRef.getElementById('setup-actions');
      var returnView = snapshot.returnView || state.returnView;
      reset(text('setup.stepServer'), text('setup.manualAddress'), statusKey(snapshot, state) ? text(statusKey(snapshot, state)) : text('setup.findServerMessage'));
      showInput('url', returnView === 'settings' ? String(state.manualAddress || '') : '', 120, '192.168.1.10');
      appendAction(actions, 'setup.connectAddress', 'connect-manual', true);
      appendAction(actions, 'setup.cancel', returnView ? 'cancel' : 'servers', false);
    }

    function renderConnectionChoice(snapshot) {
      var list = documentRef.getElementById('setup-server-list');
      var actions = documentRef.getElementById('setup-actions');
      reset(text('setup.stepServer'), text('setup.connectionChoiceTitle'), text('setup.connectionChoiceMessage'));
      list.className = 'setup-list';
      list.innerHTML = '';
      list.appendChild(connectionOption(text('setup.useLocalConnection'), 'use-local-connection', snapshot.selectedServer && snapshot.selectedServer.uri));
      list.appendChild(connectionOption(text('setup.useEnteredConnection'), 'use-entered-connection', snapshot.enteredConnectionUri));
      appendAction(actions, 'setup.cancel', 'manual', false);
    }

    function renderAccess(snapshot, state) {
      var actions = documentRef.getElementById('setup-actions');
      reset(text('setup.stepAccess'), text('setup.chooseAccessTitle'), text('setup.chooseAccessMessage'));
      appendAction(actions, 'setup.continueOffline', 'offline', true);
      if (state.ownerToken) {
        appendAction(actions, 'setup.continuePlex', 'load-profiles', false);
        appendAction(actions, 'setup.disconnectPlex', 'disconnect', false);
      } else { appendAction(actions, 'setup.signInPlex', 'login', false); }
      appendAction(actions, 'setup.cancel', snapshot.returnView || state.returnView ? 'cancel' : 'servers', false);
    }

    function renderLogin(snapshot, state) {
      var actions = documentRef.getElementById('setup-actions');
      var pin = state.loginPin;
      var returnAction = snapshot.returnView || state.returnView ? 'cancel' : (snapshot.loginPurpose === 'servers' ? 'servers' : 'access');
      reset(text('setup.stepAccess'), text('setup.loginTitle'), text('setup.loginMessage'));
      documentRef.getElementById('setup-login').className = 'setup-login';
      setText('setup-code', pin ? pin.code : '----');
      setText('setup-login-status', text(statusKey(snapshot, state) || 'setup.loginWaiting'));
      if (!pin) { appendAction(actions, 'setup.retry', snapshot.loginPurpose === 'servers' ? 'login-servers' : 'login', true); }
      appendAction(actions, 'setup.continueOffline', 'offline', !!pin);
      appendAction(actions, 'setup.cancel', returnAction, false);
    }

    function renderProfiles(snapshot, state) {
      var list = documentRef.getElementById('setup-profile-list');
      var actions = documentRef.getElementById('setup-actions');
      var profiles = array(snapshot.profiles);
      var active = state.activeProfileId;
      var index;
      var profile;
      var option;
      var identity;
      var avatar;
      var marker;
      reset(text('setup.stepProfile'), text('setup.chooseProfileTitle'), statusKey(snapshot, state) ? text(statusKey(snapshot, state)) : text('setup.chooseProfileMessage'));
      list.className = 'setup-list';
      list.innerHTML = '';
      for (index = 0; index < profiles.length; index += 1) {
        profile = profiles[index];
        option = element('button', 'setup-option' + (profile.id === active ? ' is-active' : ''));
        option.type = 'button';
        option.setAttribute('data-setup-profile', index);
        identity = element('span', 'setup-profile-identity');
        if (profile.thumb) {
          avatar = element('img', 'setup-profile-avatar');
          avatar.src = profile.thumb;
          avatar.alt = '';
        } else {
          avatar = element('span', 'setup-profile-avatar setup-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
        }
        identity.appendChild(avatar);
        identity.appendChild(element('span', '', profile.title));
        option.appendChild(identity);
        marker = profile.id === active ? '\u2713' : (profile.protected ? 'PIN' : '');
        option.appendChild(element('span', 'setup-option-meta', marker));
        list.appendChild(option);
      }
      appendAction(actions, state.ownerToken ? 'setup.disconnectPlex' : 'setup.signInPlex', state.ownerToken ? 'disconnect' : 'login', false);
      appendAction(actions, 'setup.continueOffline', 'offline', false);
      if (snapshot.returnView || state.returnView) { appendAction(actions, 'setup.cancel', 'cancel', false); }
    }

    function renderProfilePin(snapshot, state) {
      var actions = documentRef.getElementById('setup-actions');
      var length = Math.max(0, Number(snapshot.profilePinLength) || 0);
      var input;
      reset(text('setup.stepProfile'), text('setup.pinTitle'), statusKey(snapshot, state) ? text(statusKey(snapshot, state)) : text('setup.pinMessage'));
      input = showInput('password', new Array(length + 1).join('\u2022'), 4, 'PIN');
      appendAction(actions, 'setup.unlock', 'unlock-profile', true);
      appendAction(actions, 'setup.continueOffline', 'offline', false);
      appendAction(actions, 'setup.cancel', 'profiles', false);
      return input;
    }

    function render(snapshot) {
      var state = presentation(snapshot || {});
      var current = snapshot || {};
      if (current.stage === 'language') { renderLanguage(current, state); }
      else if (current.stage === 'servers') { renderServers(current, state); }
      else if (current.stage === 'manual') { renderManual(current, state); }
      else if (current.stage === 'connection-choice') { renderConnectionChoice(current); }
      else if (current.stage === 'access') { renderAccess(current, state); }
      else if (current.stage === 'login') { renderLogin(current, state); }
      else if (current.stage === 'profiles') { renderProfiles(current, state); }
      else if (current.stage === 'profile-pin' && current.selectedProfile) { renderProfilePin(current, state); }
      applyFocus(current);
    }

    return { render: render };
  }

  return { create: create };
}));
