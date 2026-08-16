'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var index = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
var styles = fs.readFileSync(path.join(root, 'app/styles.css'), 'utf8');
var shellFeature = fs.readFileSync(path.join(root, 'app/coordinator/shell-feature-controller.js'), 'utf8');

assert.ok(index.indexOf('server-activity-spinner processing-orb') !== -1, 'the Plex activity control must render the processing orb');
assert.strictEqual(index.indexOf('server-activity-fluid-filter'), -1, 'the unused fluid SVG filter must not be shipped');
assert.strictEqual(index.indexOf('processing-orb-active'), -1, 'the unused active SVG layer must not be shipped');
assert.strictEqual(index.indexOf('processing-orb-ring'), -1, 'the unused SVG idle ring must not be shipped');
assert.ok(styles.indexOf('.server-activity.is-network-online { color:#48c774; }') !== -1, 'online activities must remain green');
assert.ok(styles.indexOf('.server-activity.is-network-local-only { color:#e5a00d; }') !== -1, 'local-only activities must remain amber');
assert.ok(styles.indexOf('.server-activity.is-network-offline { color:#f05d5e; }') !== -1, 'offline activities must remain red');
assert.ok(styles.indexOf('.server-activity.is-network-unknown { color:#737a84; }') !== -1, 'unknown activities must remain grey');
assert.strictEqual(index.indexOf('<animate'), -1, 'the Chrome 53 orb must not depend on SVG SMIL animations');
assert.strictEqual(styles.indexOf('--activity-orb-size'), -1, 'the Chrome 53 orb must not depend on a CSS size variable');
assert.strictEqual(styles.indexOf('--network-status-rgb'), -1, 'the Chrome 53 orb must not interpolate CSS variables inside filters');
assert.strictEqual(styles.indexOf('calc(var(--activity-orb-size)'), -1, 'the Chrome 53 orb must use fixed filter radii');
assert.ok(styles.indexOf('@-webkit-keyframes server-activity-orb-start') !== -1, 'the orb must include prefixed Chrome 53 keyframes');
assert.ok(styles.indexOf('@keyframes server-activity-orb-start') !== -1, 'the orb must have an ignition transition');
assert.ok(styles.indexOf('@keyframes server-activity-orb-stop') !== -1, 'the orb must have a shutdown transition');
assert.ok(styles.indexOf('.server-activity-spinner:before') !== -1, 'idle mode must render a webOS-safe CSS ring');
assert.ok(styles.indexOf('.server-activity.is-idle .server-activity-spinner:before { opacity:1; }') !== -1, 'the network ring must remain visible while idle');
assert.ok(styles.indexOf('.server-activity.is-idle.is-network-online .server-activity-spinner:before { border-color:#48c774;') !== -1, 'the idle fallback ring must preserve the online color');
assert.ok(styles.indexOf('.server-activity.is-idle.is-network-local-only .server-activity-spinner:before { border-color:#e5a00d;') !== -1, 'the idle fallback ring must preserve the local-only color');
assert.ok(styles.indexOf('.server-activity.is-idle.is-network-offline .server-activity-spinner:before { border-color:#f05d5e;') !== -1, 'the idle fallback ring must preserve the offline color');
assert.ok(styles.indexOf('.server-activity.is-idle.is-network-unknown .server-activity-spinner:before { border-color:#737a84;') !== -1, 'the idle fallback ring must preserve the unknown color');
assert.ok(shellFeature.indexOf("var serverActivityVisualState = 'idle'") !== -1, 'activity rendering must track the visual state');
assert.ok(shellFeature.indexOf('activityAnimationDuration(520)') !== -1, 'the refactored start transition must respect interface animation settings');
assert.ok(styles.indexOf('server-activity-orb-start .52s cubic-bezier(.16,.78,.18,1)') !== -1, 'the shell must use the selected 520ms three-act startup');
assert.ok(styles.indexOf('.server-activity-panel.has-activities {') !== -1, 'active work must use the same activity panel as the focused detail view');
assert.ok(styles.indexOf('.server-activity-panel.has-activities .activity-summary { display:block; }') !== -1, 'active work must expose one condensed summary line');
assert.ok(styles.indexOf('.server-activity.is-focused + .server-activity-panel .activity-details') !== -1, 'focusing the activity control must expand the shared panel details');
assert.strictEqual(index.indexOf('server-activity-title'), -1, 'the activity summary must not resize the navbar with a second inline label');
assert.ok(styles.indexOf('32% { transform:scale(.88)') !== -1 && styles.indexOf('74% { transform:scale(1.045)') !== -1, 'the startup shell must use the refactored restrained overshoot');
assert.ok(shellFeature.indexOf('activityAnimationDuration(900)') !== -1, 'the stop transition must respect interface animation settings');
assert.ok(shellFeature.indexOf("button.setAttribute('aria-busy'") !== -1, 'activity state must remain accessible');
assert.ok(index.indexOf('processing-orb-legacy') !== -1, 'legacy Chromium must receive a CSS-only activity visual');
assert.ok(index.indexOf('legacy-orbit legacy-orbit-a') !== -1 && index.indexOf('legacy-orbit legacy-orbit-b') !== -1 && index.indexOf('legacy-orb-core') !== -1, 'the legacy activity visual must retain a core and two orbiting energy layers');
assert.ok(styles.indexOf('.server-activity.is-active .processing-orb-legacy') !== -1, 'active activity state must enable the CSS orb');
assert.ok(styles.indexOf('@-webkit-keyframes ploff-legacy-orbit-a') !== -1, 'legacy activity orbit must use prefixed Chrome 53 keyframes');
assert.ok(styles.indexOf('@keyframes ploff-legacy-orbit-b') !== -1, 'legacy activity orbit must expose standard keyframes too');

console.log('Plex activity orb checks passed');
