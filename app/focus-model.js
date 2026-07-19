(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffFocusModel = factory();
  }
}(this, function () {
  'use strict';

  function copy(state) {
    return {
      area: state.area,
      navIndex: state.navIndex,
      rowIndex: state.rowIndex,
      column: state.column
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function move(state, direction, layout) {
    var next = copy(state);
    var rowLength;

    if (next.area === 'nav') {
      if (direction === 'left') {
        next.navIndex = clamp(next.navIndex - 1, 0, layout.navCount - 1);
      } else if (direction === 'right') {
        next.navIndex = clamp(next.navIndex + 1, 0, layout.navCount - 1);
      } else if (direction === 'down' && layout.rowLengths.length) {
        next.area = 'media';
        next.navIndex = 0;
        next.rowIndex = 0;
        next.column = clamp(next.column, 0, layout.rowLengths[0] - 1);
      }
      return next;
    }

    rowLength = layout.rowLengths[next.rowIndex];
    if (direction === 'left') {
      next.column = clamp(next.column - 1, 0, rowLength - 1);
    } else if (direction === 'right') {
      next.column = clamp(next.column + 1, 0, rowLength - 1);
    } else if (direction === 'up') {
      if (next.rowIndex === 0) {
        next.area = 'nav';
      } else {
        next.rowIndex -= 1;
        next.column = clamp(next.column, 0, layout.rowLengths[next.rowIndex] - 1);
      }
    } else if (direction === 'down' && next.rowIndex < layout.rowLengths.length - 1) {
      next.rowIndex += 1;
      next.column = clamp(next.column, 0, layout.rowLengths[next.rowIndex] - 1);
    }

    return next;
  }

  return { move: move };
}));
