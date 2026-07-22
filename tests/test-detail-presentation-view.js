'use strict';

var assert = require('assert');
var DetailPresentationView = require('../app/detail-presentation-view');

function node(id) {
  return {
    id: id, className: '', textContent: '', innerText: '', disabled: false, attributes: {}, scrollTop: 0,
    clientHeight: 100, scrollHeight: 100, bottom: 100,
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    getBoundingClientRect: function () { return { bottom: this.bottom }; }
  };
}
var ids = [
  'detail-title', 'detail-subtitle', 'detail-facts', 'detail-summary', 'detail-summary-button', 'detail-summary-dialog',
  'detail-summary-dialog-title', 'detail-summary-dialog-text', 'detail-summary-dialog-hint', 'detail-media-info-button',
  'detail-media-info', 'detail-media-info-video', 'detail-media-info-audio', 'detail-media-info-bitrate',
  'detail-audio', 'detail-audio-label', 'detail-audio-value', 'detail-subtitles', 'detail-subtitles-label',
  'detail-subtitles-value', 'detail-version', 'detail-version-value', 'detail-media-info-label',
  'detail-media-info-video-label', 'detail-media-info-audio-label', 'detail-media-info-bitrate-label',
  'detail-media-info-subtitle-languages-label',
  'detail-media-info-subtitle-languages', 'detail-media-info-dialog', 'detail-media-info-dialog-title',
  'detail-media-info-dialog-text', 'detail-media-info-dialog-hint'
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
  labels: { audio: 'Audio', subtitles: 'Subtitles', mediaInfo: 'Media info', subtitleLanguages: 'Subtitle languages', video: 'Video', bitrate: 'Bitrate' },
  choices: { audio: true, subtitles: false, versions: true },
  values: { audio: 'Automatic - Japanese', subtitles: 'Off', version: 'Automatic - 1080p', video: 'HEVC · 1920x1080', mediaAudio: 'AAC · 2 ch', bitrate: '8 Mbps', subtitleLanguages: 'Italian' },
  mediaInfoVisible: true
});
assert.strictEqual(nodes['detail-audio-value'].textContent, 'Automatic - Japanese', 'media controls must render resolved audio text');
assert.ok(nodes['detail-audio'].className.indexOf('is-focused') !== -1 && nodes['detail-audio'].className.indexOf('is-cyclable') !== -1, 'rerendering controls must preserve focus and expose available choices');
assert.strictEqual(nodes['detail-subtitles'].disabled, true, 'single-value controls must be disabled');
assert.strictEqual(nodes['detail-media-info-button'].className.indexOf('is-hidden'), -1, 'enabled media information must remain visible');

nodes['detail-summary'].scrollHeight = 160;
nodes['detail-summary'].clientHeight = 100;
zone = 'summary';
assert.strictEqual(view.updateSummaryOverflow(), true, 'overflowing summaries must become interactive');
assert.strictEqual(nodes['detail-summary-button'].disabled, false, 'overflowing summary control must be enabled');
assert.strictEqual(view.openSummary(), true, 'an overflowing summary must open its dialog');
assert.strictEqual(view.snapshot().summaryDialogOpen, true, 'summary dialog state must be private and observable');
view.closeSummary();
assert.strictEqual(view.snapshot().summaryDialogOpen, false, 'closing a summary must clear dialog state');

nodes['detail-media-info'].bottom = 180;
nodes['detail-media-info-button'].bottom = 120;
zone = 'media-info';
assert.strictEqual(view.updateMediaInfoOverflow(true), true, 'clipped media information must become interactive');
nodes['detail-media-info-video'].innerText = 'HEVC';
nodes['detail-media-info-audio'].innerText = 'AAC';
nodes['detail-media-info-bitrate'].innerText = '8 Mbps';
nodes['detail-media-info-subtitle-languages'].innerText = 'English, Italian';
assert.strictEqual(view.openMediaInfo(), true, 'clipped media information must open its dialog');
assert.ok(nodes['detail-media-info-dialog-text'].textContent.indexOf('HEVC') !== -1, 'media dialog must contain the current technical values');

nodes['detail-media-info'].bottom = 100;
view.updateMediaInfoOverflow(true);
assert.strictEqual(invalid[invalid.length - 1], 'media-info', 'a focus zone that no longer overflows must return control to the shell');
view.clear();
assert.strictEqual(nodes['detail-title'].textContent, '', 'clear must remove stale title metadata before a new media opens');

console.log('Detail presentation view checks passed');
