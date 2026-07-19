(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffAuthStore = factory();
  }
}(this, function () {
  'use strict';

  var STORAGE_KEY = 'ploff.auth.v1';

  function emptyState() {
    return {
      version: 1,
      setupComplete: false,
      mode: 'offline',
      ownerToken: '',
      activeProfileId: '',
      profiles: []
    };
  }

  function bool(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function normalizeProfile(value) {
    var profile = value || {};
    var id = String(profile.id || profile.uuid || '');
    if (!id) { return null; }
    return {
      id: id,
      uuid: String(profile.uuid || ''),
      title: String(profile.title || profile.username || 'Plex'),
      token: String(profile.token || ''),
      accountToken: String(profile.accountToken || ''),
      serverMachineIdentifier: String(profile.serverMachineIdentifier || ''),
      serverConnectionUri: String(profile.serverConnectionUri || ''),
      protected: bool(profile.protected),
      thumb: String(profile.thumb || '')
    };
  }

  function sameProfile(left, right) {
    var a = left || {};
    var b = right || {};
    var aId = String(a.id || '');
    var aUuid = String(a.uuid || '');
    var bId = String(b.id || '');
    var bUuid = String(b.uuid || '');
    return !!(
      (aId && (aId === bId || aId === bUuid)) ||
      (aUuid && (aUuid === bId || aUuid === bUuid))
    );
  }

  function normalizeProfiles(values) {
    var source = Object.prototype.toString.call(values) === '[object Array]' ? values : [];
    var result = [];
    var index;
    var resultIndex;
    var profile;
    for (index = 0; index < source.length; index += 1) {
      profile = normalizeProfile(source[index]);
      if (!profile) { continue; }
      for (resultIndex = 0; resultIndex < result.length; resultIndex += 1) {
        if (sameProfile(result[resultIndex], profile)) { break; }
      }
      if (resultIndex < result.length) {
        if (!result[resultIndex].token && profile.token) { result[resultIndex].token = profile.token; }
        if (!result[resultIndex].accountToken && profile.accountToken) { result[resultIndex].accountToken = profile.accountToken; }
        if (!result[resultIndex].serverMachineIdentifier && profile.serverMachineIdentifier) { result[resultIndex].serverMachineIdentifier = profile.serverMachineIdentifier; }
        if (!result[resultIndex].serverConnectionUri && profile.serverConnectionUri) { result[resultIndex].serverConnectionUri = profile.serverConnectionUri; }
      } else { result.push(profile); }
    }
    return result;
  }

  function validate(value) {
    var input = value || {};
    var state = emptyState();
    var sourceProfiles = Object.prototype.toString.call(input.profiles) === '[object Array]' ? input.profiles : [];
    var activeSource = null;
    var index;
    state.setupComplete = bool(input.setupComplete);
    state.mode = input.mode === 'plex' ? 'plex' : 'offline';
    state.ownerToken = String(input.ownerToken || '');
    state.activeProfileId = String(input.activeProfileId || '');
    for (index = 0; index < sourceProfiles.length; index += 1) {
      if (String(sourceProfiles[index] && (sourceProfiles[index].id || sourceProfiles[index].uuid) || '') === state.activeProfileId) {
        activeSource = sourceProfiles[index]; break;
      }
    }
    state.profiles = normalizeProfiles(sourceProfiles);
    if (activeSource) {
      for (index = 0; index < state.profiles.length; index += 1) {
        if (sameProfile(state.profiles[index], activeSource)) { state.activeProfileId = state.profiles[index].id; break; }
      }
    }
    return state;
  }

  function load(storage) {
    var raw;
    try {
      raw = storage && storage.getItem(STORAGE_KEY);
      return raw ? validate(JSON.parse(raw)) : emptyState();
    } catch (error) {
      return emptyState();
    }
  }

  function save(storage, value) {
    var state = validate(value);
    if (storage && storage.setItem) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    return state;
  }

  function activeProfile(state) {
    var value = validate(state);
    var index;
    for (index = 0; index < value.profiles.length; index += 1) {
      if (value.profiles[index].id === value.activeProfileId) { return value.profiles[index]; }
    }
    return null;
  }

  function activeToken(state, machineIdentifier) {
    var profile = activeProfile(state);
    if (!state || state.mode !== 'plex' || !profile || !profile.token) { return ''; }
    if (machineIdentifier && profile.serverMachineIdentifier !== String(machineIdentifier)) { return ''; }
    return profile.token;
  }

  function setActiveProfileConnection(state, machineIdentifier, uri) {
    var result = validate(state);
    var profile = null;
    var index;
    var connection = String(uri || '').replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    for (index = 0; index < result.profiles.length; index += 1) {
      if (result.profiles[index].id === result.activeProfileId) { profile = result.profiles[index]; break; }
    }
    if (!profile || !connection || (machineIdentifier && profile.serverMachineIdentifier !== String(machineIdentifier))) { return result; }
    profile.serverConnectionUri = connection;
    return result;
  }

  function needsOnboarding(serverState, authState) {
    if (authState && authState.setupComplete) { return false; }
    return !(serverState && serverState.activeUri);
  }

  function mergeProfiles(current, incoming) {
    var existing = normalizeProfiles(current);
    var updates = normalizeProfiles(incoming);
    var result = [];
    var index;
    var updateIndex;
    var match;
    for (index = 0; index < updates.length; index += 1) {
      match = null;
      for (updateIndex = 0; updateIndex < existing.length; updateIndex += 1) {
        if (sameProfile(existing[updateIndex], updates[index])) { match = existing[updateIndex]; break; }
      }
      if (match && !updates[index].token) { updates[index].token = match.token; }
      if (match && !updates[index].accountToken) { updates[index].accountToken = match.accountToken; }
      if (match && !updates[index].serverMachineIdentifier) { updates[index].serverMachineIdentifier = match.serverMachineIdentifier; }
      if (match && !updates[index].serverConnectionUri) { updates[index].serverConnectionUri = match.serverConnectionUri; }
      result.push(updates[index]);
    }
    for (index = 0; index < existing.length; index += 1) {
      match = false;
      for (updateIndex = 0; updateIndex < result.length; updateIndex += 1) {
        if (sameProfile(result[updateIndex], existing[index])) { match = true; break; }
      }
      if (!match) { result.push(existing[index]); }
    }
    return result;
  }

  function disconnect(state) {
    var result = validate(state);
    result.setupComplete = true;
    result.mode = 'offline';
    result.ownerToken = '';
    result.activeProfileId = '';
    result.profiles = [];
    return result;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    activeProfile: activeProfile,
    setActiveProfileConnection: setActiveProfileConnection,
    activeToken: activeToken,
    disconnect: disconnect,
    emptyState: emptyState,
    load: load,
    mergeProfiles: mergeProfiles,
    needsOnboarding: needsOnboarding,
    sameProfile: sameProfile,
    save: save,
    validate: validate
  };
}));
