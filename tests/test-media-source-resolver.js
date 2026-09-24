'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var PlexSourceRouter = require('../app/coordinator/plex-source-router');
var MultiServerMedia = require('../app/multi-server-media');

assert.ok(fs.existsSync(path.join(__dirname, '../app/coordinator/media-source-resolver.js')),
  'logical media resolution must have one independently testable owner');
var MediaSourceResolver = require('../app/coordinator/media-source-resolver');

function copy(machine, key) {
  return MultiServerMedia.decorateItem({
    ratingKey: key || machine + '-copy', type: 'movie', guid: 'plex://movie/shared',
    librarySectionID: machine + '-library', image: '/' + machine + '-poster',
    art: '/' + machine + '-art', thumb: '/' + machine + '-thumb'
  }, { serverMachineIdentifier: machine, serverName: machine, primary: machine === 'a' });
}

function fixture() {
  var enabled = { a: true, b: true, c: true };
  var contexts = {};
  var config = { apiBaseUrl: 'https://primary.example', token: 'primary-token', itemLimit: 12 };
  ['a', 'b', 'c'].forEach(function (machine) {
    contexts[machine] = {
      serverMachineIdentifier: machine, apiBaseUrl: 'https://' + machine + '.example',
      token: 'token-' + machine, sourceId: machine + '|' + machine + '-library'
    };
  });
  var router = PlexSourceRouter.create({
    config: config,
    sources: {
      serverEnabled: function (machine) { return enabled[machine] === true; },
      primaryContext: function () { return contexts.a; },
      contextForMachine: function (machine) { return enabled[machine] ? contexts[machine] : null; }
    }
  });
  var routeFor = router.routeFor;
  var calls = [];
  router.routeFor = function (item, context) {
    calls.push({ item: item, context: context });
    return routeFor(item, context);
  };
  return {
    resolver: MediaSourceResolver.create({ sourceRouter: router }),
    router: router, calls: calls, contexts: contexts, enabled: enabled, config: config
  };
}

(function requiresTheConcreteRouter() {
  assert.throws(function () { MediaSourceResolver.create({}); }, /sourceRouter/);
}());

(function singleServerIsOneRouterCallWithoutTouchingVariants() {
  var f = fixture();
  var item = copy('a');
  Object.defineProperty(item, 'sourceVariants', { get: function () {
    throw new Error('single-server fast path must not enumerate or project variants');
  } });
  var result = f.resolver.resolve(item);
  assert.strictEqual(result.item, item, 'a direct route must preserve item identity');
  assert.strictEqual(result.route.config.token, 'token-a');
  assert.strictEqual(result.fallback, false);
  assert.strictEqual(f.calls.length, 1);
}());

(function rebasesTheWholeItemAndNeverChangesPrimaryConfiguration() {
  var f = fixture();
  var item = MultiServerMedia.mergeSourceVariants(copy('b'), copy('a'));
  var before = JSON.parse(JSON.stringify(item));
  var config = JSON.parse(JSON.stringify(f.config));
  f.enabled.b = false;
  var result = f.resolver.resolve(item, { candidateContext: f.contexts.b });
  assert.strictEqual(result.item.ratingKey, 'a-copy');
  assert.strictEqual(result.item.serverMachineIdentifier, 'a');
  assert.strictEqual(result.item.sourceId, 'a|a-library');
  assert.strictEqual(result.item.image, '/a-poster');
  assert.strictEqual(result.item.art, '/a-art');
  assert.strictEqual(result.item.thumb, '/a-thumb');
  assert.strictEqual(result.item.primarySource, true);
  assert.strictEqual(result.item.sourceVariants.length, 2);
  assert.strictEqual(result.route.config.token, 'token-a');
  assert.strictEqual(result.route.config.itemLimit, 12);
  assert.strictEqual(result.route.identity, 'server:a');
  assert.strictEqual(result.fallback, true);
  assert.deepStrictEqual(item, before);
  assert.deepStrictEqual(f.config, config);
  result.item.sourceVariants[0].ratingKey = 'changed';
  assert.deepStrictEqual(item, before, 'projected variants must not alias the original records');
  assert.strictEqual(f.resolver.resolve(copy('b'), { candidateContext: f.contexts.b }), null,
    'an explicit disabled context must not rescue a B-only item');
}());

(function availabilityAndPreferenceAreReevaluatedWithoutCaching() {
  var f = fixture();
  var item = MultiServerMedia.mergeSourceVariants(copy('a'), copy('b'));
  var options = { preferredMachine: 'b', candidateContext: f.contexts.a };
  assert.strictEqual(f.resolver.resolve(item, options).item.ratingKey, 'b-copy');
  f.enabled.b = false;
  assert.strictEqual(f.resolver.resolve(item, options).item.ratingKey, 'a-copy');
  assert.strictEqual(f.resolver.resolve(item, options).fallback, true);
  assert.deepStrictEqual(f.resolver.available(item).map(function (entry) {
    return entry.item.serverMachineIdentifier;
  }), ['a']);
  f.enabled.b = true;
  f.contexts.b = {
    serverMachineIdentifier: 'b', apiBaseUrl: 'https://new-b.example', token: ''
  };
  var result = f.resolver.resolve(item, options);
  assert.strictEqual(result.item.ratingKey, 'b-copy');
  assert.strictEqual(result.route.config.apiBaseUrl, 'https://new-b.example');
  assert.strictEqual(result.route.config.token, '', 'an explicit empty token must not inherit the primary token');
  assert.strictEqual(result.fallback, false);
  assert.strictEqual(options.preferredMachine, 'b', 'temporary fallback must not rewrite caller intent');
}());

(function ownerBeatsSessionAffinityButKnownPreferenceBeatsOwner() {
  var f = fixture();
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.mergeSourceVariants(copy('b'), copy('a')), copy('c'));
  assert.strictEqual(f.resolver.resolve(item, { candidateContext: f.contexts.c }).item.ratingKey, 'b-copy');
  assert.strictEqual(f.resolver.resolve(item, { preferredMachine: 'a', candidateContext: f.contexts.c }).item.ratingKey, 'a-copy');
  f.enabled.b = false;
  assert.strictEqual(f.resolver.resolve(item, { candidateContext: f.contexts.c }).item.ratingKey, 'c-copy');
  assert.strictEqual(f.resolver.resolve(item).item.ratingKey, 'a-copy', 'without affinity preserve variant order');
  f.enabled.b = true;
  assert.strictEqual(f.resolver.resolve(item, { preferredMachine: 'missing' }).item.ratingKey, 'b-copy');
  assert.strictEqual(f.resolver.resolve(item, { preferredMachine: 'missing' }).fallback, false);
}());

(function malformedAndDuplicateVariantsCannotBorrowTheOwnerIdentity() {
  var f = fixture();
  var item = copy('b');
  item.sourceVariants = [null, {}, { serverMachineIdentifier: 'a' },
    { serverMachineIdentifier: 'a', ratingKey: '' }, copy('b'), copy('a'), copy('a')];
  f.enabled.b = false;
  var available = f.resolver.available(item);
  assert.deepStrictEqual(available.map(function (entry) { return entry.item.ratingKey; }), ['a-copy']);
  assert.strictEqual(f.calls.filter(function (entry) {
    return entry.item.serverMachineIdentifier === 'a';
  }).length, 1, 'duplicate concrete identities must be routed once');
  assert.strictEqual(f.resolver.resolve(null), null);
  assert.strictEqual(f.resolver.resolve('a-copy'), null);
  assert.deepStrictEqual(f.resolver.available(null), []);
  item.sourceVariants = [{ serverMachineIdentifier: 'a' }];
  assert.strictEqual(f.resolver.resolve(item), null, 'an incomplete variant cannot use B ratingKey against A');
}());

(function copiesOnTheSamePmsRetainTheirExactRatingKeys() {
  var f = fixture();
  var item = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.mergeSourceVariants(copy('b'), copy('a', 'a-one')), copy('a', 'a-two'));
  f.enabled.b = false;
  var available = f.resolver.available(item);
  assert.deepStrictEqual(available.map(function (entry) { return entry.item.ratingKey; }), ['a-one', 'a-two']);
}());

(function enabledStatePreferenceAndAffinityMatrix() {
  var f = fixture();
  var machines = ['a', 'b', 'c'];
  var preferences = ['', 'a', 'b', 'c', 'unknown'];
  var affinities = ['', 'a', 'b', 'c'];
  var cases = 0;
  for (var mask = 0; mask < 8; mask += 1) {
    machines.forEach(function (machine, index) { f.enabled[machine] = (mask & (1 << index)) !== 0; });
    machines.forEach(function (owner) {
      var item = copy(owner);
      machines.forEach(function (machine) {
        if (machine !== owner) { item = MultiServerMedia.mergeSourceVariants(item, copy(machine)); }
      });
      preferences.forEach(function (preferred) {
        affinities.forEach(function (affinity) {
          var desired = machines.indexOf(preferred) !== -1 ? preferred : owner;
          var order = [desired, owner, affinity].concat(item.sourceVariants.map(function (variant) {
            return variant.serverMachineIdentifier;
          }));
          var expected = order.filter(function (machine) { return machine && f.enabled[machine]; })[0] || '';
          var result = f.resolver.resolve(item, {
            preferredMachine: preferred, candidateContext: f.contexts[affinity] || null
          });
          assert.strictEqual(result && result.item.serverMachineIdentifier || '', expected);
          if (result) {
            assert.strictEqual(result.item.ratingKey, expected + '-copy');
            assert.strictEqual(result.route.config.token, 'token-' + expected);
            assert.strictEqual(result.fallback, expected !== desired);
          }
          cases += 1;
        });
      });
    });
  }
  assert.strictEqual(cases, 480);
}());

console.log('Media source resolver checks passed (including 480 lifecycle/preference/affinity cases)');

(function sparseFallbackCannotCarryAnotherPmsLibraryOrArtwork() {
  var f = fixture();
  var sparse = { serverMachineIdentifier: 'a', ratingKey: 'a-sparse', sourceId: '', guid: 'plex://movie/shared' };
  var item = MultiServerMedia.mergeSourceVariants(copy('b'), sparse);
  f.enabled.b = false;
  var result = f.resolver.resolve(item);
  assert.strictEqual(result.item.ratingKey, 'a-sparse');
  assert.strictEqual(result.item.sourceId, '', 'missing library identity must not retain the disabled PMS sourceId');
  assert.strictEqual(result.item.image, '');
  assert.strictEqual(result.item.art, '');
  assert.strictEqual(result.route.context.sourceId, 'a|a-library', 'live A context must not be overwritten with B library identity');
  assert.strictEqual(result.route.config.token, 'token-a');
}());
