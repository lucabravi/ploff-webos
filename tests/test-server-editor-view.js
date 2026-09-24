'use strict';

var assert = require('assert');
var ServerEditorView = require('../app/server-editor-view');
var list = { children: [], appendChild: function (node) { this.children.push(node); } };
Object.defineProperty(list, 'innerHTML', {
  get: function () { return ''; },
  set: function () { this.children = []; }
});
var nodes = { list: list };
var parentRow = { className: 'app-setting-row is-focused' };
list.parentNode = { previousSibling: parentRow };
var view = ServerEditorView.create({
  document: { getElementById: function () { return nodes.list; } },
  t: function (key) { return key; },
  element: function (tag, className, text) { return { tagName: tag, className: className, textContent: text || '', children: [], setAttribute: function (key, value) { this[key] = value; }, appendChild: function (node) { this.children.push(node); }, focus: function () { this.focused = true; } }; },
  appendAddresses: function (row, addresses) { row.addresses = addresses; },
  serverRouteLabel: function (server) { return server.uri === 'http://one:32400' ? 'Locale' : 'Remoto'; },
  keepFocusVisible: function () {},
  isPointerSelectionActive: function () { return false; }
});
view.open();
assert.deepStrictEqual(view.snapshot(), { open: true, index: 0 }, 'server editor must own its open and focus state');
view.focus(8, 4);
assert.strictEqual(view.snapshot().index, 3, 'server editor focus must clamp to its rendered row count');
view.close();
assert.deepStrictEqual(view.snapshot(), { open: false, index: 0 }, 'closing the server editor must reset its private focus');
view.open();
view.render({
  activeUri: 'http://one:32400', open: true, index: 2,
  servers: [{ name: 'One', uri: 'http://one:32400' }, { name: 'Two', uri: 'http://two:32400' }],
  addressesFor: function (server) { return [{ uri: server.uri }]; }
});
assert.strictEqual(nodes.list.children.length, 4, 'server editor must include scan, manual entry, and every saved server');
assert.strictEqual(nodes.list.children[2].textContent, '\u2713 One · Locale', 'active server must identify the endpoint it will use');
assert.strictEqual(nodes.list.children[2].className, 'server-editor-row is-focused', 'stored server focus must remain index-based');
assert.strictEqual(parentRow.className, 'app-setting-row', 'the expanded parent setting must not retain a second focus ring');
assert.strictEqual(nodes.list.children[3].addresses[0].uri, 'http://two:32400', 'each server must retain its rendered route list');
assert.strictEqual(nodes.list.children[3].textContent, 'Two · Remoto', 'duplicate server identities must expose their selected route type');
var pointerTarget = nodes.list.children[3];
view.focus(3, 4);
view.updateFocus();
assert.strictEqual(nodes.list.children[3], pointerTarget, 'pointer focus must preserve the server row DOM target until click completes');
assert.strictEqual(nodes.list.children[2].className, 'server-editor-row', 'pointer focus must clear the previous server row in place');
assert.strictEqual(pointerTarget.className, 'server-editor-row is-focused', 'pointer focus must update the server row class without rebuilding the editor');

view.render({
  activeUri: 'http://one:32400', open: true, index: 3, resolving: true, loadingLabel: 'Caricamento...',
  servers: [{ name: 'One', uri: 'http://one:32400' }, { name: 'Two', uri: 'http://two:32400' }],
  addressesFor: function (server) { return [{ uri: server.uri }]; }
});
assert.ok(/is-loading/.test(nodes.list.children[3].className), 'the selected server must expose a visible loading state while routes race');
assert.strictEqual(nodes.list.children[3].children[0].textContent, 'Caricamento...', 'the loading state must identify the pending server switch');
assert.strictEqual(nodes.list.children[0].disabled, true, 'all editor actions must be disabled while a server switch is pending');
assert.strictEqual(nodes.list.children[3].disabled, true, 'server choices must be disabled while their routes race');

console.log('Server editor view checks passed');
