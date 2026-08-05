'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
var choiceDialog = fs.readFileSync(path.join(__dirname, '..', 'app', 'choice-dialog-view.js'), 'utf8');


assert.ok(/:root\s*\{[\s\S]*--action-surface:\s*#292c31;/.test(styles), 'action surfaces must have one visual authority');
assert.ok(/:root\s*\{[\s\S]*--focus-shadow:\s*0 0 0 5px var\(--focus-color\);/.test(styles), 'neutral focus rings must have one visual authority');
assert.ok(/:root\s*\{[\s\S]*--primary-focus-shadow:\s*0 0 0 2px #111317, 0 0 0 6px var\(--focus-color\);/.test(styles), 'primary focus rings must have one visual authority');
[
  'diagnostics-actions button', 'player-error-actions button', 'queue-gap-actions button',
  'resume-choice-actions button', 'view-state-actions button'
].forEach(function (selector) {
  var focused = new RegExp('\\.' + selector.replace(/ /g, '\\s+') + '\\.is-focused\\s*\\{([^}]*)\\}');
  var match = focused.exec(styles);
  assert.ok(match, selector + ' must expose a focused state');
  assert.ok(/box-shadow:\s*var\(--focus-shadow\)/.test(match[1]), selector + ' must use the neutral shared focus ring');
  assert.ok(!/background:\s*var\(--accent/.test(match[1]), selector + ' focus must not imply a primary action');
});
[
  '.library-filter-actions button.is-primary.is-focused',
  '.setup-action.is-primary.is-focused',
  '.detail-action:not(.detail-action-secondary).is-focused',
  '.up-next-layout-actions button:last-child.is-focused',
  '.subtitle-editor-commit-group button.is-primary.is-focused',
  '.autoplay-actions #autoplay-play.is-focused'
].forEach(function (selector) {
  var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  assert.ok(new RegExp(escaped + '\\s*\\{[^}]*box-shadow:\\s*var\\(--primary-focus-shadow\\)').test(styles), selector + ' must use the shared primary focus ring');
});

assert.ok(/:root\s*\{[\s\S]*--control-surface:\s*#202328;[\s\S]*--control-surface-focused:\s*#2b2f35;[\s\S]*--control-value:\s*#c9cdd2;[\s\S]*--panel-surface:\s*#15171b;/.test(styles), 'shared control and panel surfaces must have one visual authority');
[
  'app-setting-row', 'language-editor-row', 'setting-row', 'subtitle-editor-row',
  'choice-dialog-option', 'library-filter-row', 'library-filter-option',
  'server-editor-row', 'setup-option', 'up-next-layout-option'
].forEach(function (className) {
  var expression = new RegExp('\\.' + className + '\\s*\\{[^}]*background:\\s*var\\(--control-surface\\)');
  assert.ok(expression.test(styles), className + ' must use the shared control surface');
});
assert.ok(/\.choice-dialog-panel\s*\{[^}]*background:\s*var\(--panel-surface\)/.test(styles), 'the shared choice dialog must use the common panel surface');
assert.ok(/\.player-settings\s*\{[^}]*background:\s*var\(--panel-surface\)/.test(styles), 'player settings must use the common panel surface');
assert.ok(/\.subtitle-editor\s*\{[^}]*background:\s*var\(--panel-surface\)/.test(styles), 'subtitle settings must use the common panel surface');
assert.ok(/choice-dialog-option'\s*\+\s*\(index === state\.selectedIndex \? ' is-selected' : ''\)/.test(choiceDialog), 'choice dialogs must keep the applied value visually selected while focus moves');
assert.ok(/setAttribute\('aria-selected', index === state\.selectedIndex \? 'true' : 'false'\)/.test(choiceDialog), 'choice dialogs must expose the applied value to assistive technology');
assert.ok(/\.choice-dialog-option\.is-selected:after\s*\{[^}]*content:'\\2713'/.test(styles), 'choice dialogs must mark the applied value without replacing their vertical list');
assert.ok(!/stepper/i.test(choiceDialog), 'the reusable modal must remain a plain vertical list instead of rendering stepped controls');
assert.ok(/\.language-editor-actions button,\s*\.detail-summary-dialog-close,\s*\.media-info-dialog-close,\s*\.choice-dialog-actions button,\s*\.privacy-dialog-close\s*\{[^}]*background:\s*var\(--action-surface\)[^}]*color:\s*var\(--action-text\)/.test(styles), 'persistent dialog exits must share one action surface declaration');
assert.ok(/\.language-editor-actions button\.is-focused,\s*\.detail-summary-dialog-close\.is-focused,\s*\.media-info-dialog-close\.is-focused,\s*\.choice-dialog-actions button\.is-focused,\s*\.privacy-dialog-close\.is-focused\s*\{[^}]*box-shadow:\s*var\(--focus-shadow\)/.test(styles), 'persistent dialog exits must share one neutral focus declaration');
assert.ok(/\.language-editor\s*\{[^}]*width:\s*620px[^}]*max-width:\s*84vw[^}]*max-height:\s*76vh[^}]*transform:\s*translate\(-50%,\s*-50%\)/.test(styles), 'priority editors must use the compact centered dialog frame');
assert.ok(/\.language-editor-list\s*\{[^}]*width:\s*100%[^}]*max-height:\s*52vh/.test(styles), 'priority editors must give their ordered options the same usable width and list budget as choice dialogs');

console.log('Shared UI control style checks passed');
