'use strict';

var assert = require('assert');
var SubtitleSync = require('../app/subtitle-sync');

assert.deepStrictEqual(SubtitleSync.classify({ id: '1', codec: 'srt', key: '/library/streams/1' }), {
  supported: true,
  editorSupported: true,
  kind: 'external-text',
  codec: 'srt'
}, 'external SRT must support server-persisted synchronization');
assert.strictEqual(SubtitleSync.classify({ id: '2', codec: 'webvtt', external: false }).kind, 'embedded-text', 'embedded WebVTT must support local synchronization');
assert.strictEqual(SubtitleSync.classify({ id: '3', codec: 'subrip', external: false }).supported, true, 'embedded SubRip text must be convertible');
['ass', 'ssa'].forEach(function (codec) {
  assert.deepStrictEqual(SubtitleSync.classify({ codec: codec }), {
    supported: true,
    editorSupported: true,
    kind: 'embedded-ass',
    codec: codec
  }, codec + ' embedded tracks must enter Advanced Subtitle Settings for timing and applicable local controls');
});
['pgs', 'vobsub', 'dvd_subtitle'].forEach(function (codec) {
  assert.strictEqual(SubtitleSync.classify({ codec: codec }).supported, false, codec + ' must remain unsupported');
});

var tracks = [
  { id: 'srt', codec: 'srt', key: '/library/streams/srt' },
  { id: 'ass', codec: 'ass', external: false, key: '/library/streams/ass' },
  { id: 'pgs', codec: 'pgs' }
];
assert.strictEqual(SubtitleSync.availability('', tracks, {}).enabled, true, 'Off must still open the editor when a compatible track exists');
assert.strictEqual(SubtitleSync.availability('srt', tracks, {}).enabled, true, 'a selected text track must open the editor');
assert.deepStrictEqual(SubtitleSync.availability('ass', tracks, {}), { enabled: true, reason: '', track: tracks[1] }, 'embedded ASS must open Advanced Subtitle Settings');
assert.strictEqual(SubtitleSync.advancedEditorSupported(tracks[0]), true, 'SRT must be eligible for the advanced editor');
assert.strictEqual(SubtitleSync.advancedEditorSupported({ codec: 'webvtt' }), true, 'WebVTT must be eligible for the advanced editor');
assert.strictEqual(SubtitleSync.advancedEditorSupported({ codec: 'ass', external: true, key: '/library/streams/external-ass' }), true,
  'external ASS must be eligible for the local advanced editor');
assert.strictEqual(SubtitleSync.advancedEditorSupported({ codec: 'ssa', external: true }), true,
  'external SSA must be eligible for the local advanced editor');
assert.strictEqual(SubtitleSync.advancedEditorSupported(tracks[1]), true, 'embedded ASS must be eligible for timing controls in the advanced editor');
assert.strictEqual(SubtitleSync.advancedEditorSupported({ codec: 'ass', external: false, key: '/library/streams/embedded-ass' }), true,
  'embedded ASS must remain eligible even when Plex exposes a stream key for converted text');
assert.deepStrictEqual(SubtitleSync.availability('pgs', tracks, {}), { enabled: false, reason: 'unsupported', track: tracks[2] }, 'a selected image track must disable the editor');
assert.strictEqual(SubtitleSync.availability('srt', tracks, { srt: true }).enabled, false, 'a failed runtime conversion must disable that stream for the session');
assert.strictEqual(SubtitleSync.availability('', [{ id: 'pgs', codec: 'pgs' }], {}).enabled, false, 'Off without compatible tracks must disable the editor');

(function advancedEditorCapabilitiesFollowTrackKindAndActualPixelOwnership() {
  var allTracks = [
    { id: 'srt', codec: 'srt', external: true },
    { id: 'embedded-ass', codec: 'ass', external: false },
    { id: 'pgs', codec: 'pgs' }
  ];
  assert.deepStrictEqual(SubtitleSync.editorCapabilities(allTracks[1], { local: true, tracks: allTracks }), {
    supported: true,
    local: true,
    track: true,
    size: true,
    background: false,
    edge: false,
    offset: true,
    loop: true,
    timeline: true,
    renderSrt: true,
    renderAss: true
  }, 'local embedded ASS must expose timing and size while keeping SRT-only appearance controls disabled');
  assert.deepStrictEqual(SubtitleSync.editorCapabilities(allTracks[1], { local: false, tracks: allTracks }), {
    supported: true,
    local: false,
    track: true,
    size: false,
    background: false,
    edge: false,
    offset: true,
    loop: true,
    timeline: true,
    renderSrt: true,
    renderAss: true
  }, 'server-owned embedded ASS must keep timing editable but disable local pixel-size controls');
  assert.deepStrictEqual(SubtitleSync.editorCapabilities(allTracks[0], { local: true, tracks: allTracks }), {
    supported: true,
    local: true,
    track: true,
    size: true,
    background: true,
    edge: true,
    offset: true,
    loop: true,
    timeline: true,
    renderSrt: true,
    renderAss: true
  }, 'local SRT must retain the complete timing and appearance editor');
  assert.deepStrictEqual(SubtitleSync.editorCapabilities(null, { local: false, tracks: allTracks }), {
    supported: false,
    local: false,
    track: true,
    size: false,
    background: false,
    edge: false,
    offset: false,
    loop: false,
    timeline: false,
    renderSrt: true,
    renderAss: true
  }, 'Off/Automatic without a resolved track must disable track-specific rows while preserving renderer-family controls');

  [
    { name: 'embedded SRT', track: { id: 'embedded-srt', codec: 'srt', external: false }, background: true, edge: true },
    { name: 'external ASS', track: { id: 'external-ass', codec: 'ass', external: true, key: '/subtitles/test.ass' }, background: false, edge: false }
  ].forEach(function (entry) {
    var result = SubtitleSync.editorCapabilities(entry.track, { local: true, tracks: allTracks.concat([entry.track]) });
    assert.strictEqual(result.size, true, entry.name + ' must expose size while its local renderer owns pixels');
    assert.strictEqual(result.offset, true, entry.name + ' must expose timing');
    assert.strictEqual(result.background, entry.background, entry.name + ' background capability must follow renderer family');
    assert.strictEqual(result.edge, entry.edge, entry.name + ' edge capability must follow renderer family');
  });
}());

var srt = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  'Hello',
  'world',
  '',
  '2',
  '00:01:04.250 --> 00:01:05.500',
  'Second cue',
  ''
].join('\n');
var cues = SubtitleSync.parse(srt);
assert.deepStrictEqual(cues, [
  { start: 1000, end: 3000, text: 'Hello\nworld' },
  { start: 64250, end: 65500, text: 'Second cue' }
], 'SRT parsing must preserve multiline text and millisecond timing');

var hybridSrt = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  '{\\an8}Top cue',
  '',
  '2',
  '00:00:04,000 --> 00:00:05,000',
  '{\\blur3}{\\i1}Styled cue{\\i0}',
  '',
  '3',
  '00:00:06,000 --> 00:00:07,000',
  'Literal {word} text',
  '',
  '4',
  '00:00:08,000 --> 00:00:09,000',
  '{\\an8}{\\an2}Last alignment wins',
  '',
  '5',
  '00:00:10,000 --> 00:00:11,000',
  'Inline {\\an7}alignment',
  ''
].join('\n');
var hybridCues = SubtitleSync.parse(hybridSrt);
assert.deepStrictEqual(hybridCues, [
  { start: 1000, end: 3000, text: 'Top cue', alignment: 8 },
  { start: 4000, end: 5000, text: 'Styled cue' },
  { start: 6000, end: 7000, text: 'Literal {word} text' },
  { start: 8000, end: 9000, text: 'Last alignment wins', alignment: 2 },
  { start: 10000, end: 11000, text: 'Inline alignment', alignment: 7 }
], 'SRT parsing must normalize ASS override blocks without removing literal braces');

var webvtt = [
  'WEBVTT',
  '',
  'cue-one',
  '00:02.000 --> 00:04.500 align:middle',
  '<i>Styled text</i>',
  '',
  'broken',
  'not a timestamp',
  'ignored',
  ''
].join('\n');
assert.deepStrictEqual(SubtitleSync.parse(webvtt), [
  { start: 2000, end: 4500, text: '<i>Styled text</i>' }
], 'WebVTT parsing must accept identifiers and ignore malformed blocks');

assert.deepStrictEqual(SubtitleSync.shift(cues.slice(0, 1), 500), [
  { start: 1500, end: 3500, text: 'Hello\nworld' }
], 'cue shifting must return adjusted copies');
assert.deepStrictEqual(SubtitleSync.shift(hybridCues.slice(0, 1), 500), [
  { start: 1500, end: 3500, text: 'Top cue', alignment: 8 }
], 'cue shifting must preserve normalized SRT alignment');
assert.strictEqual(cues[0].start, 1000, 'cue shifting must not mutate source cues');
assert.strictEqual(SubtitleSync.active(cues, 1500, 500)[0].text, 'Hello\nworld', 'positive offsets must delay display time');
assert.strictEqual(SubtitleSync.active(cues, 1200, 500).length, 0, 'a delayed cue must remain hidden before its shifted start');
assert.strictEqual(SubtitleSync.active(cues, 900, -500)[0].text, 'Hello\nworld', 'negative offsets must advance display time');

assert.deepStrictEqual(SubtitleSync.loopBounds(42, 100), { start: 37, end: 42 }, 'the preview loop must cover the five seconds before entry');
assert.deepStrictEqual(SubtitleSync.loopBounds(3, 100), { start: 0, end: 3 }, 'the preview loop must clamp at media start');
assert.deepStrictEqual(SubtitleSync.loopBounds(120, 100), { start: 95, end: 100 }, 'the preview loop must clamp at media duration');
assert.strictEqual(SubtitleSync.adjust(0, 100), 100, 'offset controls must move in milliseconds');
assert.strictEqual(SubtitleSync.adjust(599950, 100), 600000, 'positive offsets must clamp at ten minutes');
assert.strictEqual(SubtitleSync.adjust(-599950, -100), -600000, 'negative offsets must clamp at ten minutes');

console.log('Subtitle synchronization checks passed');
