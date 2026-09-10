'use strict';

var assert = require('assert');
var fixture = require('./helpers/plex-real-fixture');
var PlexClient = require('../app/plex-client');

(function parsesSanitizedRealServerIdentityOffline() {
  var previousXhr = global.XMLHttpRequest;
  var request = null;
  var identity = null;
  var openedUrl = '';

  try {
    global.XMLHttpRequest = function () {
      request = this;
      this.open = function (_method, url) { openedUrl = url; };
      this.setRequestHeader = function () {};
      this.send = function () {};
      this.abort = function () {};
    };

    PlexClient.loadServerIdentity({ apiBaseUrl: '/plex-api', token: 'must-not-be-used-for-identity' }, function (error, value) {
      assert.ifError(error);
      identity = value;
    });
    assert.ok(request);
    request.status = 200;
    request.readyState = 4;
    request.responseText = fixture.read('server/identity.xml');
    request.onreadystatechange();
  } finally {
    global.XMLHttpRequest = previousXhr;
  }

  assert.deepStrictEqual(identity, {
    name: '',
    version: '1.43.3.10896-cb3ebc72d',
    machineIdentifier: 'fixture-client-001'
  });
  assert.strictEqual(openedUrl, '/plex-api/identity', 'the real identity contract must remain token-free');
}());
