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

var activeProbeXhr = null;
var activeProbeCallbacks = 0;
var activeProbe = Discovery.probe({
  XMLHttpRequest: function () {
    activeProbeXhr = this;
    this.open = function () {};
    this.send = function () {};
    this.abort = function () { this.aborted = true; };
  }
}, 'http://192.168.50.11:32400', 'Cancelable Plex', 1000, function () { activeProbeCallbacks += 1; });
assert.strictEqual(typeof activeProbe.abort, 'function', 'manual probes must expose the cancellation handle expected by their feature owner');
activeProbe.abort();
assert.strictEqual(activeProbeXhr.aborted, true, 'cancelling a manual probe must abort its native XHR');
assert.strictEqual(activeProbeXhr.onreadystatechange, null, 'cancelled probes must release their ready-state callback');
assert.strictEqual(activeProbeXhr.onerror, null, 'cancelled probes must release their network callback');
assert.strictEqual(activeProbeXhr.ontimeout, null, 'cancelled probes must release their timeout callback');
assert.strictEqual(activeProbeCallbacks, 0, 'cancelled probes must not report an unavailable server after their owner has left');

var failedServiceDiscovery = 'pending';
Discovery.discover({
  XMLHttpRequest: function () {},
  webOS: { service: { request: function () { throw new Error('service unavailable'); } } }
}, {}, function (servers) { failedServiceDiscovery = servers; });
assert.deepStrictEqual(failedServiceDiscovery, [], 'an unavailable webOS discovery service must leave manual and account setup usable');

var serviceRequest = null;
var serviceDiscovery = 'pending';
Discovery.discover({
  XMLHttpRequest: function () {},
  webOS: {
    service: {
      request: function (service, options) {
        serviceRequest = { service: service, method: options.method };
        options.onSuccess({ servers: [{ name: 'Local Plex', uri: 'http://192.168.0.7:32400' }] });
      }
    }
  }
}, {}, function (servers) { serviceDiscovery = servers; });
assert.deepStrictEqual(serviceRequest, {
  service: 'luna://io.github.rhapsodos.ploff.discovery',
  method: 'discover'
}, 'the official webOS service API must receive the base Luna service and method separately');
assert.strictEqual(serviceDiscovery.length, 1, 'successful webOS GDM discovery must return local Plex servers');

var stalledServiceDiscovery = 'pending';
Discovery.discover({
  XMLHttpRequest: function () {},
  setTimeout: function (callback) { callback(); return 1; },
  clearTimeout: function () {},
  webOS: {
    service: {
      request: function () {}
    }
  }
}, { discoveryServiceTimeout: 10 }, function (servers) { stalledServiceDiscovery = servers; });
assert.deepStrictEqual(stalledServiceDiscovery, [], 'webOS discovery must finish when the service accepts a request but never calls back');

console.log('Server discovery checks passed');
