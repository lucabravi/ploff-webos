'use strict';

var assert = require('assert');
var PresentationServices = require('../app/coordinator/presentation-services');
var nodes = {};
var documentRef = {
  createElement: function (tagName) {
    var node = {
      tagName: tagName,
      className: '',
      textContent: '',
      children: [],
      appendChild: function (child) { this.children.push(child); },
      removeChild: function () { this.children.shift(); }
    };
    Object.defineProperty(node, 'firstChild', { get: function () { return this.children[0] || null; } });
    Object.defineProperty(node, 'innerHTML', {
      get: function () { return ''; },
      set: function () { this.children = []; }
    });
    return node;
  },
  createTextNode: function (value) { return { nodeValue: String(value) }; },
  getElementById: function (id) { return nodes[id] || null; }
};
var settings = { uiLanguage: 'it' };
var service = PresentationServices.create({
  document: documentRef,
  I18n: { t: function (language, key, parameters) { return language + ':' + key + ':' + (parameters && parameters.count || ''); } },
  MediaLabels: {
    title: function (item, t) { return t('title', { count: item.count }); },
    meta: function () { return 'meta'; },
    detail: function () { return 'detail'; },
    cardMeta: function () { return 'card-meta'; },
    cardDetail: function () { return 'card-detail'; }
  },
  settings: function () { return settings; }
});

assert.strictEqual(service.t('items', { count: 2 }), 'it:items:2', 'translation must use the current settings language');
settings.uiLanguage = 'en';
assert.strictEqual(service.t('items', { count: 3 }), 'en:items:3', 'translation must read settings lazily');

var child = service.element('span', 'label', 'Hello');
assert.strictEqual(child.tagName, 'span');
assert.strictEqual(child.className, 'label');
assert.strictEqual(child.children[0].nodeValue, 'Hello');

nodes.title = documentRef.createElement('div');
nodes.title.children.push({ nodeValue: 'old' });
service.setText('title', 'New');
assert.strictEqual(nodes.title.children.length, 1, 'setText must replace prior content');
assert.strictEqual(nodes.title.children[0].nodeValue, 'New');

assert.strictEqual(service.mediaKey({ ratingKey: '42', title: 'Fallback' }), '42');
assert.strictEqual(service.mediaTitle({ count: 4 }), 'en:title:4');
assert.strictEqual(service.mediaMeta({}), 'meta');
assert.strictEqual(service.mediaDetail({}), 'detail');
assert.strictEqual(service.mediaCardMeta({}), 'card-meta');
assert.strictEqual(service.mediaCardDetail({}), 'card-detail');
assert.strictEqual(service.artworkUrl({ art: '/library/metadata/1/art/400/600' }), '/library/metadata/1/art/1280/720');

console.log('Presentation service checks passed');
