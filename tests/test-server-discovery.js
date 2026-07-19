'use strict';

var assert = require('assert');
var Discovery = require('../app/server-discovery');

assert.strictEqual(Discovery.normalizeCandidate('plex.example.com'), 'https://plex.example.com', 'bare public hostnames must default to HTTPS without the Plex LAN port');
assert.strictEqual(Discovery.normalizeCandidate('https://plex.example.com'), 'https://plex.example.com', 'explicit HTTPS endpoints must retain their standard port');
assert.strictEqual(Discovery.normalizeCandidate('plex-host'), 'http://plex-host:32400', 'bare LAN hostnames must default to the Plex LAN port');
assert.strictEqual(Discovery.normalizeCandidate('plex.local'), 'http://plex.local:32400', 'mDNS hostnames must remain local Plex endpoints');
assert.strictEqual(Discovery.isLocalCandidate('http://192.168.1.20:32400'), true, 'private IPv4 Plex endpoints must be recognized as local');
assert.strictEqual(Discovery.isLocalCandidate('http://plex-host:32400'), true, 'single-label Plex hostnames must be recognized as local');
assert.strictEqual(Discovery.isLocalCandidate('https://plex.example.com'), false, 'public Plex domains must remain remote endpoints');
assert.strictEqual(Discovery.isLocalCandidate('http://203.0.113.20:32400'), false, 'public IPv4 Plex endpoints must remain remote endpoints');
assert.strictEqual(Discovery.shouldOfferLocalConnection('http://192.168.1.20:32400', 'https://plex.example'), true, 'a matching LAN server and entered public endpoint must offer an explicit connection choice');
assert.strictEqual(Discovery.shouldOfferLocalConnection('http://192.168.1.20:32400', 'http://192.168.1.21:32400'), false, 'two matching LAN endpoints must not add a redundant choice step');

assert.deepStrictEqual(Discovery.configuredUris({
  apiBaseUrl: 'http://192.168.50.10:32400/',
  discoveryHosts: ['192.168.0.8', 'http://192.168.0.9:32401', 'not a host', '192.168.0.8']
}), [
  'http://192.168.50.10:32400',
  'http://192.168.0.8:32400',
  'http://192.168.0.9:32401'
], 'configured discovery hosts must normalize, default to port 32400, and deduplicate');

assert.deepStrictEqual(Discovery.identityFromXml(
  '<?xml version="1.0" encoding="UTF-8"?><MediaContainer machineIdentifier="machine-a" version="1.43.2"></MediaContainer>',
  'http://192.168.50.10:32400',
  'Configured Plex'
), {
  name: 'Configured Plex',
  uri: 'http://192.168.50.10:32400',
  machineIdentifier: 'machine-a',
  version: '1.43.2',
  source: 'probe'
}, 'identity responses must validate local Plex candidates');

var failedProbe = 'pending';
Discovery.probe({
  XMLHttpRequest: function () {
    this.open = function () { throw new Error('blocked by webview'); };
  }
}, 'http://192.168.50.10:32400', 'Configured Plex', 1000, function (server) { failedProbe = server; });
assert.strictEqual(failedProbe, null, 'a synchronous WebView request failure must degrade to an unavailable discovery candidate');

var failedServiceDiscovery = 'pending';
Discovery.discover({
  XMLHttpRequest: function () {},
  webOS: { service: { request: function () { throw new Error('service unavailable'); } } }
}, {}, function (servers) { failedServiceDiscovery = servers; });
assert.deepStrictEqual(failedServiceDiscovery, [], 'an unavailable webOS discovery service must leave manual and account setup usable');

console.log('Server discovery checks passed');
