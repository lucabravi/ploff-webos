'use strict';

var assert = require('assert');
var Parser = require('../webos-service/gdm-parser');

var response = [
  'HTTP/1.0 200 OK',
  'Content-Type: plex/media-server',
  'Name: Mac Mini Plex',
  'Port: 32400',
  'Resource-Identifier: machine-a',
  'Version: 1.43.2',
  '',
  ''
].join('\r\n');

assert.deepStrictEqual(Parser.parse(response, '192.168.50.10'), {
  name: 'Mac Mini Plex',
  uri: 'http://192.168.50.10:32400',
  machineIdentifier: 'machine-a',
  version: '1.43.2',
  source: 'gdm'
}, 'GDM responses must produce portable local server descriptors');
assert.strictEqual(Parser.parse('HTTP/1.0 200 OK\r\nContent-Type: text/plain', '192.168.50.10'), null, 'non-Plex GDM responses must be ignored');

console.log('GDM parser checks passed');
