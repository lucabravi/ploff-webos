'use strict';

var assert = require('assert');
var ApplicationSession = require('../app/application-session');
var defaults = {
  view: 'home',
  returnView: 'home',
  settings: {},
  config: {},
  activeServer: null,
  activeProfile: null,
  selectedItem: null,
  playbackIdentity: null
};
var session = ApplicationSession.create();
var first;
var second;
var updates = [];
var unsubscribe;
var settings = { uiLanguage: 'it', audioLanguages: ['it'], layout: { density: 'comfortable' } };
var config = { apiBaseUrl: 'http://server', routes: [{ uri: 'http://server' }], features: { directPlay: true } };

assert.deepStrictEqual(session.snapshot(), defaults, 'the default session snapshot must expose only the documented fields');
assert.strictEqual(session.view(), 'home', 'view() must expose the active view without requiring a full session snapshot');
first = session.snapshot();
second = session.snapshot();
assert.notStrictEqual(first, second, 'snapshot() must return a new object');
first.view = 'search';
assert.strictEqual(session.snapshot().view, 'home', 'mutating a snapshot must not mutate the session');

unsubscribe = session.subscribe(function (snapshot) {
  updates.push(snapshot);
});
assert.deepStrictEqual(session.update({ view: 'library', settings: settings, config: config, ignored: 'value' }), {
  view: 'library',
  returnView: 'home',
  settings: settings,
  config: config,
  activeServer: null,
  activeProfile: null,
  selectedItem: null,
  playbackIdentity: null
}, 'update() must perform a shallow update of documented fields only');
assert.strictEqual(session.view(), 'library', 'view() must track view updates');
assert.strictEqual(updates.length, 1, 'a changed field must publish once');
assert.notStrictEqual(updates[0].settings, settings, 'published settings must not expose the producer-owned object');
assert.deepStrictEqual(updates[0].settings, settings, 'published settings must preserve the documented values');
assert.strictEqual(Object.prototype.hasOwnProperty.call(session.snapshot(), 'ignored'), false, 'unknown fields must not enter the shared session');

first = session.snapshot();
first.settings.uiLanguage = 'en';
assert.strictEqual(session.snapshot().settings.uiLanguage, 'it', 'nested snapshot mutations must not alter session settings');
settings.uiLanguage = 'de';
assert.strictEqual(session.snapshot().settings.uiLanguage, 'it', 'mutating an update input after publication must not alter session settings');
settings.audioLanguages.push('en');
settings.layout.density = 'compact';
config.routes[0].uri = 'http://mutated';
config.features.directPlay = false;
assert.deepStrictEqual(session.snapshot().settings.audioLanguages, ['it'], 'nested settings arrays must be isolated from producer mutation');
assert.strictEqual(session.snapshot().settings.layout.density, 'comfortable', 'nested settings records must be isolated from producer mutation');
assert.strictEqual(session.snapshot().config.routes[0].uri, 'http://server', 'nested config arrays must be isolated from producer mutation');
assert.strictEqual(session.snapshot().config.features.directPlay, true, 'nested config records must be isolated from producer mutation');

first = session.snapshot();
first.settings.audioLanguages.push('fr');
first.settings.layout.density = 'expanded';
first.config.routes[0].uri = 'http://consumer';
first.config.features.directPlay = false;
assert.deepStrictEqual(session.snapshot().settings.audioLanguages, ['it'], 'nested settings arrays must be isolated from snapshot consumers');
assert.strictEqual(session.snapshot().settings.layout.density, 'comfortable', 'nested settings records must be isolated from snapshot consumers');
assert.strictEqual(session.snapshot().config.routes[0].uri, 'http://server', 'nested config arrays must be isolated from snapshot consumers');
assert.strictEqual(session.snapshot().config.features.directPlay, true, 'nested config records must be isolated from snapshot consumers');

session.update({
  view: 'library',
  settings: { uiLanguage: 'it', audioLanguages: ['it'], layout: { density: 'comfortable' } },
  config: { apiBaseUrl: 'http://server', routes: [{ uri: 'http://server' }], features: { directPlay: true } }
});
assert.strictEqual(updates.length, 1, 'shallowly unchanged settings and config must not publish');
updates[0].view = 'mutated';
assert.strictEqual(session.snapshot().view, 'library', 'listener snapshots must not expose mutable session state');

unsubscribe();
session.update({ returnView: 'search' });
assert.strictEqual(updates.length, 1, 'unsubscribe must stop publications');
unsubscribe();

session = ApplicationSession.create({ view: 'detail', activeServer: { name: 'Living room' }, extra: true });
assert.strictEqual(session.snapshot().view, 'detail', 'create() must apply documented initial values');
assert.strictEqual(session.snapshot().activeServer.name, 'Living room', 'initial values must preserve the documented data');
first = session.snapshot();
first.activeServer.name = 'Bedroom';
assert.strictEqual(session.snapshot().activeServer.name, 'Living room', 'initial object snapshots must be isolated from consumers');
assert.strictEqual(Object.prototype.hasOwnProperty.call(session.snapshot(), 'extra'), false, 'initial state must reject undocumented fields');

updates = [];
session.subscribe(function (snapshot) { updates.push(snapshot); });
session.destroy();
session.destroy();
session.update({ view: 'home' });
assert.strictEqual(session.snapshot().view, 'home', 'destroy does not make snapshots or updates unsafe');
assert.strictEqual(updates.length, 0, 'destroy must remove subscribers and suppress later publications');
assert.doesNotThrow(function () { session.subscribe(function () {}); }, 'subscribe after destroy must be a safe no-op');

(function cyclicRecordsRemainIsolatedAndComparable() {
  var source = { name: 'cycle' };
  var equivalent = { name: 'cycle' };
  var publications = 0;
  var cyclicSession;
  var snapshot;
  source.self = source;
  equivalent.self = equivalent;
  cyclicSession = ApplicationSession.create({ config: source });
  cyclicSession.subscribe(function () { publications += 1; });
  snapshot = cyclicSession.snapshot();
  assert.notStrictEqual(snapshot.config, source, 'cyclic records must not expose their producer-owned root');
  assert.strictEqual(snapshot.config.self, snapshot.config, 'cyclic records must preserve their internal self-reference in snapshots');
  cyclicSession.update({ config: equivalent });
  assert.strictEqual(publications, 0, 'structurally equivalent cyclic records must not publish a redundant session update');
  cyclicSession.destroy();
}());

console.log('Application session checks passed');
