'use strict';

var assert = require('assert');
var PlexSourceRouter = require('../app/coordinator/plex-source-router');

var liveContexts = {
  'server-b': {
    serverMachineIdentifier: 'server-b',
    serverName: 'Shared',
    apiBaseUrl: 'https://b.example',
    token: 'b-token',
    requestTimeout: 4200,
    primary: false
  }
};
var primary = {
  serverMachineIdentifier: 'server-a',
  serverName: 'Primary',
  apiBaseUrl: 'https://a.example',
  token: 'a-token',
  requestTimeout: 3200,
  primary: true
};
var router = PlexSourceRouter.create({
  config: {
    apiBaseUrl: 'https://primary-config.example',
    token: 'primary-config-token',
    requestTimeout: 8000,
    itemLimit: 77
  },
  sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return liveContexts[machine] || null; }
  }
});

var liveRoute = router.routeFor({
  ratingKey: '42',
  serverMachineIdentifier: 'server-b',
  sourceId: 'server-b|9'
}, {
  serverMachineIdentifier: 'server-a',
  apiBaseUrl: 'https://wrong.example',
  token: 'wrong-token'
});
assert.ok(liveRoute, 'a live owner context must route an explicitly owned media item');
assert.strictEqual(liveRoute.context.serverMachineIdentifier, 'server-b');
assert.strictEqual(liveRoute.context.sourceId, 'server-b|9', 'item sourceId must survive canonical owner resolution');
assert.strictEqual(liveRoute.config.apiBaseUrl, 'https://b.example');
assert.strictEqual(liveRoute.config.token, 'b-token');
assert.strictEqual(liveRoute.config.itemLimit, 77, 'non-transport application config must remain inherited');
assert.strictEqual(liveRoute.identity, 'server:server-b', 'ownership identity must be server-scoped and credential-free');

liveContexts['server-b'] = null;
var explicitEmptyToken = router.configFor({ serverMachineIdentifier: 'server-b' }, {
  serverMachineIdentifier: 'server-b',
  apiBaseUrl: 'https://relay.example',
  token: '',
  requestTimeout: 5000
});
assert.ok(explicitEmptyToken, 'a matching candidate source context must remain usable without a cached live context');
assert.strictEqual(explicitEmptyToken.apiBaseUrl, 'https://relay.example');
assert.strictEqual(explicitEmptyToken.token, '', 'an explicit empty external token must never inherit primary credentials');
assert.strictEqual(explicitEmptyToken.requestTimeout, 5000);

assert.strictEqual(router.configFor({ serverMachineIdentifier: 'server-b' }, {
  serverMachineIdentifier: 'server-a',
  apiBaseUrl: 'https://a.example',
  token: 'a-token'
}), null, 'a mismatched source context must never fall back to primary transport');
assert.strictEqual(router.contextForItem({ serverMachineIdentifier: 'server-b' }, null), null, 'an unresolved explicit owner must fail closed');
assert.strictEqual(router.identityFor({ serverMachineIdentifier: 'server-b' }, null), 'server:server-b', 'owner identity must remain stable even while the explicit owner route is unavailable');
assert.strictEqual(router.configFor({ serverMachineIdentifier: 'server-b' }, {
  serverMachineIdentifier: 'server-b',
  apiBaseUrl: '',
  token: 'external-token'
}), null, 'an explicit owner without a usable route must fail closed');

var primaryRoute = router.routeFor({ ratingKey: '1' }, null);
assert.ok(primaryRoute, 'ownerless primary media may use the primary route');
assert.strictEqual(primaryRoute.context.serverMachineIdentifier, 'server-a');
assert.strictEqual(primaryRoute.config.apiBaseUrl, 'https://a.example');
assert.strictEqual(primaryRoute.config.token, 'a-token');
assert.strictEqual(primaryRoute.identity, 'server:server-a');

var enabledServers = { 'server-a': true, 'server-b': true };
var guardedRouter = PlexSourceRouter.create({
  config: { itemLimit: 77 },
  sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) {
      if (machine === 'server-a') { return primary; }
      if (machine === 'server-b') {
        return {
          serverMachineIdentifier: 'server-b',
          apiBaseUrl: 'https://b.example',
          token: 'b-token'
        };
      }
      return null;
    },
    serverEnabled: function (machine) { return enabledServers[machine] !== false; }
  }
});
var staleServerBContext = {
  serverMachineIdentifier: 'server-b',
  apiBaseUrl: 'https://stale-b.example',
  token: 'stale-b-token'
};
enabledServers['server-b'] = false;
assert.strictEqual(
  guardedRouter.routeFor({ ratingKey: 'stale-b', serverMachineIdentifier: 'server-b' }, staleServerBContext),
  null,
  'a stale matching context must not bypass a disabled PMS'
);
enabledServers['server-a'] = false;
assert.strictEqual(
  guardedRouter.routeFor({ ratingKey: 'ownerless' }, null),
  null,
  'ownerless media must not silently fall back to a disabled primary PMS'
);

var availableServers = { 'server-a': true, 'server-b': false };
var availabilityGuardedRouter = PlexSourceRouter.create({
  config: { itemLimit: 77 },
  sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function () { return null; },
    serverEnabled: function () { return true; },
    serverAvailable: function (machine) { return availableServers[machine] !== false; }
  }
});
assert.strictEqual(
  availabilityGuardedRouter.routeFor({ ratingKey: 'offline-b', serverMachineIdentifier: 'server-b' }, staleServerBContext),
  null,
  'a stale matching context must not remain routable after the PMS is known offline'
);


assert.strictEqual(router.decorateItem(null, { serverMachineIdentifier: 'server-b' }), null, 'ownership decoration must preserve an absent media record');
var ownerlessShared = { ratingKey: 'ownerless-shared', title: 'Shared item' };
var decoratedShared = router.decorateItem(ownerlessShared, {
  sourceId: 'server-b|4',
  serverMachineIdentifier: 'server-b',
  serverName: 'Shared',
  apiBaseUrl: 'https://relay.example',
  token: 'secret-token'
});
assert.notStrictEqual(decoratedShared, ownerlessShared, 'decorating ownership must not mutate the original media record');
assert.strictEqual(decoratedShared.serverMachineIdentifier, 'server-b', 'an ownerless media record must retain the candidate PMS identifier');
assert.strictEqual(decoratedShared.sourceId, 'server-b|4', 'an ownerless media record must retain the candidate source identity');
assert.strictEqual(decoratedShared.serverName, 'Shared', 'an ownerless media record may retain the display server name');
assert.strictEqual(decoratedShared.token, undefined, 'media ownership decoration must never copy Plex credentials into the media record');
assert.strictEqual(decoratedShared.apiBaseUrl, undefined, 'media ownership decoration must never copy transport URLs into the media record');
assert.strictEqual(ownerlessShared.serverMachineIdentifier, undefined, 'ownership decoration must leave the original item unchanged');
var explicitDifferentOwner = router.decorateItem({ ratingKey: 'explicit-c', serverMachineIdentifier: 'server-c' }, {
  sourceId: 'server-b|4',
  serverMachineIdentifier: 'server-b',
  serverName: 'Shared'
});
assert.strictEqual(explicitDifferentOwner.serverMachineIdentifier, 'server-c', 'an explicit media owner must never be overwritten by a different candidate PMS');
assert.strictEqual(explicitDifferentOwner.sourceId, undefined, 'metadata from a mismatched candidate PMS must not be attached to an explicitly owned item');

var firstIdentity = PlexSourceRouter.contextIdentity({
  serverMachineIdentifier: 'server-b',
  sourceId: 'server-b|9',
  apiBaseUrl: 'https://relay-a.example',
  token: 'token-one',
  requestTimeout: 4000
});
var secondIdentity = PlexSourceRouter.contextIdentity({
  serverMachineIdentifier: 'server-b',
  sourceId: 'server-b|4',
  apiBaseUrl: 'https://direct-b.example',
  token: 'token-two',
  requestTimeout: 9000
});
assert.strictEqual(firstIdentity, secondIdentity, 'route/token/library changes on one PMS must not change ownership identity');
assert.strictEqual(firstIdentity.indexOf('token-one'), -1, 'ownership identity must never include credentials');
assert.notStrictEqual(firstIdentity, PlexSourceRouter.contextIdentity({ serverMachineIdentifier: 'server-c' }), 'different PMS owners must remain distinct');
assert.strictEqual(PlexSourceRouter.contextIdentity({ sourceId: 'orphan-source' }), 'source:orphan-source', 'sourceId is the fallback identity when the server identifier is unavailable');

console.log('Plex source router checks passed');
