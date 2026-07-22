(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./search-model'), require('./search-session'), require('./t9-input'));
  } else {
    root.PloffSearchView = factory(root, root.PloffSearchModel, root.PloffSearchSession, root.PloffT9Input);
  }
}(typeof window !== 'undefined' ? window : this, function (root, SearchModel, SearchSession, T9Input) {
  'use strict';

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function copyFocus(focus) {
    return {
      zone: focus.zone, row: focus.row, column: focus.column, index: focus.index, navIndex: focus.navIndex
    };
  }

  function copyLayout(layout) {
    return {
      columns: layout.columns, visibleRows: layout.visibleRows, totalRows: layout.totalRows,
      cardWidth: layout.cardWidth, cardHeight: layout.cardHeight
    };
  }

  function copyWindow(window) {
    return {
      start: window.start, end: window.end, visibleStartRow: window.visibleStartRow,
      offsetRows: window.offsetRows
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value || 0)));
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var rootRef = values.root || root;
    var model = values.SearchModel || SearchModel;
    var sessionFactory = values.SearchSession || SearchSession;
    var t9Factory = values.T9Input || T9Input;
    var state = {
      open: false,
      query: '',
      symbolMode: false,
      t9Preview: '',
      results: [],
      focus: { zone: 'keyboard', row: 0, column: 0, index: 0, navIndex: 0 },
      layout: { columns: 1, visibleRows: 1, totalRows: 0, cardWidth: 0, cardHeight: 0 },
      renderWindow: { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 },
      visibleStartRow: 0,
      cardRenderToken: 0
    };
    var session;
    var t9Input;

    function text(key) {
      return values.t ? values.t(key) : key;
    }

    function node(id) {
      return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null;
    }

    function createElement(tagName, className, content) {
      var value;
      if (values.element) { return values.element(tagName, className, content); }
      value = documentRef.createElement(tagName);
      value.className = className || '';
      if (content !== undefined) { value.appendChild(documentRef.createTextNode(String(content))); }
      return value;
    }

    function setText(value, content) {
      var textNode;
      if (!value) { return; }
      value.innerHTML = '';
      textNode = documentRef.createTextNode ? documentRef.createTextNode(String(content || '')) : null;
      if (textNode) { value.appendChild(textNode); }
      else { value.textContent = String(content || ''); }
    }

    function setStatus(key) {
      var status = node(values.statusId || 'search-status');
      if (status) { setText(status, key ? text(key) : ''); }
      if (values.onStatus) { values.onStatus(key || ''); }
    }

    function isT9Enabled() {
      return typeof values.t9Enabled === 'function' ? !!values.t9Enabled() : values.t9Enabled !== false;
    }

    function rows() {
      return state.symbolMode ? model.symbolRows : model.letterRows;
    }

    function keyLabel(key) {
      if (key === 'shift') { return state.symbolMode ? text('search.letters') : text('search.symbols'); }
      if (key === 'space') { return text('search.space'); }
      if (key === 'backspace') { return text('search.backspace'); }
      if (key === 'clear') { return text('search.clear'); }
      return key;
    }

    function renderQuery() {
      var queryNode = node(values.queryId || 'search-query');
      var visibleQuery = state.query + state.t9Preview;
      if (!queryNode) { return; }
      setText(queryNode, visibleQuery || text('search.prompt'));
      queryNode.className = 'search-query' + (visibleQuery ? '' : ' is-placeholder');
    }

    function renderT9Legend() {
      var container = node(values.t9LegendId || 'search-t9-legend');
      var keys = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '']];
      var active = t9Input ? t9Input.snapshot().digit : '';
      var rowIndex;
      var column;
      var key;
      var row;
      var item;
      if (!container) { return; }
      container.innerHTML = '';
      container.className = 'search-t9-legend' + (isT9Enabled() ? '' : ' is-hidden');
      if (!isT9Enabled()) { return; }
      for (rowIndex = 0; rowIndex < keys.length; rowIndex += 1) {
        row = createElement('div', 'search-t9-legend-row');
        for (column = 0; column < keys[rowIndex].length; column += 1) {
          key = keys[rowIndex][column];
          item = createElement('span', 'search-t9-legend-key' + (key === active ? ' is-active' : ''));
          if (key) {
            item.appendChild(createElement('strong', '', key));
            item.appendChild(documentRef.createTextNode(key === '0' ? text('search.space') : T9Input.MAP[key]));
          } else { item.style.visibility = 'hidden'; }
          row.appendChild(item);
        }
        container.appendChild(row);
      }
    }

    function renderKeyboard() {
      var container = node(values.keyboardId || 'search-keyboard');
      var source = rows();
      var rowIndex;
      var column;
      var row;
      var button;
      var key;
      if (!container) { return; }
      container.innerHTML = '';
      for (rowIndex = 0; rowIndex < source.length; rowIndex += 1) {
        row = createElement('div', 'search-keyboard-row');
        for (column = 0; column < source[rowIndex].length; column += 1) {
          key = source[rowIndex][column];
          button = createElement('button', 'search-key' + (key === 'space' ? ' is-space' : (key.length > 1 ? ' is-wide' : '')), keyLabel(key));
          button.type = 'button';
          button.setAttribute('data-search-key', key);
          button.setAttribute('data-search-row', rowIndex);
          button.setAttribute('data-search-column', column);
          row.appendChild(button);
        }
        container.appendChild(row);
      }
    }

    function mediaKey(item) {
      return String(item && (item.ratingKey || item.key || item.image || item.title) || '');
    }

    function mediaTitle(item) {
      return values.mediaTitle ? values.mediaTitle(item) : String(item && item.title || '');
    }

    function mediaMeta(item) {
      return values.mediaCardMeta ? values.mediaCardMeta(item) : String(item && item.meta || '');
    }

    function mediaDetail(item) {
      return values.mediaCardDetail ? values.mediaCardDetail(item) : String(item && item.detail || '');
    }

    function createCard() {
      var card = createElement('button', 'search-card');
      var caption = createElement('span', 'search-card-caption');
      card.type = 'button';
      card.appendChild(createElement('img', 'search-card-image'));
      card.appendChild(createElement('span', 'search-library-badge'));
      caption.appendChild(createElement('span', 'search-card-title'));
      caption.appendChild(createElement('span', 'search-card-meta'));
      caption.appendChild(createElement('span', 'search-card-detail'));
      card.appendChild(caption);
      return card;
    }

    function updateCard(card, item, index, priority) {
      var image = card.getElementsByTagName('img')[0];
      var source = String(item && item.image || '');
      var title = mediaTitle(item);
      var library = String(item && (item.libraryTitle || item.library || '') || '');
      card.className = 'search-card' + (item && item.viewed ? ' is-viewed' : '');
      card.setAttribute('data-search-index', index);
      card.setAttribute('data-media-key', mediaKey(item));
      card.setAttribute('aria-label', title + (library ? ', ' + library : ''));
      setText(card.querySelector('.search-library-badge'), library);
      setText(card.querySelector('.search-card-title'), title);
      setText(card.querySelector('.search-card-meta'), mediaMeta(item));
      setText(card.querySelector('.search-card-detail'), mediaDetail(item));
      image.alt = '';
      image.setAttribute('data-search-image', source);
      image.__searchImageSource = source;
      return { target: image, specification: posterSpecification(image, source, priority) };
    }

    function posterSpecification(image, source, priority) {
      var specification;
      var fallbackWidth = Number(values.cardWidth || 154);
      var fallbackHeight = Number(values.imageHeight || values.cardHeight || 224);
      if (values.renderedPosterSpecification) {
        specification = values.renderedPosterSpecification(image, source, priority, 'search', fallbackWidth, fallbackHeight);
      } else {
        specification = {
          source: source, width: fallbackWidth, height: fallbackHeight,
          priority: priority, scope: 'search'
        };
      }
      return specification;
    }

    function measureResults(container) {
      var metrics = typeof values.cardMetrics === 'function' ? values.cardMetrics() : {};
      var cardWidth = Number(values.cardWidth || metrics.columnStep || metrics.width || 154);
      var cardHeight = Number(values.cardHeight || metrics.rowStep || metrics.height || 224);
      var measured;
      if (values.measureLayout) {
        measured = values.measureLayout(container, state.results.length, cardWidth, cardHeight);
      } else {
        measured = model.measureLayout(container.clientWidth - 12, container.clientHeight - 12, cardWidth, cardHeight, state.results.length);
      }
      measured = measured || { columns: 1, visibleRows: 1, totalRows: 0 };
      measured.cardWidth = Math.max(64, Number(measured.cardWidth || cardWidth));
      measured.cardHeight = Math.max(64, Number(measured.cardHeight || cardHeight));
      return measured;
    }

    function renderResults() {
      var container = node(values.resultsId || 'search-results');
      var existingByKey = {};
      var existing = [];
      var recyclable = [];
      var desired = {};
      var focusIndex = state.focus.zone === 'results' ? state.focus.index : state.visibleStartRow * state.layout.columns;
      var visibleStart;
      var visibleEnd;
      var index;
      var card;
      var item;
      var key;
      var priority;
      var posterJobs = [];
      var token;
      if (!container) { return; }
      for (index = 0; index < container.children.length; index += 1) {
        card = container.children[index];
        if (card.hasAttribute('data-search-index')) {
          existing.push(card);
          existingByKey[card.getAttribute('data-media-key') || ''] = card;
        }
      }
      if (!state.results.length) {
        container.innerHTML = '';
        state.layout = { columns: 1, visibleRows: 1, totalRows: 0, cardWidth: Number(values.cardWidth || 154), cardHeight: Number(values.cardHeight || 224) };
        state.renderWindow = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
        state.visibleStartRow = 0;
        return;
      }
      state.layout = measureResults(container);
      state.renderWindow = model.virtualWindow(
        focusIndex, state.results.length, state.layout.columns, state.layout.visibleRows,
        Number(values.resultOverscanRows || 0), state.visibleStartRow
      );
      state.visibleStartRow = state.renderWindow.visibleStartRow;
      visibleStart = state.visibleStartRow * state.layout.columns;
      visibleEnd = Math.min(state.results.length, visibleStart + state.layout.visibleRows * state.layout.columns);
      for (index = state.renderWindow.start; index < state.renderWindow.end; index += 1) {
        desired[mediaKey(state.results[index])] = true;
      }
      for (index = 0; index < existing.length; index += 1) {
        if (!desired[existing[index].getAttribute('data-media-key') || '']) { recyclable.push(existing[index]); }
      }
      state.cardRenderToken += 1;
      token = state.cardRenderToken;
      for (index = state.renderWindow.start; index < state.renderWindow.end; index += 1) {
        item = state.results[index];
        key = mediaKey(item);
        card = existingByKey[key];
        if (!card || card.__searchRenderToken === token) { card = recyclable.shift() || createCard(); }
        card.__searchRenderToken = token;
        priority = state.focus.zone === 'results' && index === state.focus.index ? 0 : (index >= visibleStart && index < visibleEnd ? 1 : 2);
        posterJobs.push(updateCard(card, item, index, priority));
        container.appendChild(card);
      }
      if (values.posterLoader && values.posterLoader.loadBatch) {
        values.posterLoader.loadBatch(posterJobs);
      } else if (values.posterLoader && values.posterLoader.load) {
        posterJobs.forEach(function (job) { values.posterLoader.load(job.target, job.specification); });
      }
      for (index = 0; index < existing.length; index += 1) {
        if (existing[index].__searchRenderToken !== token && existing[index].parentNode === container) { container.removeChild(existing[index]); }
      }
      container.scrollTop = state.renderWindow.offsetRows * state.layout.cardHeight;
    }

    function ensureWindow() {
      var nextWindow;
      if (state.focus.zone !== 'results' || !state.results.length) { return; }
      nextWindow = model.virtualWindow(
        state.focus.index, state.results.length, state.layout.columns, state.layout.visibleRows,
        Number(values.resultOverscanRows || 0), state.visibleStartRow
      );
      if (nextWindow.start !== state.renderWindow.start || nextWindow.end !== state.renderWindow.end) { renderResults(); }
    }

    function keepFocusVisible(target) {
      var container;
      var nodeRect;
      var containerRect;
      if (!target || !target.hasAttribute || !target.hasAttribute('data-search-index')) { return; }
      container = node(values.resultsId || 'search-results');
      if (!container || !target.getBoundingClientRect || !container.getBoundingClientRect) { return; }
      nodeRect = target.getBoundingClientRect();
      containerRect = container.getBoundingClientRect();
      if (nodeRect.bottom > containerRect.bottom) { container.scrollTop += nodeRect.bottom - containerRect.bottom + 12; }
      else if (nodeRect.top < containerRect.top) { container.scrollTop -= containerRect.top - nodeRect.top + 12; }
    }

    function targetForFocus() {
      var selector;
      if (state.focus.zone === 'nav') { return values.navTarget ? values.navTarget(state.focus.navIndex) : null; }
      if (state.focus.zone === 'keyboard') {
        selector = '[data-search-row="' + state.focus.row + '"][data-search-column="' + state.focus.column + '"]';
      } else { selector = '[data-search-index="' + state.focus.index + '"]'; }
      return documentRef && documentRef.querySelector ? documentRef.querySelector(selector) : null;
    }

    function updateFocus() {
      var target;
      ensureWindow();
      if (values.clearFocus) { values.clearFocus(); }
      target = targetForFocus();
      if (target) {
        target.className += ' is-focused';
        if (state.focus.zone === 'results' && values.prioritizePoster) { values.prioritizePoster(target); }
        if (!values.pointerSelectionActive || !values.pointerSelectionActive()) {
          if (target.focus) { target.focus(); }
          keepFocusVisible(target);
        }
      }
      if (values.onFocus) { values.onFocus(copyFocus(state.focus), target || null); }
      if (state.focus.zone === 'results' && state.results[state.focus.index] && values.onBackdrop) {
        values.onBackdrop(state.results[state.focus.index]);
      }
      return target;
    }

    function searchLayout() {
      return {
        keyboardRows: rows().map(function (row) { return row.length; }),
        resultColumns: state.layout.columns,
        resultCount: state.results.length
      };
    }

    function scheduleQuery() {
      if (session) { session.update(state.query); }
    }

    function applyResults(error, items) {
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('search'); }
      state.results = error ? [] : array(items).slice();
      state.visibleStartRow = 0;
      if (state.focus.zone === 'results' && !state.results.length) {
        state.focus = { zone: 'keyboard', row: rows().length - 1, column: 0, index: 0, navIndex: state.focus.navIndex };
      } else if (state.focus.zone === 'results') {
        state.focus.index = clamp(state.focus.index, 0, state.results.length - 1);
      }
      renderResults();
      setStatus(error ? 'search.error' : (state.results.length ? '' : 'search.noResults'));
      updateFocus();
    }

    function applyKey(key) {
      var previousQuery = state.query;
      var result;
      if (t9Input) { t9Input.flush(); }
      result = model.applyKey(state.query, key, state.symbolMode);
      state.query = result.query;
      state.symbolMode = result.symbolMode;
      if (key === 'shift') {
        state.focus.row = state.symbolMode ? 2 : 3;
        state.focus.column = 0;
        state.focus.zone = 'keyboard';
      }
      renderQuery();
      renderKeyboard();
      renderT9Legend();
      if (previousQuery !== state.query) { scheduleQuery(); }
      else { updateFocus(); }
    }

    function move(direction) {
      var navigationCount = typeof values.navigationCount === 'function' ? values.navigationCount() : values.navigationCount;
      var navigationIndex = state.focus.navIndex;
      if (state.focus.zone === 'nav' && (direction === 'left' || direction === 'right')) {
        state.focus.navIndex = clamp(
          state.focus.navIndex + (direction === 'left' ? -1 : 1), 0, Math.max(0, Number(navigationCount || 1) - 1)
        );
        if (values.onNavigationChange) { values.onNavigationChange(state.focus.navIndex); }
      } else {
        state.focus = model.move(state.focus, direction, searchLayout());
        state.focus.navIndex = navigationIndex;
      }
      updateFocus();
      return snapshot();
    }

    function activate() {
      var item;
      if (state.focus.zone === 'nav') {
        if (values.onActivateNavigation) { values.onActivateNavigation(state.focus.navIndex); }
        return { action: 'navigation', index: state.focus.navIndex };
      }
      if (state.focus.zone === 'keyboard') {
        applyKey(rows()[state.focus.row][state.focus.column]);
        return { action: 'key' };
      }
      item = state.results[state.focus.index];
      if (item && values.onOpenResult) { values.onOpenResult(item, state.focus.index); }
      return item ? { action: 'result', item: item } : { action: 'none' };
    }

    function open(keepNavigationFocus, navigationIndex) {
      var nextNavigationIndex = typeof navigationIndex === 'number' ? navigationIndex : state.focus.navIndex;
      if (session) { session.cancel(); }
      if (t9Input) { t9Input.cancel(); }
      state.open = true;
      state.query = '';
      state.symbolMode = false;
      state.t9Preview = '';
      state.results = [];
      state.visibleStartRow = 0;
      state.renderWindow = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
      state.focus = keepNavigationFocus
        ? { zone: 'nav', row: 0, column: 0, index: 0, navIndex: nextNavigationIndex }
        : { zone: 'keyboard', row: 0, column: 0, index: 0, navIndex: nextNavigationIndex };
      if (node(values.viewId || 'search-view')) { node(values.viewId || 'search-view').className = 'search-view'; }
      renderQuery();
      renderKeyboard();
      renderT9Legend();
      renderResults();
      setStatus('search.typeMore');
      updateFocus();
      return snapshot();
    }

    function close(notify) {
      if (session) { session.cancel(); }
      if (t9Input) { t9Input.cancel(); }
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('search'); }
      state.open = false;
      state.t9Preview = '';
      if (node(values.viewId || 'search-view')) { node(values.viewId || 'search-view').className = 'search-view is-hidden'; }
      if (notify && values.onBack) { values.onBack(snapshot()); }
      return snapshot();
    }

    function back() {
      if (!state.open) { return false; }
      if (t9Input && t9Input.backspace()) { return true; }
      if (state.query) {
        state.query = '';
        renderQuery();
        scheduleQuery();
        return true;
      }
      close(true);
      return true;
    }

    function setFocus(focus) {
      var next = focus || state.focus;
      var navIndex = typeof next.navIndex === 'number' ? next.navIndex : (state.focus.navIndex || 0);
      state.focus = copyFocus(next);
      state.focus.navIndex = navIndex;
      updateFocus();
      return snapshot();
    }

    function focusNavigation(index) {
      var navigationCount = typeof values.navigationCount === 'function' ? values.navigationCount() : values.navigationCount;
      state.focus = { zone: 'nav', row: 0, column: 0, index: 0, navIndex: clamp(index, 0, Math.max(0, Number(navigationCount || 1) - 1)) };
      return setFocus(state.focus);
    }

    function focusKeyboard(row, column) {
      var source = rows();
      var nextRow = clamp(row, 0, source.length - 1);
      state.focus = { zone: 'keyboard', row: nextRow, column: clamp(column, 0, source[nextRow].length - 1), index: 0, navIndex: state.focus.navIndex };
      return setFocus(state.focus);
    }

    function focusResult(index) {
      var nextIndex;
      if (!state.results.length) { return snapshot(); }
      nextIndex = clamp(index, 0, state.results.length - 1);
      state.focus = {
        zone: 'results', row: Math.floor(nextIndex / state.layout.columns), column: nextIndex % state.layout.columns,
        index: nextIndex, navIndex: state.focus.navIndex
      };
      return setFocus(state.focus);
    }

    function pointerFocus(target) {
      if (!target || !target.getAttribute) { return snapshot(); }
      if (target.hasAttribute('data-nav-index')) { return focusNavigation(Number(target.getAttribute('data-nav-index'))); }
      if (target.hasAttribute('data-search-key')) {
        return focusKeyboard(Number(target.getAttribute('data-search-row')), Number(target.getAttribute('data-search-column')));
      }
      if (target.hasAttribute('data-search-index')) { return focusResult(Number(target.getAttribute('data-search-index'))); }
      return snapshot();
    }

    function inputKeyCode(value) {
      return t9Input ? t9Input.inputKeyCode(value) : false;
    }

    function snapshot() {
      return {
        open: state.open, query: state.query, symbolMode: state.symbolMode, t9Preview: state.t9Preview,
        results: state.results.slice(), focus: copyFocus(state.focus), layout: copyLayout(state.layout),
        renderWindow: copyWindow(state.renderWindow), visibleStartRow: state.visibleStartRow
      };
    }

    session = sessionFactory.create({
      root: rootRef,
      isActive: function () { return state.open && (!values.isActive || values.isActive()); },
      load: values.load || function (query, callback) { callback(null, [], true); return null; },
      onLoading: function () { setStatus('search.loading'); },
      onResults: applyResults,
      onTypeMore: function () {
        if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('search'); }
        state.results = [];
        state.visibleStartRow = 0;
        renderResults();
        setStatus('search.typeMore');
        if (state.focus.zone === 'results') { focusKeyboard(rows().length - 1, 0); }
        else { updateFocus(); }
      }
    });

    t9Input = t9Factory.create({
      root: rootRef,
      delay: Number(values.t9Delay || 700),
      onPreview: function (character) {
        state.t9Preview = character || '';
        renderQuery();
        renderT9Legend();
      },
      onCommit: function (character) {
        state.t9Preview = '';
        if (state.query.length < 80) { state.query = (state.query + character).slice(0, 80); }
        renderQuery();
        renderT9Legend();
        scheduleQuery();
      }
    });

    return {
      activate: activate,
      applyKey: applyKey,
      back: back,
      backspaceT9: function () { return t9Input ? t9Input.backspace() : false; },
      cancel: function () { session.cancel(); if (t9Input) { t9Input.cancel(); } },
      close: function () { return close(false); },
      ensureWindow: ensureWindow,
      focusKeyboard: focusKeyboard,
      focusNavigation: focusNavigation,
      focusResult: focusResult,
      handleDirection: move,
      flushT9: function () { if (t9Input) { t9Input.flush(); } },
      inputKeyCode: inputKeyCode,
      open: open,
      pointerFocus: pointerFocus,
      refreshFocus: updateFocus,
      refreshResults: renderResults,
      render: function () {
        renderQuery(); renderKeyboard(); renderT9Legend(); renderResults(); updateFocus(); return snapshot();
      },
      schedule: scheduleQuery,
      setFocus: setFocus,
      setResults: applyResults,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
