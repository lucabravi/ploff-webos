(function (root, factory) {
  'use strict';
  var bootstrap;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    bootstrap = factory();
    root.PloffLocaleBootstrap = bootstrap;
    bootstrap.install(root, root.document);
  }
}(this, function () {
  'use strict';

  var SETTINGS_KEYS = ['ploff.settings.v3', 'ploff.settings.v2', 'ploff.settings.v1'];
  var CURRENT_SETTINGS_VERSION = 3;
  var pending = {};

  function primaryLanguage(value) {
    return String(value || '').toLowerCase().replace(/_/g, '-').split('-')[0];
  }

  function canonicalLanguages(I18n) {
    var list;
    if (!I18n || typeof I18n.supportedLanguages !== 'function') { return []; }
    list = I18n.supportedLanguages();
    return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
  }

  function contains(list, value) {
    var index;
    for (index = 0; index < list.length; index += 1) {
      if (String(list[index]) === String(value)) { return true; }
    }
    return false;
  }

  function savedLanguage(storage, supported) {
    var index;
    var raw;
    var parsed;
    var candidate;
    if (!storage || typeof storage.getItem !== 'function') { return ''; }
    for (index = 0; index < SETTINGS_KEYS.length; index += 1) {
      try {
        raw = storage.getItem(SETTINGS_KEYS[index]);
        if (!raw) { continue; }
        parsed = JSON.parse(raw);
        if (parsed && Number(parsed.version) > CURRENT_SETTINGS_VERSION) { continue; }
        candidate = primaryLanguage(parsed && parsed.uiLanguage);
        return candidate && contains(supported, candidate) ? candidate : 'en';
      } catch (_error) { continue; }
    }
    return '';
  }

  function normalizeLanguage(I18n, value) {
    var supported = canonicalLanguages(I18n);
    var candidate = primaryLanguage(value);
    if (candidate && contains(supported, candidate)) { return candidate; }
    return 'en';
  }

  function resolveLanguage(I18n, target) {
    var supported = canonicalLanguages(I18n);
    var environment = target || {};
    var saved = savedLanguage(environment.localStorage, supported);
    var device;
    if (saved) { return saved; }
    device = primaryLanguage(environment.navigator && environment.navigator.language);
    if (device && contains(supported, device)) { return device; }
    return 'en';
  }

  function scriptUrl(language, cacheKey) {
    return 'locales/' + primaryLanguage(language) + '.js?v=' + String(cacheKey || 'dev');
  }

  function cacheKeyFromDocument(document) {
    var scripts = document && typeof document.getElementsByTagName === 'function'
      ? document.getElementsByTagName('script')
      : [];
    var index;
    var source;
    var match;
    for (index = scripts.length - 1; index >= 0; index -= 1) {
      source = typeof scripts[index].getAttribute === 'function'
        ? scripts[index].getAttribute('src')
        : scripts[index].src;
      match = String(source || '').match(/\?v=([^#&]*)/);
      if (match && match[1]) { return match[1]; }
    }
    return 'dev';
  }

  function hasStaticLocaleTag(document) {
    if (!document || typeof document.querySelector !== 'function') { return false; }
    try { return !!document.querySelector('script[src*="locales/"]'); }
    catch (_error) { return false; }
  }

  function registered(I18n, language) {
    return !!I18n && typeof I18n.has === 'function' && I18n.has(language) === true;
  }

  function install(root, document) {
    var I18n;
    var language;
    if (!root || !document || typeof document.write !== 'function') { return false; }
    I18n = root.PloffI18n;
    if (!I18n || typeof I18n.register !== 'function') { return false; }
    if (hasStaticLocaleTag(document)) { return false; }
    language = resolveLanguage(I18n, root);
    if (registered(I18n, language)) { return false; }
    document.write('<script src="' + scriptUrl(language, cacheKeyFromDocument(document)) + '"></scr' + 'ipt>');
    return true;
  }

  function notify(callbacks, success) {
    var index;
    for (index = 0; index < callbacks.length; index += 1) {
      try { if (typeof callbacks[index] === 'function') { callbacks[index](success); } }
      catch (_error) {}
    }
  }

  function settle(language, success) {
    var callbacks = pending[language] || [];
    delete pending[language];
    notify(callbacks, success === true);
  }

  function ensure(root, document, language, callback) {
    var I18n = root && root.PloffI18n;
    var normalized = normalizeLanguage(I18n, language);
    var script;
    var parent;
    var done = false;
    function finish(success) {
      if (done) { return; }
      done = true;
      if (script) { script.onload = null; script.onerror = null; }
      settle(normalized, success && registered(I18n, normalized));
    }
    if (typeof callback !== 'function') { callback = function () {}; }
    if (!I18n || typeof I18n.register !== 'function' || !document || typeof document.createElement !== 'function') {
      callback(false);
      return false;
    }
    if (registered(I18n, normalized)) { callback(true); return true; }
    if (pending[normalized]) { pending[normalized].push(callback); return true; }
    pending[normalized] = [callback];
    try {
      script = document.createElement('script');
      script.async = true;
      script.src = scriptUrl(normalized, cacheKeyFromDocument(document));
      script.onload = function () { finish(true); };
      script.onerror = function () { finish(false); };
      parent = document.head || document.body || document.documentElement;
      if (!parent || typeof parent.appendChild !== 'function') { finish(false); return true; }
      parent.appendChild(script);
    } catch (_error) { finish(false); }
    return true;
  }

  return {
    cacheKeyFromDocument: cacheKeyFromDocument,
    ensure: ensure,
    install: install,
    normalizeLanguage: normalizeLanguage,
    resolveLanguage: resolveLanguage,
    scriptUrl: scriptUrl
  };
}));
