'use strict';

var assert = require('assert');
var MediaChoiceModel = require('../app/media-choice-model');

var audio = [{ id: '10', language: 'Japanese', languageTag: 'ja' }, { language: 'Italiano', languageCode: 'ita' }];
var choices = MediaChoiceModel.trackChoices(audio, {
  automatic: { value: '', label: 'Automatic - Japanese' },
  useIndexFallback: true,
  label: function (track) { return track.language; }
});
assert.deepStrictEqual(choices, [
  { value: '', label: 'Automatic - Japanese', track: null, languageCode: '' },
  { value: '10', label: 'Japanese', track: audio[0], languageCode: 'ja' },
  { value: '1', label: 'Italiano', track: audio[1], languageCode: 'ita' }
], 'track choices must preserve automatic entries, stable IDs and explicit index fallback');

var subtitleChoices = MediaChoiceModel.trackChoices([{ id: '20', language: 'English' }], {
  automatic: { value: 'automatic', label: 'Automatic - Off' },
  off: { value: 'off', label: 'Off' },
  label: function (track) { return track.language; }
});
assert.deepStrictEqual(subtitleChoices.map(function (choice) { return choice.value; }), ['automatic', 'off', '20'], 'subtitle choices must retain automatic and off semantics');
assert.strictEqual(MediaChoiceModel.trackValue({}, 3, false), '', 'Player choices must not invent a stream ID');

var versions = [
  { mediaIndex: 0, partIndex: 0, summary: '1080p' },
  { mediaIndex: 1, partIndex: 2, summary: '4K' }
];
assert.deepStrictEqual(MediaChoiceModel.versionChoices(versions, function (version) { return version.summary; }).map(function (choice) {
  return [choice.value, choice.label, choice.version];
}), [
  ['0:0', '1080p', versions[0]],
  ['1:2', '4K', versions[1]]
], 'version choices must share one stable compound identity');
assert.strictEqual(MediaChoiceModel.findVersion(versions, '1:2'), versions[1], 'version lookup must resolve the same identity exposed to dialogs');
assert.strictEqual(MediaChoiceModel.findVersion(versions, '2:0'), null, 'unknown version identities must remain unavailable');

assert.strictEqual(MediaChoiceModel.versionLabel(versions[0], {
  automatic: true,
  automaticLabel: 'Automatic',
  unavailable: 'Unavailable'
}), 'Automatic - 1080p', 'automatic version labels must share one formatter');
assert.strictEqual(MediaChoiceModel.versionLabel(null, {
  automatic: false,
  automaticLabel: 'Automatic',
  unavailable: 'Unavailable'
}), 'Unavailable', 'missing versions must share the same fallback label');

console.log('Media choice model checks passed');
