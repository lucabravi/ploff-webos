(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffNetworkState = factory(); }
}(this, function () {
  'use strict';

  var SERVICE_URI = 'luna://com.palm.connectionmanager';

  function emptySnapshot() {
    return {
      status: 'unknown',
      lanAvailable: null,
      internetAvailable: null,
      connectionType: null,
      localAddress: null
    };
  }

  function booleanValue(value) {
    if (typeof value === 'boolean') { return value; }
    if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') { return true; }
    if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') { return false; }
    return null;
  }

  function stateValue(value) {
    var state;
    var keys;
    var index;
    var result;
    if (value === null || typeof value === 'undefined') { return null; }
    result = booleanValue(value);
    if (result !== null) { return result; }
    if (typeof value === 'string') {
      state = value.toLowerCase();
      if (/^(connected|available|up|online)$/.test(state)) { return true; }
      if (/^(disconnected|unavailable|down|offline|none)$/.test(state)) { return false; }
      return null;
    }
    if (typeof value !== 'object') { return null; }
    keys = ['state', 'status', 'connectionState', 'connected', 'available', 'isConnected', 'isAvailable'];
    for (index = 0; index < keys.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, keys[index])) {
        result = stateValue(value[keys[index]]);
        if (result !== null) { return result; }
      }
    }
    return null;
  }

  function stringValue(value) {
    if (typeof value !== 'string' && typeof value !== 'number') { return null; }
    value = String(value).trim();
    return value ? value : null;
  }

  function addressValue(connection) {
    var keys = ['ipAddress', 'ip', 'address', 'localAddress'];
    var index;
    var value;
    if (!connection || typeof connection !== 'object') { return null; }
    for (index = 0; index < keys.length; index += 1) {
      value = stringValue(connection[keys[index]]);
      if (value) { return value; }
    }
    return null;
  }

  function connectionTypeValue(value) {
    value = stringValue(value);
    if (!value) { return null; }
    value = value.toLowerCase();
    if (value === 'wireless' || value === 'wi-fi' || value === 'wifi') { return 'wifi'; }
    if (value === 'ethernet' || value === 'wired') { return 'wired'; }
    return value;
  }

  function normalizedSnapshot(response) {
    var result = emptySnapshot();
    var wired = response && response.wired;
    var wifi = response && response.wifi;
    var wiredState = stateValue(wired);
    var wifiState = stateValue(wifi);
    var type = connectionTypeValue(response && (response.connectionType || response.networkType || response.type));
    var internet = booleanValue(response && response.isInternetConnectionAvailable);
    var address = null;

    if (wiredState === true || wifiState === true) { result.lanAvailable = true; }
    else if (wiredState === false && wifiState === false) { result.lanAvailable = false; }
    if (internet !== null) { result.internetAvailable = internet; }

    if (wiredState === true) {
      type = type || 'wired';
      address = addressValue(wired);
    } else if (wifiState === true) {
      type = type || 'wifi';
      address = addressValue(wifi);
    }
    if (!address && response) { address = addressValue(response); }
    result.connectionType = type;
    result.localAddress = address;

    if (result.lanAvailable === false) { result.status = 'offline'; }
    else if (result.lanAvailable === true && result.internetAvailable === true) { result.status = 'online'; }
    else if (result.lanAvailable === true && result.internetAvailable === false) { result.status = 'local-only'; }
    return result;
  }

  function browserSnapshot(target) {
    var online = target && target.navigator && target.navigator.onLine;
    if (online === false) {
      return {
        status: 'unknown',
        lanAvailable: null,
        internetAvailable: false,
        connectionType: null,
        localAddress: null
      };
    }
    return emptySnapshot();
  }

  function sameSnapshot(left, right) {
    return left.status === right.status &&
      left.lanAvailable === right.lanAvailable &&
      left.internetAvailable === right.internetAvailable &&
      left.connectionType === right.connectionType &&
      left.localAddress === right.localAddress;
  }

  function copySnapshot(value) {
    return {
      status: value.status,
      lanAvailable: value.lanAvailable,
      internetAvailable: value.internetAvailable,
      connectionType: value.connectionType,
      localAddress: value.localAddress
    };
  }

  function cancelHandle(handle) {
    if (!handle) { return; }
    if (typeof handle.cancel === 'function') { handle.cancel(); }
    else if (typeof handle.unsubscribe === 'function') { handle.unsubscribe(); }
  }

  function create(target) {
    var environment = target || {};
    var service = environment.webOS && environment.webOS.service;
    var hasService = service && typeof service.request === 'function';
    var current = hasService ? emptySnapshot() : browserSnapshot(environment);
    var listeners = [];
    var requestHandle = null;
    var destroyed = false;

    function notify(next) {
      var index;
      var notifiedListeners = listeners.slice();
      current = next;
      for (index = 0; index < notifiedListeners.length; index += 1) {
        notifiedListeners[index](copySnapshot(current));
      }
    }

    function apply(next) {
      if (!sameSnapshot(current, next)) { notify(next); }
    }

    function refresh() {
      if (destroyed) { return copySnapshot(current); }
      if (!hasService) {
        apply(browserSnapshot(environment));
        return copySnapshot(current);
      }
      cancelHandle(requestHandle);
      requestHandle = null;
      try {
        requestHandle = service.request(SERVICE_URI, {
          method: 'getStatus',
          parameters: { subscribe: true },
          onSuccess: function (response) {
            if (!destroyed) { apply(normalizedSnapshot(response)); }
          },
          onFailure: function () {
            if (!destroyed) { apply(emptySnapshot()); }
          }
        });
      } catch (error) {
        apply(emptySnapshot());
      }
      return copySnapshot(current);
    }

    function browserOnline() {
      if (!destroyed) { apply(browserSnapshot(environment)); }
    }

    function browserOffline() {
      if (!destroyed) {
        apply({
          status: 'unknown',
          lanAvailable: null,
          internetAvailable: false,
          connectionType: null,
          localAddress: null
        });
      }
    }

    function subscribe(listener) {
      if (typeof listener !== 'function' || destroyed) { return function () {}; }
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index !== -1) { listeners.splice(index, 1); }
      };
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelHandle(requestHandle);
      requestHandle = null;
      if (!hasService && typeof environment.removeEventListener === 'function') {
        environment.removeEventListener('online', browserOnline);
        environment.removeEventListener('offline', browserOffline);
      }
      listeners = [];
    }

    if (!hasService && typeof environment.addEventListener === 'function') {
      environment.addEventListener('online', browserOnline);
      environment.addEventListener('offline', browserOffline);
    }
    refresh();

    return {
      snapshot: function () { return copySnapshot(current); },
      refresh: refresh,
      subscribe: subscribe,
      destroy: destroy,
      allowsLocal: function () { return current.lanAvailable !== false; },
      allowsCloud: function () { return current.internetAvailable !== false; }
    };
  }

  return { create: create };
}));
