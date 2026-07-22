(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffLibraryContainers = factory();
  }
}(this, function () {
  'use strict';

  function views() {
    return ['recommended', 'continue', 'recent', 'catalog', 'collections'];
  }

  function moveControl(zone, index, direction) {
    if (zone === 'sort') {
      if (direction === 'left') { return { zone: 'sort', index: Math.max(0, index - 1) }; }
      if (index < 2) { return { zone: 'sort', index: index + 1 }; }
      return { zone: 'filter', index: 0 };
    }
    if (zone === 'filter') {
      if (direction === 'left' && index === 0) { return { zone: 'sort', index: 2 }; }
      return { zone: 'filter', index: Math.max(0, Math.min(3, index + (direction === 'left' ? -1 : 1))) };
    }
    return { zone: zone, index: index };
  }

  function moveControlVertical(zone, direction) {
    if ((zone === 'sort' || zone === 'filter') && direction === 'down') { return { zone: 'grid', index: 0 }; }
    if ((zone === 'sort' || zone === 'filter') && direction === 'up') { return { zone: 'tabs', index: 0 }; }
    return { zone: zone, index: 0 };
  }

  function moveGridDown(index, itemCount, columns) {
    var count = Math.max(0, Number(itemCount || 0));
    var columnCount = Math.max(1, Number(columns || 1));
    var current = Math.max(0, Math.min(count - 1, Number(index || 0)));
    var nextRowStart;
    if (!count) { return 0; }
    nextRowStart = (Math.floor(current / columnCount) + 1) * columnCount;
    if (nextRowStart >= count) { return current; }
    return Math.min(current + columnCount, count - 1);
  }

  function statusKey(view, loading, error, itemCount, insideContainer) {
    if (loading) { return 'library.loading'; }
    if (error) { return 'status.libraryUnavailable'; }
    if (Number(itemCount) > 0) { return ''; }
    if (!insideContainer && view === 'collections') { return 'state.collectionsEmpty'; }
    if (!insideContainer && view === 'playlists') { return 'state.playlistsEmpty'; }
    return 'state.libraryEmpty';
  }

  return { moveControl: moveControl, moveControlVertical: moveControlVertical, moveGridDown: moveGridDown, statusKey: statusKey, views: views };
}));
