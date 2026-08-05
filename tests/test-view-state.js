'use strict';

var assert = require('assert');
var ViewState = require('../app/view-state');

assert.deepStrictEqual(ViewState.model('loading', 'home'), {
  kind: 'loading', titleKey: 'state.loading', messageKey: 'state.homeLoading', actions: []
}, 'loading states must be consistent and non-interactive');
assert.deepStrictEqual(ViewState.model('error', 'detail'), {
  kind: 'error', titleKey: 'state.error', messageKey: 'state.detailError', actions: ['retry', 'back']
}, 'errors must consistently expose Retry and Back');
assert.deepStrictEqual(ViewState.model('empty', 'collections').actions, ['back'], 'empty container views must retain a Back action');
assert.strictEqual(ViewState.focusIndex(0, 2, -1), 0, 'state actions must remain left-bounded');
assert.strictEqual(ViewState.focusIndex(0, 2, 1), 1, 'state action focus must move horizontally');

console.log('View state checks passed');
