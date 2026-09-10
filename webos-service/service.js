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
  var socket = null;
  var timer = null;
  var servers = [];
  var seen = Object.create(null);
  var finished = false;

  function finish() {
    var activeSocket;
    if (finished) { return; }
    finished = true;
    if (timer !== null) { clearTimeout(timer); }
    timer = null;
    activeSocket = socket;
    socket = null;
    if (activeSocket) {
      activeSocket.removeListener('message', receive);
      // Keep the idempotent error listener while native close completes.
      try { activeSocket.close(); } catch (error) {}
    }
    message.respond({ returnValue: true, servers: servers });
  }

  function receive(payload, remote) {
    var server;
    var key;
    if (finished) { return; }
    server = Parser.parse(payload.toString('utf8'), remote.address);
    if (!server) { return; }
    key = server.machineIdentifier || server.uri;
    if (!seen[key]) { seen[key] = true; servers.push(server); }
  }

  function bound() {
    if (finished) { return; }
    try {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);
      socket.send(SEARCH, 0, SEARCH.length, PORT, ADDRESS);
      socket.send(SEARCH, 0, SEARCH.length, PORT, '255.255.255.255');
    } catch (error) { finish(); }
  }

  timer = setTimeout(finish, 2200);
  try { socket = dgram.createSocket('udp4'); }
  catch (createError) { finish(); return; }
  socket.on('message', receive);
  socket.on('error', finish);
  try { socket.bind(0, bound); }
  catch (bindError) { finish(); }
});
