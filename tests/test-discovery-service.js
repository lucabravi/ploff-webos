'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '..', 'webos-service', 'service.js'), 'utf8');
var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'webos-service', 'services.json'), 'utf8'));
var packageScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'package-tv-shell.sh'), 'utf8');

assert.ok(/require\('dgram'\)/.test(source), 'the webOS discovery service must use local UDP only');
assert.ok(/try \{ Service = require\('webos-service'\); \}[\s\S]*require\('\/usr\/lib\/node_modules\/webos-service'\)/.test(source), 'the discovery service must support legacy webOS NODE_PATH behavior');
assert.ok(/NODE_PATH[\s\S]*\/usr\/lib\/nodejs[\s\S]*Module\._initPaths\(\)/.test(source), 'legacy webOS services must initialize native and global module paths before loading dependencies');
assert.ok(/239\.0\.0\.250/.test(source) && /32414/.test(source), 'the service must send Plex GDM discovery to the standard multicast endpoint');
assert.ok(/service\.register\('discover'/.test(source), 'the app must expose a discover method over Luna');
assert.strictEqual(manifest.id, 'io.github.rhapsodos.ploff.discovery', 'the packaged service id must be namespaced under the webOS app id');
assert.strictEqual(manifest.services[0].name, 'io.github.rhapsodos.ploff.discovery', 'the Luna service name must match its valid package id');
assert.ok(/ares-package[^\n]*\$STAGE[^\n]*\$SERVICE_STAGE/.test(packageScript), 'TV packages must include the local discovery service');

console.log('Discovery service checks passed');
