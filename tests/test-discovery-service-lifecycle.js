'use strict';

var assert = require('assert');
var EventEmitter = require('events');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Parser = require('../webos-service/gdm-parser');
var source = fs.readFileSync(path.join(__dirname, '..', 'webos-service/service.js'), 'utf8');
var failures = [];
var cases = 0;

function check(name, test) {
  cases += 1;
  try { test(); }
  catch (error) { failures.push(name + ': ' + error.message); }
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function payload(identifier) {
  return Buffer.from('HTTP/1.0 200 OK\r\nContent-Type: plex/media-server\r\nName: Test\r\nPort: 32400\r\nResource-Identifier: ' + identifier + '\r\n');
}
function harness(options) {
  options = options || {};
  var sockets = [];
  var timers = {};
  var scheduled = [];
  var handler;
  var nextTimer = 0;
  function Service(id) { assert.strictEqual(id, 'io.github.rhapsodos.ploff.discovery'); }
  Service.prototype.register = function (method, callback) {
    assert.strictEqual(method, 'discover'); handler = callback;
  };
  function createSocket(type) {
    assert.strictEqual(type, 'udp4');
    if (options.createError) { throw new Error('socket unavailable'); }
    var socket = new EventEmitter();
    socket.sends = [];
    socket.closeCount = 0;
    socket.bind = function (port, callback) {
      assert.strictEqual(port, 0);
      if (options.bindError) { throw new Error('bind unavailable'); }
      socket.bound = callback;
    };
    socket.setBroadcast = function (enabled) {
      assert.strictEqual(enabled, true);
      if (options.optionError) { throw new Error('broadcast unavailable'); }
    };
    socket.setMulticastTTL = function (ttl) { assert.strictEqual(ttl, 2); };
    socket.send = function (buffer, offset, size, port, address) {
      if (options.sendError) { throw new Error('send unavailable'); }
      socket.sends.push({ text: buffer.toString(), offset: offset, size: size, port: port, address: address });
    };
    socket.close = function () {
      socket.closeCount += 1;
      if (options.closeError) { throw new Error('already closed'); }
    };
    sockets.push(socket);
    return socket;
  }
  vm.runInNewContext(source, {
    process: { env: {} },
    // Only native/service dependencies are simulated; the production service and parser run unchanged.
    require: function (name) {
      if (name === 'module') { return { Module: { _initPaths: function () {} } }; }
      if (name === 'webos-service') { return Service; }
      if (name === 'dgram') { return { createSocket: createSocket }; }
      if (name === './gdm-parser') { return Parser; }
      throw new Error('Unexpected dependency: ' + name);
    },
    Buffer: function (value) { return Buffer.from(value); },
    setTimeout: function (callback, delay) {
      var id = ++nextTimer;
      timers[id] = callback;
      scheduled.push({ id: id, callback: callback, delay: delay });
      return id;
    },
    clearTimeout: function (id) { delete timers[id]; }
  }, { filename: 'webos-service/service.js' });
  return {
    sockets: sockets, timers: timers, scheduled: scheduled,
    start: function () {
      var responses = [];
      handler({ respond: function (response) { responses.push(response); } });
      return responses;
    },
    fire: function (id) {
      var callback = timers[id];
      assert.strictEqual(typeof callback, 'function');
      delete timers[id];
      callback();
    }
  };
}

check('normal discovery preserves protocol, ordering, and real parser deduplication', function () {
  var h = harness();
  var responses = h.start();
  var socket = h.sockets[0];
  socket.bound();
  assert.deepStrictEqual(socket.sends.map(function (send) { return send.address; }), ['239.0.0.250', '255.255.255.255']);
  socket.sends.forEach(function (send) {
    assert.strictEqual(send.port, 32414);
    assert.strictEqual(send.offset, 0);
    assert.strictEqual(send.size, Buffer.byteLength(send.text));
    assert.ok(send.text.indexOf('M-SEARCH * HTTP/1.1\r\n') === 0);
  });
  assert.strictEqual(h.scheduled[0].delay, 2200);
  socket.emit('message', payload('machine-a'), { address: '192.168.1.2' });
  socket.emit('message', payload('machine-a'), { address: '192.168.1.3' });
  socket.emit('message', payload('machine-b'), { address: '192.168.1.4' });
  socket.emit('message', Buffer.from('Unrelated packet'), { address: '192.168.1.5' });
  assert.strictEqual(responses.length, 0);
  h.fire(h.scheduled[0].id);
  assert.strictEqual(responses.length, 1);
  assert.strictEqual(responses[0].returnValue, true);
  assert.deepStrictEqual(plain(responses[0].servers).map(function (server) { return [server.machineIdentifier, server.uri]; }), [
    ['machine-a', 'http://192.168.1.2:32400'], ['machine-b', 'http://192.168.1.4:32400']
  ]);
  assert.strictEqual(socket.closeCount, 1);
});
check('early socket error releases the deadline and responds exactly once', function () {
  var h = harness();
  var responses = h.start();
  h.sockets[0].emit('error', new Error('network unavailable'));
  assert.strictEqual(Object.keys(h.timers).length, 0);
  assert.deepStrictEqual(plain(responses), [{ returnValue: true, servers: [] }]);
  h.scheduled[0].callback();
  h.sockets[0].emit('error', new Error('late close error'));
  assert.strictEqual(responses.length, 1);
  assert.strictEqual(h.sockets[0].closeCount, 1);
});
check('a late bind callback cannot send after completion', function () {
  var h = harness();
  h.start();
  var socket = h.sockets[0];
  socket.emit('error', new Error('bind failed'));
  socket.bound();
  assert.strictEqual(socket.sends.length, 0);
});
check('completion detaches packet listeners and retained callbacks cannot mutate the result', function () {
  var h = harness();
  var responses = h.start();
  var socket = h.sockets[0];
  var retainedMessage = socket.listeners('message')[0];
  h.fire(h.scheduled[0].id);
  assert.strictEqual(socket.listenerCount('message'), 0);
  retainedMessage(payload('late'), { address: '192.168.1.6' });
  assert.deepStrictEqual(plain(responses), [{ returnValue: true, servers: [] }]);
  assert.doesNotThrow(function () { socket.emit('error', new Error('late error')); });
});
check('retained packet callback is inert independently of listener detachment', function () {
  var h = harness();
  var responses = h.start();
  var retainedMessage = h.sockets[0].listeners('message')[0];
  h.fire(h.scheduled[0].id);
  retainedMessage(payload('late'), { address: '192.168.1.6' });
  assert.strictEqual(responses[0].servers.length, 0);
});
check('discovery identifiers do not collide with object properties', function () {
  var h = harness();
  var responses = h.start();
  var keys = ['constructor', '__proto__', 'toString'];
  keys.concat([keys[0]]).forEach(function (key) {
    h.sockets[0].emit('message', payload(key), { address: '192.168.1.2' });
  });
  h.fire(h.scheduled[0].id);
  assert.deepStrictEqual(plain(responses[0].servers).map(function (server) { return server.machineIdentifier; }), keys);
});
['createError', 'bindError', 'optionError', 'sendError'].forEach(function (failure) {
  check(failure + ' completes safely without retaining the deadline', function () {
    var options = {}; options[failure] = true;
    var h = harness(options);
    var responses = h.start();
    if (h.sockets[0] && h.sockets[0].bound) { h.sockets[0].bound(); }
    assert.deepStrictEqual(plain(responses), [{ returnValue: true, servers: [] }]);
    assert.strictEqual(Object.keys(h.timers).length, 0);
    if (h.sockets[0]) { assert.strictEqual(h.sockets[0].closeCount, 1); }
  });
});
check('close errors cannot suppress completion or resurrect packet handling', function () {
  var h = harness({ closeError: true });
  var responses = h.start();
  h.sockets[0].emit('error', new Error('failed'));
  assert.deepStrictEqual(plain(responses), [{ returnValue: true, servers: [] }]);
  assert.strictEqual(Object.keys(h.timers).length, 0);
  assert.strictEqual(h.sockets[0].listenerCount('message'), 0);
});
check('simultaneous requests keep separate sockets, results, and deadlines', function () {
  var h = harness();
  var first = h.start();
  var second = h.start();
  h.sockets[0].emit('message', payload('first'), { address: '192.168.1.2' });
  h.sockets[1].emit('message', payload('second'), { address: '192.168.1.3' });
  h.sockets[0].emit('error', new Error('first failed'));
  assert.strictEqual(Object.keys(h.timers).length, 1);
  assert.strictEqual(second.length, 0);
  h.fire(h.scheduled[1].id);
  assert.deepStrictEqual(plain(first[0].servers).map(function (server) { return server.machineIdentifier; }), ['first']);
  assert.deepStrictEqual(plain(second[0].servers).map(function (server) { return server.machineIdentifier; }), ['second']);
});
assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log('Discovery service lifecycle: ' + cases + ' behavioral cases passed');
