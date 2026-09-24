(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPreviewDevAuth = factory();
    root.PloffPreviewDevAuth.install(root);
  }
}(this, function () {
  'use strict';

  var AUTH_KEY = 'ploff.auth.v1';
  var COOKIE_NAME = 'ploff.dev.auth.v1';
  var COOKIE_DAYS = 365;

  function hasDb8(rootObject) {
    return !!(rootObject && rootObject.webOS && rootObject.webOS.service &&
      typeof rootObject.webOS.service.request === 'function' &&
      typeof rootObject.PalmServiceBridge === 'function');
  }

  function browserRoot(rootObject) {
    return { clearTimeout: rootObject && rootObject.clearTimeout };
  }

  function decode(value) {
    try { return decodeURIComponent(value); }
    catch (_error) { return ''; }
  }

  function encode(value) {
    try { return encodeURIComponent(value); }
    catch (_error) { return ''; }
  }

  function readCookie(document) {
    var source;
    var entries;
    var index;
    var entry;
    var separator;
    var name;
    if (!document) { return null; }
    try { source = String(document.cookie || ''); }
    catch (_error) { return null; }
    entries = source.split(';');
    for (index = 0; index < entries.length; index += 1) {
      entry = entries[index].replace(/^\s+|\s+$/g, '');
      separator = entry.indexOf('=');
      if (separator < 0) { continue; }
      name = decode(entry.slice(0, separator));
      if (name === COOKIE_NAME) { return decode(entry.slice(separator + 1)); }
    }
    return null;
  }

  function writeCookie(document, value) {
    var expires;
    if (!document) { return; }
    expires = new Date();
    expires.setTime(expires.getTime() + COOKIE_DAYS * 24 * 60 * 60 * 1000);
    try {
      document.cookie = COOKIE_NAME + '=' + encode(String(value || '')) +
        '; expires=' + expires.toUTCString() + '; path=/';
    } catch (_error) {}
  }

  function clearCookie(document) {
    if (!document) { return; }
    try {
      document.cookie = COOKIE_NAME + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } catch (_error) {}
  }

  function readBaseStorage(baseStorage, key) {
    try { return baseStorage && baseStorage.getItem ? baseStorage.getItem(key) : null; }
    catch (_error) { return null; }
  }

  function writeBaseStorage(baseStorage, key, value) {
    try { if (baseStorage && baseStorage.setItem) { baseStorage.setItem(key, value); } }
    catch (_error) {}
  }

  function removeBaseStorage(baseStorage, key) {
    try { if (baseStorage && baseStorage.removeItem) { baseStorage.removeItem(key); } }
    catch (_error) {}
  }

  function cookieStorage(document, baseStorage) {
    return {
      getItem: function (key) {
        return key === AUTH_KEY ? readCookie(document) : readBaseStorage(baseStorage, key);
      },
      setItem: function (key, value) {
        if (key === AUTH_KEY) { writeCookie(document, value); }
        else { writeBaseStorage(baseStorage, key, value); }
      },
      removeItem: function (key) {
        if (key === AUTH_KEY) { clearCookie(document); }
        else { removeBaseStorage(baseStorage, key); }
      }
    };
  }

  function install(rootObject) {
    var vault = rootObject && rootObject.PloffCredentialVault;
    var originalPrepare;
    if (!vault || typeof vault.prepare !== 'function' || hasDb8(rootObject)) { return false; }
    if (vault.__ploffPreviewDevAuthInstalled) { return true; }
    originalPrepare = vault.prepare;
    vault.prepare = function (preparedRoot, baseStorage, callback) {
      var currentRoot = preparedRoot || rootObject;
      var document = currentRoot && currentRoot.document || rootObject.document;
      return originalPrepare(browserRoot(currentRoot), cookieStorage(document, baseStorage), callback);
    };
    vault.__ploffPreviewDevAuthInstalled = true;
    return true;
  }

  return {
    AUTH_KEY: AUTH_KEY,
    COOKIE_NAME: COOKIE_NAME,
    install: install
  };
}));
