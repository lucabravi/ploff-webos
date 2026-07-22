(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryGridView = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = {
      mode: 'catalog', usesGridScroll: true, contentActive: true,
      items: [], recommendations: [], totalSize: 0,
      focus: { zone: 'grid', index: 0, recommendationRow: 0 },
      layout: { columns: 1, visibleRows: 1, totalRows: 0, cardWidth: 0, cardHeight: 0 },
      window: { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 },
      scrollTimer: null
    };

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function metrics() { return values.cardMetrics ? values.cardMetrics() : { width: 200, imageHeight: 300, columnStep: 220, rowStep: 360 }; }
    function element(tagName, className, text) {
      if (values.element) { return values.element(tagName, className, text); }
      var value = documentRef.createElement(tagName);
      value.className = className || '';
      if (text !== undefined) { value.textContent = String(text); }
      return value;
    }
    function mediaTitle(item) { return values.mediaTitle ? values.mediaTitle(item) : String(item && item.title || ''); }
    function mediaMeta(item) { return values.mediaCardMeta ? values.mediaCardMeta(item) : ''; }
    function mediaDetail(item) { return values.mediaCardDetail ? values.mediaCardDetail(item) : ''; }
    function mediaKey(item) { return item ? String(values.mediaKey ? values.mediaKey(item) : (item.ratingKey || item.key || '')) : ''; }
    function clearFocus() { if (values.clearFocus) { values.clearFocus(); } }
    function pointerSelectionActive() { return values.pointerSelectionActive ? values.pointerSelectionActive() : false; }

    function updateText(target, text) {
      if (target) { target.textContent = String(text || ''); }
    }

    function card(index, item, recommendationRow) {
      var result = element('button', 'library-card' + (recommendationRow !== undefined ? ' library-recommendation-card' : ''));
      var image = element('img', 'library-card-image');
      var caption = element('span', 'library-card-caption');
      image.alt = '';
      result.type = 'button';
      result.appendChild(image);
      caption.appendChild(element('span', 'library-card-title'));
      caption.appendChild(element('span', 'library-card-meta'));
      caption.appendChild(element('span', 'library-card-detail'));
      result.appendChild(caption);
      updateCard(result, index, item, recommendationRow);
      return result;
    }

    function updateProgress(target, item) {
      var progress = target.querySelector('.progress-track');
      var value;
      if (typeof item.progress === 'number') {
        if (!progress) {
          progress = element('span', 'progress-track');
          progress.appendChild(element('span', 'progress-value'));
          target.appendChild(progress);
        }
        value = progress.querySelector('.progress-value');
        if (value) { value.style.width = clamp(item.progress, 0, 100) + '%'; }
      } else if (progress && progress.parentNode) {
        progress.parentNode.removeChild(progress);
      }
    }

    function updateCard(target, index, item, recommendationRow) {
      var badge = target.querySelector('.library-rating-badge');
      var caption = target.querySelector('.library-card-caption');
      var meta = mediaMeta(item);
      var detail = mediaDetail(item);
      target.setAttribute('data-media-key', mediaKey(item));
      target.setAttribute('aria-label', [mediaTitle(item), meta, detail].filter(function (value) { return !!value; }).join(', '));
      if (recommendationRow === undefined) { target.setAttribute('data-library-index', index); }
      else {
        target.setAttribute('data-library-recommendation-row', recommendationRow);
        target.setAttribute('data-library-recommendation-column', index);
      }
      updateText(target.querySelector('.library-card-title'), mediaTitle(item));
      updateText(target.querySelector('.library-card-meta'), meta);
      updateText(target.querySelector('.library-card-detail'), detail);
      if (typeof item.rating === 'number' && !isNaN(item.rating)) {
        if (!badge) {
          badge = element('span', 'library-rating-badge');
          target.insertBefore(badge, caption);
        }
        updateText(badge, '\u2665 ' + item.rating.toFixed(1));
      } else if (badge && badge.parentNode) {
        badge.parentNode.removeChild(badge);
      }
      updateProgress(target, item);
    }

    function queuePoster(target, item, priority, jobs) {
      var image = target.getElementsByTagName('img')[0];
      if (!image || !values.renderedPosterSpecification) { return; }
      jobs.push({ target: image, specification: values.renderedPosterSpecification(image, item.image, priority, 'library', metrics().width, metrics().imageHeight) });
    }

    function applyCatalogFocus(target, index, item, visibleStart, visibleEnd, jobs) {
      var focused = state.contentActive && state.focus.index === index;
      target.className = 'library-card' + (item.viewed ? ' is-viewed' : '') + (focused ? ' is-focused' : '');
      queuePoster(target, item, focused ? 0 : (index >= visibleStart && index < visibleEnd ? 1 : 2), jobs);
    }

    function catalogWindow(container, layout, cardMetrics) {
      var totalRows = Math.ceil(state.items.length / layout.columns);
      var visibleStart = clamp(Math.floor(Number(container.scrollTop || 0) / cardMetrics.rowStep), 0, Math.max(0, totalRows - layout.visibleRows));
      var overscan = Math.max(0, Number(values.overscanRows === undefined ? 3 : values.overscanRows));
      var startRow = Math.max(0, visibleStart - overscan);
      var endRow = Math.min(totalRows, visibleStart + layout.visibleRows + overscan);
      return { start: startRow * layout.columns, end: Math.min(state.items.length, endRow * layout.columns), visibleStartRow: visibleStart, offsetRows: visibleStart - startRow };
    }

    function recommendationKey(row, index) {
      return String(row && (row.identifier || row.key || row.title) || index);
    }

    function renderCatalog() {
      var container = node('library-grid');
      var content = node('library-grid-content');
      var cardMetrics = metrics();
      var existing = {};
      var existingByKey = {};
      var used = [];
      var children;
      var index;
      var target;
      var visibleStart;
      var visibleEnd;
      var jobs = [];
      if (!container || !content) { return; }
      children = content.children;
      for (index = 0; index < children.length; index += 1) {
        if (children[index].hasAttribute('data-library-index')) {
          existing[children[index].getAttribute('data-library-index')] = children[index];
          existingByKey[children[index].getAttribute('data-media-key')] = children[index];
        }
      }
      state.layout = (values.SearchModel || {}).measureLayout((container.clientWidth || 1612) - 12, container.clientHeight || 600, cardMetrics.columnStep, cardMetrics.rowStep, state.items.length);
      state.layout.visibleRows = state.usesGridScroll ? Math.max(1, Math.ceil((container.clientHeight || 600) / cardMetrics.rowStep)) : 1;
      state.layout.cardWidth = cardMetrics.width;
      state.layout.cardHeight = cardMetrics.rowStep;
      if (state.usesGridScroll) {
        state.window = catalogWindow(container, state.layout, cardMetrics);
        content.className = 'library-grid-content is-catalog';
        content.style.height = (state.layout.totalRows * cardMetrics.rowStep) + 'px';
      } else {
        state.window = values.SearchModel.virtualWindow(state.focus.index, state.items.length, state.layout.columns, state.layout.visibleRows, values.overscanRows === undefined ? 3 : values.overscanRows, state.window.visibleStartRow);
        content.className = 'library-grid-content';
        content.style.height = 'auto';
      }
      visibleStart = state.window.visibleStartRow * state.layout.columns;
      visibleEnd = Math.min(state.items.length, visibleStart + state.layout.visibleRows * state.layout.columns);
      for (index = state.window.start; index < state.window.end; index += 1) {
        target = existingByKey[mediaKey(state.items[index])];
        if (target && used.indexOf(target) !== -1) { target = null; }
        if (!target) {
          target = existing[index];
          if (target && used.indexOf(target) !== -1) { target = null; }
        }
        if (!target) { target = card(index, state.items[index]); }
        used.push(target);
        updateCard(target, index, state.items[index]);
        applyCatalogFocus(target, index, state.items[index], visibleStart, visibleEnd, jobs);
        if (state.usesGridScroll) {
          target.style.left = ((index % state.layout.columns) * cardMetrics.columnStep) + 'px';
          target.style.top = (Math.floor(index / state.layout.columns) * cardMetrics.rowStep) + 'px';
          target.style.width = cardMetrics.width + 'px';
        } else { target.style.left = ''; target.style.top = ''; target.style.width = ''; }
        content.appendChild(target);
      }
      for (index = content.children.length - 1; index >= 0; index -= 1) {
        if (used.indexOf(content.children[index]) === -1) { content.removeChild(content.children[index]); }
      }
      if (values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
    }

    function renderRecommendations() {
      var container = node('library-recommended');
      var grid = node('library-grid');
      var jobs = [];
      var existingSections = {};
      var usedSections = [];
      var existingCards;
      var usedCards;
      var children;
      var rowIndex;
      var column;
      var rowData;
      var rowKey;
      var section;
      var row;
      var target;
      var title;
      if (!container || !grid) { return; }
      if (state.mode !== 'recommended') { container.className = 'library-recommended is-hidden'; grid.className = 'library-grid'; return; }
      container.className = 'library-recommended';
      grid.className = 'library-grid is-hidden';
      children = container.children;
      for (rowIndex = 0; rowIndex < children.length; rowIndex += 1) {
        if (children[rowIndex].hasAttribute('data-library-recommendation-key')) {
          existingSections[children[rowIndex].getAttribute('data-library-recommendation-key')] = children[rowIndex];
        }
      }
      for (rowIndex = 0; rowIndex < state.recommendations.length; rowIndex += 1) {
        rowData = state.recommendations[rowIndex];
        rowKey = recommendationKey(rowData, rowIndex);
        section = existingSections[rowKey] || element('section', 'library-recommendation-section');
        section.setAttribute('data-library-recommendation-key', rowKey);
        title = section.querySelector('.library-recommendation-title');
        if (!title) { title = element('h3', 'library-recommendation-title'); section.appendChild(title); }
        updateText(title, values.recommendationTitle ? values.recommendationTitle(rowData) : rowData.title);
        row = section.querySelector('.library-recommendation-row');
        if (!row) { row = element('div', 'library-recommendation-row'); section.appendChild(row); }
        existingCards = {};
        usedCards = [];
        children = row.children;
        for (column = 0; column < children.length; column += 1) {
          existingCards[children[column].getAttribute('data-media-key')] = children[column];
        }
        for (column = 0; column < array(rowData.items).length; column += 1) {
          target = existingCards[mediaKey(rowData.items[column])] || card(column, rowData.items[column], rowIndex);
          usedCards.push(target);
          updateCard(target, column, rowData.items[column], rowIndex);
          target.className = 'library-card library-recommendation-card' + (rowData.items[column].viewed ? ' is-viewed' : '') + (state.contentActive && state.focus.recommendationRow === rowIndex && state.focus.index === column ? ' is-focused' : '');
          row.appendChild(target);
          queuePoster(target, rowData.items[column], state.contentActive && state.focus.recommendationRow === rowIndex && state.focus.index === column ? 0 : 1, jobs);
        }
        for (column = row.children.length - 1; column >= 0; column -= 1) {
          if (usedCards.indexOf(row.children[column]) === -1) { row.removeChild(row.children[column]); }
        }
        container.appendChild(section);
        usedSections.push(section);
      }
      for (rowIndex = container.children.length - 1; rowIndex >= 0; rowIndex -= 1) {
        if (usedSections.indexOf(container.children[rowIndex]) === -1) { container.removeChild(container.children[rowIndex]); }
      }
      if (values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
    }

    function render() { if (state.mode === 'recommended') { renderRecommendations(); } else { renderCatalog(); renderRecommendations(); } return snapshot(); }

    function focusTarget() {
      var target;
      var image;
      if (!state.contentActive) { return; }
      if (state.mode === 'recommended') { target = documentRef.querySelector('[data-library-recommendation-row="' + state.focus.recommendationRow + '"][data-library-recommendation-column="' + state.focus.index + '"]'); }
      else { target = documentRef.querySelector('[data-library-index="' + state.focus.index + '"]'); }
      if (target && (' ' + target.className + ' ').indexOf(' is-focused ') === -1) { target.className += ' is-focused'; }
      image = target && target.getElementsByTagName('img')[0];
      if (image && values.posterLoader && values.posterLoader.prioritize) { values.posterLoader.prioritize(image); }
      if (target && !pointerSelectionActive()) {
        target.focus();
        keepVisible(target);
      }
      if (values.onFocus) { values.onFocus(snapshot().focus, focusedItem()); }
    }

    function keepVisible(target) {
      var container = node(target.hasAttribute('data-library-recommendation-row') ? 'library-recommended' : 'library-grid');
      var targetRect;
      var containerRect;
      var horizontal;
      if (!target || !container || !target.getBoundingClientRect || !container.getBoundingClientRect) { return; }
      targetRect = target.getBoundingClientRect(); containerRect = container.getBoundingClientRect();
      if (targetRect.bottom > containerRect.bottom - 12) { container.scrollTop += targetRect.bottom - containerRect.bottom + 12; }
      else if (targetRect.top < containerRect.top + 12) { container.scrollTop -= containerRect.top - targetRect.top + 12; }
      if (target.hasAttribute('data-library-recommendation-row')) {
        horizontal = target.parentNode; containerRect = horizontal.getBoundingClientRect();
        if (targetRect.right > containerRect.right - 12) { horizontal.scrollLeft += targetRect.right - containerRect.right + 12; }
        else if (targetRect.left < containerRect.left + 12) { horizontal.scrollLeft -= containerRect.left - targetRect.left + 12; }
      }
    }

    function refreshFocus() { clearFocus(); render(); focusTarget(); return snapshot(); }
    function refreshRenderedFocus() { clearFocus(); focusTarget(); return snapshot(); }
    function setMode(mode, usesGridScroll) { state.mode = mode === 'recommended' ? 'recommended' : 'catalog'; state.usesGridScroll = !!usesGridScroll; return snapshot(); }
    function setContentActive(active) { state.contentActive = !!active; return snapshot(); }
    function setItems(items, totalSize) {
      var focusedKey = mediaKey(state.items[state.focus.index]);
      var nextItems = array(items).slice();
      var index;
      state.items = nextItems;
      state.totalSize = Number(totalSize === undefined ? state.items.length : totalSize);
      for (index = 0; focusedKey && index < state.items.length; index += 1) {
        if (mediaKey(state.items[index]) === focusedKey) { state.focus.index = index; break; }
      }
      state.focus.index = clamp(state.focus.index, 0, Math.max(0, state.items.length - 1));
      return render();
    }
    function setRecommendations(rows) {
      var previousRow = state.recommendations[state.focus.recommendationRow];
      var previousRowKey = recommendationKey(previousRow, state.focus.recommendationRow);
      var previousItemKey = mediaKey(previousRow && previousRow.items[state.focus.index]);
      var rowIndex;
      var itemIndex;
      if (state.recommendations.length && values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('library'); }
      state.recommendations = array(rows).map(function (row) { return { title: row.title, identifier: row.identifier, key: row.key, items: array(row.items).slice() }; });
      for (rowIndex = 0; previousItemKey && rowIndex < state.recommendations.length; rowIndex += 1) {
        if (recommendationKey(state.recommendations[rowIndex], rowIndex) !== previousRowKey) { continue; }
        for (itemIndex = 0; itemIndex < state.recommendations[rowIndex].items.length; itemIndex += 1) {
          if (mediaKey(state.recommendations[rowIndex].items[itemIndex]) === previousItemKey) {
            state.focus.recommendationRow = rowIndex; state.focus.index = itemIndex; break;
          }
        }
      }
      state.focus.recommendationRow = clamp(state.focus.recommendationRow, 0, Math.max(0, state.recommendations.length - 1));
      state.focus.index = clamp(state.focus.index, 0, Math.max(0, array(state.recommendations[state.focus.recommendationRow] && state.recommendations[state.focus.recommendationRow].items).length - 1));
      return render();
    }
    function focusCatalog(index) { state.mode = state.mode === 'recommended' ? 'recommended' : 'catalog'; state.focus.index = clamp(Number(index || 0), 0, Math.max(0, state.items.length - 1)); return refreshFocus(); }
    function focusRecommendations(row, index) {
      state.focus.recommendationRow = clamp(Number(row || 0), 0, Math.max(0, state.recommendations.length - 1));
      state.focus.index = clamp(Number(index || 0), 0, Math.max(0, array(state.recommendations[state.focus.recommendationRow] && state.recommendations[state.focus.recommendationRow].items).length - 1));
      return refreshFocus();
    }
    function focusedItem() {
      if (state.mode === 'recommended') { return array(state.recommendations[state.focus.recommendationRow] && state.recommendations[state.focus.recommendationRow].items)[state.focus.index] || null; }
      return state.items[state.focus.index] || null;
    }

    function handleDirection(direction) {
      var columns = Math.max(1, state.layout.columns || 1);
      var row;
      var candidate;
      var moved = false;
      if (state.mode === 'recommended') {
        row = state.recommendations[state.focus.recommendationRow];
        if (!row || !row.items.length) { return { moved: false, leave: 'content' }; }
        if (direction === 'left' && state.focus.index > 0) { state.focus.index -= 1; moved = true; }
        else if (direction === 'right' && state.focus.index < row.items.length - 1) { state.focus.index += 1; moved = true; }
        else if (direction === 'up') {
          if (state.focus.recommendationRow === 0) { return { moved: false, leave: 'content' }; }
          state.focus.recommendationRow -= 1;
          state.focus.index = Math.min(state.focus.index, state.recommendations[state.focus.recommendationRow].items.length - 1); moved = true;
        } else if (direction === 'down' && state.focus.recommendationRow < state.recommendations.length - 1) {
          state.focus.recommendationRow += 1;
          state.focus.index = Math.min(state.focus.index, state.recommendations[state.focus.recommendationRow].items.length - 1); moved = true;
        }
      } else if (!state.items.length && direction === 'up') {
        return { moved: false, leave: 'content' };
      } else if (state.items.length) {
        if (direction === 'left' && state.focus.index % columns > 0) { state.focus.index -= 1; moved = true; }
        else if (direction === 'right' && state.focus.index % columns < columns - 1 && state.focus.index + 1 < state.items.length) { state.focus.index += 1; moved = true; }
        else if (direction === 'up') {
          candidate = state.focus.index - columns;
          if (candidate < 0) { return { moved: false, leave: 'content' }; }
          state.focus.index = candidate; moved = true;
        } else if (direction === 'down') {
          candidate = values.moveGridDown ? values.moveGridDown(state.focus.index, state.items.length, columns) : Math.min(state.focus.index + columns, state.items.length - 1);
          if (candidate !== state.focus.index) { state.focus.index = candidate; moved = true; }
        }
      }
      if (moved) { refreshRenderedFocus(); }
      return { moved: moved };
    }

    function pointerFocus(target) {
      if (!target) { return snapshot(); }
      if (target.hasAttribute('data-library-index')) { state.mode = 'catalog'; state.focus.index = Number(target.getAttribute('data-library-index')) || 0; }
      else if (target.hasAttribute('data-library-recommendation-row')) {
        state.mode = 'recommended'; state.focus.recommendationRow = Number(target.getAttribute('data-library-recommendation-row')) || 0; state.focus.index = Number(target.getAttribute('data-library-recommendation-column')) || 0;
      } else { return snapshot(); }
      return refreshRenderedFocus();
    }

    function restoreFocus(target) { return pointerFocus(target); }

    function onScroll() {
      var container = node('library-grid');
      if (!state.usesGridScroll || state.mode === 'recommended' || !container) { return; }
      if (state.scrollTimer && values.root && values.root.clearTimeout) { values.root.clearTimeout(state.scrollTimer); }
      state.scrollTimer = (values.root && values.root.setTimeout ? values.root.setTimeout : function (callback) { callback(); })(function () {
        state.scrollTimer = null; renderCatalog();
        if (state.items.length < state.totalSize && container.scrollTop + container.clientHeight >= container.scrollHeight - metrics().rowStep * 2 && values.onNearEnd) { values.onNearEnd(); }
      }, 40);
    }

    function reset() {
      if (values.root && values.root.clearTimeout && state.scrollTimer) { values.root.clearTimeout(state.scrollTimer); }
      state.scrollTimer = null; state.items = []; state.recommendations = []; state.totalSize = 0; state.focus.index = 0; state.focus.recommendationRow = 0; state.window = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('library'); }
      return render();
    }

    function snapshot() {
      return { mode: state.mode, items: state.items.slice(), recommendations: state.recommendations.slice(), totalSize: state.totalSize, focus: { zone: 'grid', index: state.focus.index, recommendationRow: state.focus.recommendationRow }, layout: state.layout, window: state.window };
    }

    return { focusedItem: focusedItem, focusCatalog: focusCatalog, focusRecommendations: focusRecommendations, handleDirection: handleDirection, onScroll: onScroll, pointerFocus: pointerFocus, refreshFocus: refreshFocus, render: render, reset: reset, restoreFocus: restoreFocus, setContentActive: setContentActive, setItems: setItems, setMode: setMode, setRecommendations: setRecommendations, snapshot: snapshot };
  }

  return { create: create };
}));
