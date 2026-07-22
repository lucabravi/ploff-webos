'use strict';

var assert = require('assert');
var PlayerControlsView = require('../app/player-controls-view');
function node() { return { className: '', textContent: '', style: {}, attributes: {}, setAttribute: function (key, value) { this.attributes[key] = String(value); } }; }
var nodes = {};
['player-video', 'player-loading', 'player-toggle', 'player-progress', 'player-current-time', 'player-duration', 'player-controls', 'player-previous', 'player-next'].forEach(function (id) { nodes[id] = node(); });
var documentRef = { getElementById: function (id) { return nodes[id]; }, querySelectorAll: function () { return [nodes['player-previous'], nodes['player-toggle'], nodes['player-next']]; } };
var view = PlayerControlsView.create({ document: documentRef });

view.renderLoading(true, true);
assert.strictEqual(nodes['player-video'].className, 'player-video', 'buffering must preserve the visible video frame');
assert.strictEqual(nodes['player-loading'].className, 'player-loading is-buffering', 'buffering must show the lightweight overlay');
view.renderProgress({ progress: 42, currentTime: '10:00', duration: '24:00', paused: false, playLabel: 'Play', pauseLabel: 'Pause' });
assert.strictEqual(nodes['player-progress'].style.width, '42%', 'player progress must use the bounded absolute percentage');
assert.ok(nodes['player-toggle'].className.indexOf('is-playing') !== -1, 'playing state must update the central control');
assert.strictEqual(nodes['player-toggle'].attributes['aria-label'], 'Pause', 'the central control must expose its next action');
view.renderMode('timeline');
assert.strictEqual(nodes['player-controls'].className, 'player-controls is-timeline-only', 'timeline mode must use the compact player surface');
view.renderEpisodeCommands(false, true);
assert.strictEqual(view.buttonAvailable(0), false, 'unavailable previous episodes must be skipped by focus navigation');
assert.strictEqual(view.buttonAvailable(2), true, 'available next episodes must remain focusable');

console.log('Player controls view checks passed');
