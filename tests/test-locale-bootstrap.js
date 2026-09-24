'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Bootstrap = require('../app/locale-bootstrap');

function fakeI18n(codes) {
  var registered = {};
  (codes || []).forEach(function (code) { registered[String(code)] = true; });
  return {
    registered: registered,
    register: function () {},
    has: function (code) { return registered[String(code)] === true; },
    supportedLanguages: function () { return ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko']; }
  };
}

function fakeStorage(values) {
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    }
  };
}

function fakeDocument(options) {
  var values = options || {};
  var state = {
    created: [],
    written: [],
    scripts: values.scripts || [],
    localeTag: values.localeTag || null,
    withWrite: values.withWrite !== false,
    withQuery: values.withQuery !== false,
    withCreate: values.withCreate !== false,
    head: values.head === undefined ? { appendChild: function (script) { script.appended = true; } } : values.head,
    body: values.body,
    documentElement: values.documentElement
  };
  var document = {
    getElementsByTagName: function () { return state.scripts; },
    createElement: function () {
      var script = {};
      state.created.push(script);
      return script;
    }
  };
  if (state.withWrite) {
    document.write = function (html) { state.written.push(String(html)); };
  }
  if (state.withQuery) {
    document.querySelector = function () { return state.localeTag; };
  }
  if (!state.withCreate) { delete document.createElement; }
  if (state.head !== undefined) { document.head = state.head; }
  if (state.body !== undefined) { document.body = state.body; }
  if (state.documentElement !== undefined) { document.documentElement = state.documentElement; }
  document.state = state;
  return document;
}

(function resolveLanguagePrefersSavedSettings() {
  var I18n = fakeI18n([]);
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({ 'ploff.settings.v3': JSON.stringify({ uiLanguage: 'it' }) })
  }), 'it', 'startup must preload the persisted interface language');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({ 'ploff.settings.v2': JSON.stringify({ uiLanguage: 'fr' }) })
  }), 'fr', 'startup must fall back to older persisted settings keys');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({
      'ploff.settings.v3': '{corrupt',
      'ploff.settings.v1': JSON.stringify({ uiLanguage: 'de' })
    })
  }), 'de', 'a corrupt settings record must not block older persisted languages');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({ 'ploff.settings.v3': JSON.stringify({ uiLanguage: 'xx' }) }),
    navigator: { language: 'es-ES' }
  }), 'en', 'a valid current settings record with an unsupported language must match Settings.load and fall back to English');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({
      'ploff.settings.v3': JSON.stringify({ uiLanguage: 'xx' }),
      'ploff.settings.v2': JSON.stringify({ uiLanguage: 'it' })
    }),
    navigator: { language: 'es-ES' }
  }), 'en', 'a valid current settings record must not fall through to stale legacy settings');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({
      'ploff.settings.v3': JSON.stringify({}),
      'ploff.settings.v2': JSON.stringify({ uiLanguage: 'it' })
    }),
    navigator: { language: 'es-ES' }
  }), 'en', 'a current settings record without uiLanguage must use the same English default as Settings.load');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({
      'ploff.settings.v3': JSON.stringify({ version: 99, uiLanguage: 'it' }),
      'ploff.settings.v2': JSON.stringify({ version: 2, uiLanguage: 'fr' })
    }),
    navigator: { language: 'es-ES' }
  }), 'fr', 'settings from a newer schema must be skipped just like Settings.load during a downgrade');
}());

(function resolveLanguageFallsBackToDeviceAndEnglish() {
  var I18n = fakeI18n([]);
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({}),
    navigator: { language: 'pt-BR' }
  }), 'pt', 'startup must normalize regional device languages to the shipped locale file');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {
    localStorage: fakeStorage({}),
    navigator: { language: 'xx-YY' }
  }), 'en', 'an unsupported device language must fall back to English');
  assert.strictEqual(Bootstrap.resolveLanguage(I18n, {}), 'en', 'startup without storage or navigator must fall back to English');
  assert.strictEqual(Bootstrap.resolveLanguage(null, {}), 'en', 'startup without the locale registry must still resolve English');
}());

(function normalizeLanguageAndScriptUrl() {
  var I18n = fakeI18n([]);
  assert.strictEqual(Bootstrap.normalizeLanguage(I18n, 'IT'), 'it', 'locale resolution must be case-insensitive');
  assert.strictEqual(Bootstrap.normalizeLanguage(I18n, 'xx'), 'en', 'unknown languages must normalize to English');
  assert.strictEqual(Bootstrap.normalizeLanguage(null, 'it'), 'en', 'normalization without the registry must stay safe');
  assert.strictEqual(Bootstrap.scriptUrl('it', 'cache-1'), 'locales/it.js?v=cache-1', 'locale scripts must reuse the shell cache key');
  assert.strictEqual(Bootstrap.scriptUrl('pt-BR', null), 'locales/pt.js?v=dev', 'locale URLs must normalize regional codes');
}());

(function cacheKeyFromDocument() {
  assert.strictEqual(Bootstrap.cacheKeyFromDocument(fakeDocument({
    scripts: [{ src: 'core.js?v=key-1' }, { src: 'app.js?v=key-2' }]
  })), 'key-2', 'locale bootstrap must reuse the newest sibling startup cache key');
  assert.strictEqual(Bootstrap.cacheKeyFromDocument(fakeDocument({
    scripts: [{ getAttribute: function () { return 'locale-bootstrap.js?v=key-9'; } }]
  })), 'key-9', 'cache-key detection must support getAttribute script handles');
  assert.strictEqual(Bootstrap.cacheKeyFromDocument(fakeDocument({ scripts: [] })), 'dev', 'missing cache keys must fall back to dev');
  assert.strictEqual(Bootstrap.cacheKeyFromDocument(null), 'dev', 'missing documents must fall back to dev');
}());

(function installGuards() {
  var I18n = fakeI18n([]);
  var root = { PloffI18n: I18n, localStorage: fakeStorage({}), navigator: { language: 'en' } };
  assert.strictEqual(Bootstrap.install(null, fakeDocument()), false, 'install without a root must stay inert');
  assert.strictEqual(Bootstrap.install(root, null), false, 'install without a document must stay inert');
  assert.strictEqual(Bootstrap.install(root, fakeDocument({ withWrite: false })), false, 'install without document.write must stay inert');
  assert.strictEqual(Bootstrap.install({}, fakeDocument()), false, 'install without the locale registry must stay inert');
  assert.strictEqual(Bootstrap.install({ PloffI18n: {} }, fakeDocument()), false, 'install without registry support must stay inert');
  assert.strictEqual(Bootstrap.install(root, fakeDocument({ localeTag: {} })), false, 'install must skip shells with static locale scripts');
  assert.strictEqual(Bootstrap.install(
    { PloffI18n: fakeI18n(['en']), localStorage: fakeStorage({}) },
    fakeDocument()
  ), false, 'install must skip languages that are already registered');
}());

(function installWritesTheResolvedLocale() {
  var I18n = fakeI18n([]);
  var root = {
    PloffI18n: I18n,
    localStorage: fakeStorage({ 'ploff.settings.v3': JSON.stringify({ uiLanguage: 'it' }) }),
    navigator: { language: 'en' }
  };
  var document = fakeDocument({ scripts: [{ src: 'core.js?v=prod-key' }] });
  assert.strictEqual(Bootstrap.install(root, document), true, 'install must synchronously preload the resolved locale');
  assert.deepStrictEqual(document.state.written, ['<script src="locales/it.js?v=prod-key"></script>'],
    'install must document.write the resolved locale with the shell cache key');
}());

(function ensureUsesRegisteredLocalesImmediately() {
  var I18n = fakeI18n(['it']);
  var document = fakeDocument();
  var results = [];
  assert.strictEqual(Bootstrap.ensure({ PloffI18n: I18n }, document, 'it', function (success) { results.push(success); }), true,
    'ensure must accept already registered locales');
  assert.deepStrictEqual(results, [true], 'registered locales must resolve without network work');
  assert.strictEqual(document.state.created.length, 0, 'registered locales must not inject scripts');
}());

(function ensureRejectsUnsupportedEnvironments() {
  var I18n = fakeI18n([]);
  var results = [];
  assert.strictEqual(Bootstrap.ensure({}, fakeDocument(), 'it', function (success) { results.push(success); }), false,
    'ensure without the registry must fail fast');
  assert.strictEqual(Bootstrap.ensure({ PloffI18n: I18n }, fakeDocument({ withCreate: false }), 'it', function (success) { results.push(success); }), false,
    'ensure without script injection must fail fast');
  assert.deepStrictEqual(results, [false, false], 'failed ensure calls must still notify their callback');
}());

(function ensureLoadsMissingLocalesOnce() {
  var I18n = fakeI18n([]);
  var document = fakeDocument();
  var first = [];
  var second = [];
  var root = { PloffI18n: I18n };
  assert.strictEqual(Bootstrap.ensure(root, document, 'ja', function (success) { first.push(success); }), true,
    'ensure must start loading a missing locale');
  assert.strictEqual(Bootstrap.ensure(root, document, 'ja', function (success) { second.push(success); }), true,
    'concurrent ensure calls must share one locale request');
  assert.strictEqual(document.state.created.length, 1, 'concurrent ensure calls must inject a single script');
  assert.strictEqual(document.state.created[0].async, true, 'locale scripts must load asynchronously');
  assert.strictEqual(document.state.created[0].src, 'locales/ja.js?v=dev', 'locale scripts must target the normalized locale file');
  assert.strictEqual(document.state.created[0].appended, true, 'locale scripts must attach to the document');
  I18n.registered.ja = true;
  document.state.created[0].onload();
  assert.deepStrictEqual(first, [true], 'the first waiter must observe the loaded locale');
  assert.deepStrictEqual(second, [true], 'the second waiter must observe the loaded locale');
  assert.strictEqual(document.state.created[0].onload, null, 'settled loaders must release their handlers');
}());

(function ensureVerifiesRegistrationAndFailures() {
  var I18n = fakeI18n([]);
  var root = { PloffI18n: I18n };
  var document = fakeDocument();
  var results = [];
  Bootstrap.ensure(root, document, 'ko', function (success) { results.push(success); });
  document.state.created[0].onload();
  assert.deepStrictEqual(results, [false], 'a load without registration must report failure');

  results = [];
  Bootstrap.ensure(root, document, 'ko', function (success) { results.push(success); });
  assert.strictEqual(document.state.created.length, 2, 'a failed locale must be retryable');
  document.state.created[1].onerror();
  assert.deepStrictEqual(results, [false], 'a script error must report failure');

  results = [];
  var orphan = fakeDocument();
  delete orphan.head;
  Bootstrap.ensure(root, orphan, 'ko', function (success) { results.push(success); });
  assert.deepStrictEqual(results, [false], 'a locale without an injection parent must report failure');

  results = [];
  Bootstrap.ensure(root, document, 'xx', function (success) { results.push(success); });
  assert.strictEqual(document.state.created[2].src, 'locales/en.js?v=dev', 'unknown languages must load the English fallback');
}());

(function ensureIsolatesCallbackFailures() {
  var I18n = fakeI18n([]);
  var root = { PloffI18n: I18n };
  var document = fakeDocument();
  var second = [];
  Bootstrap.ensure(root, document, 'fr', function () { throw new Error('waiter failed'); });
  Bootstrap.ensure(root, document, 'fr', function (success) { second.push(success); });
  I18n.registered.fr = true;
  document.state.created[0].onload();
  assert.deepStrictEqual(second, [true], 'a throwing waiter must not starve the remaining locale waiters');
}());

(function browserBootstrapInstallsTheStartupLocaleAutomatically() {
  var written = [];
  var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'locale-bootstrap.js'), 'utf8');
  var context = {
    PloffI18n: fakeI18n([]),
    localStorage: fakeStorage({ 'ploff.settings.v3': JSON.stringify({ uiLanguage: 'it' }) }),
    navigator: { language: 'en' },
    document: {
      querySelector: function () { return null; },
      getElementsByTagName: function () { return [{ src: 'locale-bootstrap.js?v=prod-key' }]; },
      write: function (html) { written.push(String(html)); }
    }
  };
  vm.runInNewContext(source, context, { filename: 'locale-bootstrap.js' });
  assert.ok(context.PloffLocaleBootstrap, 'browser bootstrap must expose its runtime API');
  assert.deepStrictEqual(written, ['<script src="locales/it.js?v=prod-key"></script>'],
    'browser bootstrap must synchronously install the persisted locale before the following application script runs');
}());

console.log('Locale bootstrap checks passed');
