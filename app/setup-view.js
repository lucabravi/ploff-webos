(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./language-flag')); }
  else { root.PloffSetupView = factory(root.PloffLanguageFlag); }
}(this, function (LanguageFlag) {
  'use strict';

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var root = values.root || {};
    var languageCycleTimer = null;
    var languageCycleAnimation = null;
    var profileIdentitySignature = '';
    var profilePresentationSignature = '';
    var serverPresentationSignature = '';
    var lastStage = '';

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

    function stopLanguageCycle() {
      if (languageCycleTimer && root.clearInterval) { root.clearInterval(languageCycleTimer); }
      if (languageCycleAnimation && root.clearTimeout) { root.clearTimeout(languageCycleAnimation); }
      languageCycleTimer = null;
      languageCycleAnimation = null;
    }

    function reset(step, title, message, preserveProfiles) {
      var profileList = documentRef.getElementById('setup-profile-list');
      stopLanguageCycle();
      setText('setup-step', step);
      setText('setup-title', title);
      setText('setup-message', message);
      if (documentRef.getElementById('setup-title-spinner')) {
        documentRef.getElementById('setup-title-spinner').className = 'setup-title-spinner is-hidden';
      }
      documentRef.getElementById('setup-server-list').className = 'setup-list is-hidden';
      documentRef.getElementById('setup-server-list').innerHTML = '';
      profileList.className = 'setup-list is-hidden';
      if (!preserveProfiles) {
        profileList.innerHTML = '';
        profileIdentitySignature = '';
        profilePresentationSignature = '';
      }
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

    function appendLanguageAction(actionList) {
      var source = array(values.languages);
      var labels = [];
      var index = 0;
      var action;
      source.forEach(function (language) {
        labels.push(String(language.changeLabel || language.label || ''));
      });
      if (!labels.length) { return; }
      action = button(labels[0], 'change-language', false);
      action.className += ' setup-change-language';
      actionList.appendChild(action);
      if (!root.setInterval) { return; }
      languageCycleTimer = root.setInterval(function () {
        index = (index + 1) % labels.length;
        action.className = action.className.replace(' is-cycling', '');
        action.textContent = labels[index];
        if (root.setTimeout) {
          languageCycleAnimation = root.setTimeout(function () {
            action.className += ' is-cycling';
          }, 0);
        }
      }, 2000);
    }

    function uriLabel(uri) {
      return String(uri || '').replace(/^https?:\/\//, '');
    }

    function statusKey(snapshot, state) {
      return state.statusKey || snapshot.statusKey || '';
    }

    function serverSignature(snapshot, state) {
      return JSON.stringify({
        servers: array(snapshot.servers).map(function (server) {
          return [
            String(server && server.name || ''),
            String(server && server.uri || ''),
            String(server && server.version || ''),
            String(server && server.machineIdentifier || '')
          ];
        }),
        canChangeLanguage: snapshot.canChangeLanguage === true,
        returnView: String(snapshot.returnView || state.returnView || ''),
        statusKey: statusKey(snapshot, state),
        ownerToken: state.ownerToken ? '1' : '0',
        discoveryActive: state.serverDiscoveryActive === true
      });
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
      var identity;
      var flag;
      var meta;
      reset(text('setup.stepLanguage'), text('setup.chooseLanguageTitle'), text('setup.chooseLanguageMessage'));
      list.className = 'setup-list setup-language-list';
      list.innerHTML = '';
      for (index = 0; index < source.length; index += 1) {
        language = source[index];
        option = element('button', 'setup-option' + (language.code === active ? ' is-active' : ''));
        option.type = 'button';
        option.setAttribute('data-setup-language', index);
        identity = element('span', 'setup-language-identity');
        flag = LanguageFlag ? LanguageFlag.create(documentRef, language.code) : null;
        if (flag) { identity.appendChild(flag); }
        identity.appendChild(element('span', '', language.label));
        option.appendChild(identity);
        meta = language.code === active ? '\u2713' : '';
        option.appendChild(element('span', 'setup-option-meta', meta));
        list.appendChild(option);
      }
    }

    function renderServers(snapshot, state) {
      var list = documentRef.getElementById('setup-server-list');
      var actions = documentRef.getElementById('setup-actions');
      var servers = array(snapshot.servers);
      var signature = serverSignature(snapshot, state);
      var index;
      var server;
      var option;
      if (lastStage === 'servers' && signature === serverPresentationSignature) { return; }
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
      if (snapshot.canChangeLanguage) { appendLanguageAction(actions); }
      if (!servers.length) {
        appendAction(actions, 'setup.findAccountServers', state.ownerToken ? 'account-servers' : 'login-servers', false);
      }
      if (snapshot.returnView || state.returnView) { appendAction(actions, 'setup.cancel', 'cancel', false); }
      if (state.serverDiscoveryActive && !servers.length) {
        if (values.scanIndicator && values.scanIndicator.start) { values.scanIndicator.start(); }
      } else if (values.scanIndicator && values.scanIndicator.stop) { values.scanIndicator.stop(); }
      serverPresentationSignature = signature;
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

    function profileIdentity(profiles) {
      return array(profiles).map(function (profile, index) {
        return String(profile && profile.id || 'profile-' + index);
      }).join('\u001e');
    }

    function profilePresentation(profiles, active) {
      return array(profiles).map(function (profile) {
        profile = profile || {};
        return [
          String(profile.id || ''),
          String(profile.title || ''),
          String(profile.thumb || ''),
          profile.protected ? '1' : '0',
          String(profile.id || '') === String(active || '') ? '1' : '0'
        ].join('\u001f');
      }).join('\u001e');
    }

    function profileAvatar(profile) {
      var avatar;
      if (profile.thumb) {
        avatar = element('img', 'setup-profile-avatar');
        avatar.src = profile.thumb;
        avatar.alt = '';
        return avatar;
      }
      return element('span', 'setup-profile-avatar setup-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
    }

    function replaceProfileAvatar(identity, current, profile) {
      var replacement = profileAvatar(profile);
      if (current && identity.replaceChild) { identity.replaceChild(replacement, current); }
      else if (current && identity.removeChild && identity.insertBefore) {
        identity.removeChild(current);
        identity.insertBefore(replacement, identity.children[0] || null);
      } else {
        identity.innerHTML = '';
        identity.appendChild(replacement);
        identity.appendChild(element('span', '', profile.title));
      }
      return replacement;
    }

    function patchProfileAvatar(identity, profile) {
      var avatar = identity && identity.children && identity.children[0];
      var needsImage = !!profile.thumb;
      var isImage = avatar && String(avatar.tagName || '').toLowerCase() === 'img';
      if (!avatar || needsImage !== isImage) { return replaceProfileAvatar(identity, avatar, profile); }
      avatar.className = needsImage ? 'setup-profile-avatar' : 'setup-profile-avatar setup-profile-initial';
      if (needsImage) {
        if (String(avatar.src || '') !== String(profile.thumb || '')) { avatar.src = profile.thumb || ''; }
        avatar.alt = '';
      } else {
        avatar.textContent = String(profile.title || 'P').charAt(0).toUpperCase();
      }
      return avatar;
    }

    function updateProfileOption(option, profile, active, index) {
      var identity;
      var title;
      var marker;
      profile = profile || {};
      option.className = 'setup-option' + (String(profile.id || '') === String(active || '') ? ' is-active' : '');
      option.type = 'button';
      option.setAttribute('data-setup-profile', index);
      option.setAttribute('data-setup-profile-id', String(profile.id || ''));
      identity = option.children && option.children[0];
      if (!identity) {
        identity = element('span', 'setup-profile-identity');
        identity.appendChild(profileAvatar(profile));
        identity.appendChild(element('span', '', profile.title));
        option.appendChild(identity);
      } else {
        identity.className = 'setup-profile-identity';
        patchProfileAvatar(identity, profile);
        title = identity.children && identity.children[1];
        if (!title) { title = element('span', '', profile.title); identity.appendChild(title); }
        else { title.textContent = String(profile.title || ''); }
      }
      marker = option.children && option.children[1];
      if (!marker) { marker = element('span', 'setup-option-meta'); option.appendChild(marker); }
      marker.className = 'setup-option-meta';
      marker.textContent = String(profile.id || '') === String(active || '') ? '\u2713' : (profile.protected ? 'PIN' : '');
      return option;
    }

    function renderProfiles(snapshot, state) {
      var list = documentRef.getElementById('setup-profile-list');
      var actions = documentRef.getElementById('setup-actions');
      var profiles = array(snapshot.profiles);
      var active = state.activeProfileId;
      var index;
      var identitySignature = profileIdentity(profiles);
      var presentationSignature = profilePresentation(profiles, active);
      reset(
        text('setup.stepProfile'),
        text('setup.chooseProfileTitle'),
        snapshot.profileLoading ? text('setup.chooseProfileMessage') :
          (statusKey(snapshot, state) ? text(statusKey(snapshot, state)) : text('setup.chooseProfileMessage')),
        true
      );
      if (documentRef.getElementById('setup-title-spinner')) {
        documentRef.getElementById('setup-title-spinner').className =
          'setup-title-spinner' + (snapshot.profileLoading ? '' : ' is-hidden');
      }
      list.className = 'setup-list';
      if (identitySignature !== profileIdentitySignature || list.children.length !== profiles.length) {
        list.innerHTML = '';
        for (index = 0; index < profiles.length; index += 1) {
          list.appendChild(updateProfileOption(element('button', 'setup-option'), profiles[index], active, index));
        }
      } else if (presentationSignature !== profilePresentationSignature) {
        for (index = 0; index < profiles.length; index += 1) {
          updateProfileOption(list.children[index], profiles[index], active, index);
        }
      }
      profileIdentitySignature = identitySignature;
      profilePresentationSignature = presentationSignature;
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
      lastStage = String(current.stage || '');
      if (lastStage !== 'servers') { serverPresentationSignature = ''; }
    }

    function destroy() {
      stopLanguageCycle();
      serverPresentationSignature = '';
      lastStage = '';
    }

    return { destroy: destroy, render: render };
  }

  return { create: create };
}));
