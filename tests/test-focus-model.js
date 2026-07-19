'use strict';

var assert = require('assert');
var FocusModel = require('../app/focus-model');

var layout = { navCount: 5, rowLengths: [6, 7] };

function media(row, column) {
  return { area: 'media', navIndex: 0, rowIndex: row, column: column };
}

assert.deepStrictEqual(
  FocusModel.move(media(0, 0), 'left', layout),
  media(0, 0),
  'left must clamp at the beginning of a row'
);

assert.deepStrictEqual(
  FocusModel.move(media(0, 5), 'right', layout),
  media(0, 5),
  'right must clamp at the end of a row'
);

assert.deepStrictEqual(
  FocusModel.move(media(1, 6), 'up', layout),
  media(0, 5),
  'vertical movement must retain and clamp the column'
);

assert.deepStrictEqual(
  FocusModel.move(media(0, 3), 'up', layout),
  { area: 'nav', navIndex: 0, rowIndex: 0, column: 3 },
  'up from the first row must enter navigation'
);

assert.deepStrictEqual(
  FocusModel.move(
    { area: 'nav', navIndex: 2, rowIndex: 0, column: 4 },
    'down',
    layout
  ),
  media(0, 4),
  'down from navigation must restore the previous media column'
);

assert.deepStrictEqual(
  FocusModel.move(
    { area: 'nav', navIndex: 2, rowIndex: 0, column: 4 },
    'right',
    layout
  ),
  { area: 'nav', navIndex: 3, rowIndex: 0, column: 4 },
  'horizontal movement in navigation must change nav item only'
);

console.log('focus model checks passed');
