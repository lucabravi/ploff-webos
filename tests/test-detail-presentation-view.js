'use strict';

var assert = require('assert');
var DetailPresentationView = require('../app/detail-presentation-view');

function node(id) {
  return {
    id: id, className: '', textContent: '', innerText: '', disabled: false, attributes: {}, scrollTop: 0,
    clientHeight: 100, scrollHeight: 100, bottom: 100,
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    focus: function () { this.focused = true; },
    getBoundingClientRect: function () { return { bottom: this.bottom }; }
  };
}
var ids = [
  'detail-title', 'detail-subtitle', 'detail-facts', 'detail-summary', 'detail-summary-button', 'detail-summary-dialog',
  'detail-summary-dialog-title', 'detail-summary-dialog-text', 'detail-summary-dialog-hint', 'detail-summary-dialog-close',
  'detail-audio', 'detail-audio-label', 'detail-audio-value', 'detail-subtitles', 'detail-subtitles-label',
  'detail-subtitles-value', 'detail-version', 'detail-version-label', 'detail-version-value', 'detail-version-info'
];
var nodes = {};
ids.forEach(function (id) { nodes[id] = node(id); });
var zone = 'play';
var invalid = [];
var documentRef = { body: { className: '' }, getElementById: function (id) { return nodes[id]; } };
var view = DetailPresentationView.create({
  root: { setTimeout: function (callback) { callback(); return 1; } }, document: documentRef,
  setText: function (id, text) { nodes[id].textContent = String(text || ''); nodes[id].innerText = String(text || ''); },
  t: function (key) { return key; }, getZone: function () { return zone; }, onInvalidZone: function (name) { invalid.push(name); }, onDialogClose: function () {}
});

view.renderMetadata({ type: 'movie', title: 'Demo Movie', facts: '2026', summary: 'A useful summary.' }, 'Feature film');
assert.strictEqual(nodes['detail-title'].textContent, 'Demo Movie', 'metadata rendering must update the visible title');
assert.strictEqual(nodes['detail-subtitle'].textContent, 'Feature film', 'metadata rendering must use the prepared localized subtitle');
assert.ok(documentRef.body.className.indexOf('is-movie-detail') !== -1, 'movie metadata must enable the movie layout');

nodes['detail-audio'].className = 'detail-choice is-focused';
view.renderMediaControls({
  labels: { version: 'Version', audio: 'Audio', subtitles: 'Subtitles' },
  choices: { audio: true, subtitles: false, versions: false, versionOpenable: true },
  values: { audio: 'Automatic - Japanese', subtitles: 'Off', version: 'Automatic - 1080p' }
});
assert.strictEqual(nodes['detail-audio-value'].textContent, 'Automatic - Japanese', 'media controls must render resolved audio text');
assert.ok(nodes['detail-audio'].className.indexOf('is-focused') !== -1 && nodes['detail-audio'].className.indexOf('is-cyclable') !== -1, 'rerendering controls must preserve focus and expose available choices');
assert.strictEqual(nodes['detail-subtitles'].disabled, true, 'single-value controls must be disabled');
assert.strictEqual(nodes['detail-version'].disabled, false, 'version details must remain openable even when there is only one file version');
assert.strictEqual(nodes['detail-version'].className.indexOf('is-cyclable'), -1, 'single-file version details must not advertise lateral cycling');
assert.strictEqual(nodes['detail-version-label'].textContent, 'Version', 'version must render its localized label from the media-control model');

nodes['detail-summary'].scrollHeight = 160;
nodes['detail-summary'].clientHeight = 100;
zone = 'summary';
assert.strictEqual(view.updateSummaryOverflow(), true, 'overflowing summaries must become interactive');
assert.strictEqual(nodes['detail-summary-button'].disabled, false, 'overflowing summary control must be enabled');
assert.strictEqual(view.openSummary(), true, 'an overflowing summary must open its dialog');
assert.strictEqual(view.snapshot().summaryDialogOpen, true, 'summary dialog state must be private and observable');
assert.strictEqual(nodes['detail-summary-dialog-close'].textContent, 'common.close', 'the summary dialog must expose a visible localized close action');
assert.strictEqual(nodes['detail-summary-dialog'].attributes['aria-hidden'], 'false', 'opening the summary must expose it to accessibility APIs');
view.closeSummary();
assert.strictEqual(view.snapshot().summaryDialogOpen, false, 'closing a summary must clear dialog state');
assert.strictEqual(nodes['detail-summary-dialog'].attributes['aria-hidden'], 'true', 'closing the summary must hide it from accessibility APIs');

view.clear();
assert.strictEqual(nodes['detail-title'].textContent, '', 'clear must remove stale title metadata before a new media opens');

console.log('Detail presentation view checks passed');
