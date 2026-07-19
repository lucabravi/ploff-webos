'use strict';

process.env.NODE_PATH = process.env.NODE_PATH ? process.env.NODE_PATH + ':/usr/lib/node_modules:/usr/lib/nodejs' : '/usr/lib/node_modules:/usr/lib/nodejs';
require('module').Module._initPaths();

var Service;
try { Service = require('webos-service'); }
catch (error) { Service = require('/usr/lib/node_modules/webos-service'); }
var dgram = require('dgram');
var Parser = require('./gdm-parser');
var service = new Service('io.github.rhapsodos.ploff.discovery');

var ADDRESS = '239.0.0.250';
var PORT = 32414;
var SEARCH = new Buffer([
  'M-SEARCH * HTTP/1.1',
  'Host: ' + ADDRESS + ':' + PORT,
  'Man: "ssdp:discover"',
  'ST: urn:schemas-upnp-org:device:MediaServer:1',
  'MX: 2',
  '',
  ''
].join('\r\n'));

service.register('discover', function (message) {
  var socket = dgram.createSocket('udp4');
  var servers = [];
  var seen = {};
  var finished = false;

  function finish() {
    if (finished) { return; }
    finished = true;
    try { socket.close(); } catch (error) {}
    message.respond({ returnValue: true, servers: servers });
  }

  socket.on('message', function (payload, remote) {
    var server = Parser.parse(payload.toString('utf8'), remote.address);
    var key;
    if (!server) { return; }
    key = server.machineIdentifier || server.uri;
    if (!seen[key]) { seen[key] = true; servers.push(server); }
  });
  socket.on('error', finish);
  socket.bind(0, function () {
    try {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);
      socket.send(SEARCH, 0, SEARCH.length, PORT, ADDRESS);
      socket.send(SEARCH, 0, SEARCH.length, PORT, '255.255.255.255');
    } catch (error) { finish(); }
  });
  setTimeout(finish, 2200);
});
