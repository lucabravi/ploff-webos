(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffReleaseStatus = factory(); }
}(this, function () {
  'use strict';

  var CACHE_KEY = 'ploff.release.v1';
  var CHECK_INTERVAL = 24 * 60 * 60 * 1000;
  var ENDPOINT = 'https://api.github.com/repos/lucabravi/ploff-webos/releases/latest';
  var RELEASE_URL = 'https://github.com/lucabravi/ploff-webos/releases/latest';

  function numericParts(version) {
    return String(version || '').replace(/^v/i, '').split(/[.-]/).map(function (part) {
      var value = parseInt(part, 10);
      return isFinite(value) ? value : 0;
    });
  }

  function compareVersions(left, right) {
    var a = numericParts(left);
    var b = numericParts(right);
    var length = Math.max(a.length, b.length);
    var index;
    for (index = 0; index < length; index += 1) {
      if ((a[index] || 0) > (b[index] || 0)) { return 1; }
      if ((a[index] || 0) < (b[index] || 0)) { return -1; }
    }
    return 0;
  }

  function safeRead(storage) {
    var raw;
    var parsed;
    if (!storage || !storage.getItem) { return {}; }
    try {
      raw = storage.getItem(CACHE_KEY);
      parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) { return {}; }
  }

  function safeWrite(storage, value) {
    if (!storage || !storage.setItem) { return; }
    try { storage.setItem(CACHE_KEY, JSON.stringify(value)); }
    catch (_error) {}
  }

  function create(options) {
    var values = options || {};
    var root = values.root || {};
    var storage = values.storage || root.localStorage;
    var now = values.now || function () { return Date.now(); };
    var endpoint = values.endpoint || ENDPOINT;
    var defaultReleaseUrl = values.releaseUrl || RELEASE_URL;
    var interval = Number(values.interval || CHECK_INTERVAL);
    var installedVersion = String(values.installedVersion || 'development');
    var onChange = values.onChange || function () {};
    var requestFactory = values.request || function () { return root.XMLHttpRequest ? new root.XMLHttpRequest() : null; };
    var cache = safeRead(storage);
    var cachedLatestVersion = String(cache.latestVersion || '');
    var cachedStatus = cache.status === 'checking' ? 'unknown' : (cache.status || 'unknown');
    if (cachedLatestVersion && (cachedStatus === 'current' || cachedStatus === 'available')) {
      cachedStatus = compareVersions(cachedLatestVersion, installedVersion) > 0 ? 'available' : 'current';
    }
    var state = {
      status: cachedStatus,
      installedVersion: installedVersion,
      latestVersion: cachedLatestVersion,
      releaseUrl: String(cache.releaseUrl || defaultReleaseUrl),
      checkedAt: Number(cache.checkedAt || 0),
      attemptedAt: Number(cache.attemptedAt || 0)
    };
    var requestGeneration = 0;
    var activeRequest = null;
    var destroyed = false;

    function snapshot() {
      return {
        status: state.status,
        installedVersion: state.installedVersion,
        latestVersion: state.latestVersion,
        releaseUrl: state.releaseUrl,
        checkedAt: state.checkedAt
      };
    }

    function publish() { if (!destroyed) { onChange(snapshot()); } }

    function persist() {
      safeWrite(storage, {
        status: state.status,
        latestVersion: state.latestVersion,
        releaseUrl: state.releaseUrl,
        checkedAt: state.checkedAt,
        attemptedAt: state.attemptedAt
      });
    }

    function complete(status, latestVersion, releaseUrl, generation, callback) {
      if (destroyed || generation !== requestGeneration) { return; }
      activeRequest = null;
      state.status = status;
      if (latestVersion) { state.latestVersion = latestVersion; }
      if (releaseUrl) { state.releaseUrl = releaseUrl; }
      if (status === 'current' || status === 'available') { state.checkedAt = now(); }
      persist();
      publish();
      if (callback) { callback(snapshot()); }
    }

    function check(force, callback) {
      var currentTime = now();
      var request;
      var generation;
      var settled = false;
      if (destroyed) { return false; }
      if (!force && state.attemptedAt && currentTime >= state.attemptedAt && currentTime - state.attemptedAt < interval) {
        if (callback) { callback(snapshot()); }
        return false;
      }
      requestGeneration += 1;
      generation = requestGeneration;
      if (activeRequest && activeRequest.abort) {
        try { activeRequest.abort(); } catch (_abortError) {}
      }
      state.attemptedAt = currentTime;
      if (root.navigator && root.navigator.onLine === false) {
        complete('offline', '', '', generation, callback);
        return false;
      }
      try { request = requestFactory(); }
      catch (_requestError) {
        complete('error', '', '', generation, callback);
        return false;
      }
      if (!request) {
        complete('error', '', '', generation, callback);
        return false;
      }
      activeRequest = request;
      state.status = 'checking';
      persist();
      publish();
      function settle(status, latestVersion, releaseUrl) {
        if (settled) { return; }
        settled = true;
        complete(status, latestVersion, releaseUrl, generation, callback);
      }
      request.onreadystatechange = function () {
        var payload;
        var latest;
        if (request.readyState !== 4 || generation !== requestGeneration) { return; }
        if (request.status >= 200 && request.status < 300) {
          try { payload = JSON.parse(request.responseText || '{}'); }
          catch (_parseError) { settle('error', '', ''); return; }
          latest = String(payload.tag_name || payload.name || '').replace(/^v/i, '');
          if (!latest) { settle('error', '', ''); return; }
          settle(compareVersions(latest, installedVersion) > 0 ? 'available' : 'current', latest, payload.html_url || defaultReleaseUrl);
        } else { settle('error', '', ''); }
      };
      request.onerror = function () { settle('error', '', ''); };
      request.ontimeout = function () { settle('error', '', ''); };
      try {
        request.open('GET', endpoint, true);
        request.timeout = 6000;
        if (request.setRequestHeader) { request.setRequestHeader('Accept', 'application/vnd.github+json'); }
        request.send(null);
      }
      catch (_sendError) { settle('error', '', ''); }
      return true;
    }

    function destroy() {
      destroyed = true;
      requestGeneration += 1;
      if (activeRequest && activeRequest.abort) {
        try { activeRequest.abort(); } catch (_error) {}
      }
      activeRequest = null;
    }

    return { check: check, snapshot: snapshot, destroy: destroy };
  }

  return {
    CACHE_KEY: CACHE_KEY,
    CHECK_INTERVAL: CHECK_INTERVAL,
    ENDPOINT: ENDPOINT,
    RELEASE_URL: RELEASE_URL,
    compareVersions: compareVersions,
    create: create
  };
}));
