'use strict';

var assert = require('assert');
var InputTargetRouter = require('../app/input-target-router');

assert.strictEqual(InputTargetRouter.resolve({ choiceDialogOpen: true, appView: 'player' }), 'choice-dialog', 'choice dialogs take precedence over their underlying view');
assert.strictEqual(InputTargetRouter.resolve({ upNextLayoutOpen: true, appView: 'settings' }), 'up-next-layout', 'layout chooser takes precedence over settings');
assert.strictEqual(InputTargetRouter.resolve({ privacyDialogOpen: true, appView: 'home' }), 'privacy', 'privacy dialog takes precedence over home');
assert.strictEqual(InputTargetRouter.resolve({ appView: 'setup' }), 'setup', 'setup routes to its dedicated handler');
assert.strictEqual(InputTargetRouter.resolve({ appView: 'library', navReorderActive: true }), 'navigation-reorder', 'library reordering takes precedence over library input');
assert.strictEqual(InputTargetRouter.resolve({ appView: 'player' }), 'player', 'normal views keep their direct input target');
assert.strictEqual(InputTargetRouter.resolve({}), 'home', 'unknown state falls back to home');

console.log('Input target routing checks passed');
