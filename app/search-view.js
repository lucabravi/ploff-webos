(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./search-model'), require('./search-session'), require('./t9-input'));
  } else {
    var globalRoot = /** @type {any} */ (root);
    globalRoot.PloffSearchView = factory(globalRoot, globalRoot.PloffSearchModel, globalRoot.PloffSearchSession, globalRoot.PloffT9Input);
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
      cardRenderToken: 0,
      measurementCache: null,
      resultCards: {},
      focusTarget: null,
      lastDirection: 'right'
    };
    var session;
    var t9Input;
    var keyboardNodesByPosition = {};

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
      keyboardNodesByPosition = {};
      if (!container) { return; }
      container.innerHTML = '';
      keyboardNodesByPosition = {};
      for (rowIndex = 0; rowIndex < source.length; rowIndex += 1) {
        row = createElement('div', 'search-keyboard-row');
        for (column = 0; column < source[rowIndex].length; column += 1) {
          key = source[rowIndex][column];
          button = createElement('button', 'search-key' + (key === 'space' ? ' is-space' : (key.length > 1 ? ' is-wide' : '')) + ((key === 'backspace' || key === 'clear') ? ' is-destructive' : ''), keyLabel(key));
          button.type = 'button';
          button.setAttribute('data-search-key', key);
          button.setAttribute('data-search-row', rowIndex);
          button.setAttribute('data-search-column', column);
          keyboardNodesByPosition[rowIndex + ':' + column] = button;
          row.appendChild(button);
        }
        container.appendChild(row);
      }
    }

    function mediaKey(item) {
      var machine = String(item && item.serverMachineIdentifier || '');
      var local = String(item && (item.ratingKey || item.key || item.image || item.title) || '');
      return machine && local ? machine + '|' + local : local;
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

    function sourceContextForItem(item) {
      return values.sourceContextForItem ? values.sourceContextForItem(item) : null;
    }

    function sourceContextIdentity(context) {
      if (typeof values.sourceContextIdentity === 'function') { return String(values.sourceContextIdentity(context) || ''); }
      context = context || {};
      return String(context.serverMachineIdentifier || context.sourceId || '');
    }
    function sourceIdentityForItem(item, context) {
      if (typeof values.sourceIdentityForItem === 'function') { return String(values.sourceIdentityForItem(item, context) || ''); }
      return sourceContextIdentity(context);
    }

    function createCard() {
      var card = createElement('button', 'search-card');
      var image = createElement('img', 'search-card-image');
      var caption = createElement('span', 'search-card-caption');
      card.type = 'button';
      card.__searchImage = image;
      card.appendChild(image);
      card.appendChild(createElement('span', 'search-library-badge media-library-badge'));
      caption.appendChild(createElement('span', 'search-card-title'));
      caption.appendChild(createElement('span', 'search-card-meta'));
      caption.appendChild(createElement('span', 'search-card-detail'));
      card.appendChild(caption);
      return card;
    }

    function syncCard(card, item, index) {
      var image = card.__searchImage || (card.getElementsByTagName ? card.getElementsByTagName('img')[0] : null);
      var source = String(item && item.image || '');
      var title = mediaTitle(item);
      var library = String(item && (item.libraryTitle || item.library || '') || '');
      var meta = mediaMeta(item);
      var detail = mediaDetail(item);
      var viewed = !!(item && item.viewed);
      var key = mediaKey(item);
      var presentation = card.__searchPresentation;
      if (image && !card.__searchImage) { card.__searchImage = image; }
      if (presentation && presentation.index === index && presentation.key === key && presentation.source === source &&
          presentation.title === title && presentation.library === library && presentation.meta === meta &&
          presentation.detail === detail && presentation.viewed === viewed) {
        return image;
      }
      card.className = 'search-card' + (item && item.viewed ? ' is-viewed' : '');
      card.setAttribute('data-search-index', index);
      card.setAttribute('data-media-key', key);
      card.setAttribute('aria-label', title + (library ? ', ' + library : ''));
      setText(card.querySelector('.search-library-badge'), library);
      setText(card.querySelector('.search-card-title'), title);
      setText(card.querySelector('.search-card-meta'), meta);
      setText(card.querySelector('.search-card-detail'), detail);
      image.alt = '';
      image.setAttribute('data-search-image', source);
      image.__searchImageSource = source;
      card.__searchPresentation = {
        index: index, key: key, source: source, title: title, library: library,
        meta: meta, detail: detail, viewed: viewed
      };
      return image;
    }

    function updateCard(card, item, index, priority) {
      var image = syncCard(card, item, index);
      var source = String(item && item.image || '');
      return queuePoster(image, source, priority, item);
    }

    function cardProfile() {
      var current = typeof values.cardProfile === 'function' ? values.cardProfile() : null;
      var metrics;
      if (current) { return current; }
      metrics = typeof values.cardMetrics === 'function' ? values.cardMetrics() : {};
      return { metrics: metrics, poster: { width: Number(values.cardWidth || metrics.width || 154), height: Number(values.imageHeight || values.cardHeight || metrics.imageHeight || 224) } };
    }

    function posterSpecification(image, source, priority, currentProfile, sourceContext, item) {
      var specification;
      var profile = currentProfile || cardProfile();
      var poster = profile.poster || {};
      var fallbackWidth = Number(values.cardWidth || poster.width || 154);
      var fallbackHeight = Number(values.imageHeight || values.cardHeight || poster.height || 224);
      if (values.fixedPosterSpecification && profile.poster) {
        specification = values.fixedPosterSpecification(source, profile.poster, priority, 'search', sourceContext, item);
      } else if (values.renderedPosterSpecification) {
        specification = values.renderedPosterSpecification(image, source, priority, 'search', fallbackWidth, fallbackHeight, sourceContext, item);
      } else {
        specification = {
          source: source, width: fallbackWidth, height: fallbackHeight,
          priority: priority, scope: 'search'
        };
      }
      return specification;
    }

    function queuePoster(image, source, priority, item) {
      var profile = cardProfile();
      var poster = profile.poster || {};
      var fallbackWidth = Number(values.cardWidth || poster.width || 154);
      var fallbackHeight = Number(values.imageHeight || values.cardHeight || poster.height || 224);
      var previous = image && image.__ploffSearchPoster;
      var sourceContext = sourceContextForItem(item);
      var next = {
        source: source,
        width: Math.max(1, Number(poster.width || fallbackWidth) || 1),
        height: Math.max(1, Number(poster.height || fallbackHeight) || 1),
        priority: priority,
        sourceContext: sourceContext,
        sourceContextIdentity: sourceIdentityForItem(item, sourceContext)
      };
      var loader = values.posterLoader;
      var changed = !previous || previous.source !== next.source || previous.width !== next.width || previous.height !== next.height ||
        previous.sourceContextIdentity !== next.sourceContextIdentity;
      var canCheck = loader && typeof loader.needsLoad === 'function';
      var shouldQueue = changed || !canCheck || loader.needsLoad(image, false);
      if (image) { image.__ploffSearchPoster = next; }
      if (!shouldQueue) {
        if (previous && next.priority < previous.priority && loader && loader.prioritize) { loader.prioritize(image, next.priority); }
        return null;
      }
      return { target: image, specification: posterSpecification(image, source, priority, profile, sourceContext, item) };
    }

    function measureResults(container) {
      var profile = cardProfile();
      var metrics = profile.metrics || {};
      var cardWidth = Number(values.cardWidth || metrics.columnStep || metrics.width || 154);
      var cardHeight = Number(values.cardHeight || metrics.rowStep || metrics.height || 224);
      var width = Number(container.clientWidth || 0);
      var height = Number(container.clientHeight || 0);
      var cacheKey = [width, height, cardWidth, cardHeight, state.results.length].join(':');
      var measured;
      if (state.measurementCache && state.measurementCache.key === cacheKey) {
        return copyLayout(state.measurementCache.layout);
      }
      if (values.measureLayout) {
        measured = values.measureLayout(container, state.results.length, cardWidth, cardHeight);
      } else {
        measured = model.measureLayout(width - 12, height - 12, cardWidth, cardHeight, state.results.length);
      }
      measured = measured || { columns: 1, visibleRows: 1, totalRows: 0 };
      measured.cardWidth = Math.max(64, Number(measured.cardWidth || cardWidth));
      measured.cardHeight = Math.max(64, Number(measured.cardHeight || cardHeight));
      // A partially visible last row must still trigger scrolling when it receives focus.
      measured.visibleRows = Math.max(1, Math.min(
        Number(measured.visibleRows || 1),
        Math.floor(Math.max(0, Number(container.clientHeight || 0) - 12) / measured.cardHeight) || 1
      ));
      state.measurementCache = { key: cacheKey, layout: copyLayout(measured) };
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
      var resultCards = {};
      var token;
      var posterJob;
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
        state.measurementCache = null;
        state.resultCards = {};
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
        posterJob = updateCard(card, item, index, priority);
        if (posterJob) { posterJobs.push(posterJob); }
        resultCards[index] = card;
        container.appendChild(card);
      }
      state.resultCards = resultCards;
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
      var container;
      if (state.focus.zone !== 'results' || !state.results.length) { return; }
      nextWindow = model.virtualWindow(
        state.focus.index, state.results.length, state.layout.columns, state.layout.visibleRows,
        Number(values.resultOverscanRows || 0), state.visibleStartRow
      );
      if (nextWindow.start !== state.renderWindow.start || nextWindow.end !== state.renderWindow.end) {
        renderResults();
        return;
      }
      if (nextWindow.visibleStartRow !== state.visibleStartRow || nextWindow.offsetRows !== state.renderWindow.offsetRows) {
        state.visibleStartRow = nextWindow.visibleStartRow;
        state.renderWindow.visibleStartRow = nextWindow.visibleStartRow;
        state.renderWindow.offsetRows = nextWindow.offsetRows;
        container = node(values.resultsId || 'search-results');
        if (container) { container.scrollTop = nextWindow.offsetRows * state.layout.cardHeight; }
      }
    }

    function targetForFocus() {
      if (state.focus.zone === 'nav') { return values.navTarget ? values.navTarget(state.focus.navIndex) : null; }
      if (state.focus.zone === 'keyboard') {
        return keyboardNodesByPosition[state.focus.row + ':' + state.focus.column] || null;
      } else { return state.resultCards[state.focus.index] || null; }
    }

    function adjacentResultItems(direction) {
      var items = [];
      var seen = {};
      var index = Number(state.focus.index || 0);
      var columns = Math.max(1, Number(state.layout.columns || 1));
      var row = Math.floor(index / columns);
      var column = index % columns;
      var candidates = [];

      function add(candidate) {
        var item;
        var key;
        if (candidate < 0 || candidate >= state.results.length || candidate === index) { return; }
        item = state.results[candidate];
        key = mediaKey(item);
        if (!item || !key || seen[key]) { return; }
        seen[key] = true;
        items.push(item);
      }

      if (direction === 'left') {
        if (column > 0) { candidates.push(index - 1); }
        if (column < columns - 1 && index + 1 < state.results.length) { candidates.push(index + 1); }
        if (index + columns < state.results.length) { candidates.push(index + columns); }
        if (row > 0) { candidates.push(index - columns); }
      } else if (direction === 'down') {
        if (index + columns < state.results.length) { candidates.push(index + columns); }
        if (row > 0) { candidates.push(index - columns); }
        if (column < columns - 1 && index + 1 < state.results.length) { candidates.push(index + 1); }
        if (column > 0) { candidates.push(index - 1); }
      } else if (direction === 'up') {
        if (row > 0) { candidates.push(index - columns); }
        if (index + columns < state.results.length) { candidates.push(index + columns); }
        if (column < columns - 1 && index + 1 < state.results.length) { candidates.push(index + 1); }
        if (column > 0) { candidates.push(index - 1); }
      } else {
        if (column < columns - 1 && index + 1 < state.results.length) { candidates.push(index + 1); }
        if (column > 0) { candidates.push(index - 1); }
        if (index + columns < state.results.length) { candidates.push(index + columns); }
        if (row > 0) { candidates.push(index - columns); }
      }
      candidates.forEach(add);
      return items;
    }

    function clearTrackedFocus() {
      if (state.focusTarget) {
        state.focusTarget.className = String(state.focusTarget.className || '').replace(/\s*is-focused/g, '');
        state.focusTarget = null;
        return;
      }
      if (values.clearFocus) { values.clearFocus(); }
    }

    function restoreResultScroll() {
      var container;
      var expected;
      if (state.focus.zone !== 'results') { return; }
      container = node(values.resultsId || 'search-results');
      if (!container) { return; }
      expected = state.renderWindow.offsetRows * state.layout.cardHeight;
      if (container.scrollTop !== expected) { container.scrollTop = expected; }
    }

    function updateFocus() {
      var target;
      var item;
      ensureWindow();
      clearTrackedFocus();
      target = targetForFocus();
      if (target) {
        if (state.focus.zone === 'results') {
          item = state.results[state.focus.index];
          if (item) { syncCard(target, item, state.focus.index); }
        }
        target.className += ' is-focused';
        if (state.focus.zone === 'results' && values.prioritizePoster) { values.prioritizePoster(target); }
        if (!values.pointerSelectionActive || !values.pointerSelectionActive()) {
          if (target.focus) { target.focus(); }
          restoreResultScroll();
        }
        state.focusTarget = target;
      }
      if (values.onFocus) { values.onFocus(copyFocus(state.focus), target || null); }
      if (state.focus.zone === 'results' && state.results[state.focus.index] && values.onBackdrop) {
        values.onBackdrop(state.results[state.focus.index]);
      }
      if (values.onAdjacentBackdropPrefetch) {
        values.onAdjacentBackdropPrefetch(state.focus.zone === 'results' ? adjacentResultItems(state.lastDirection) : []);
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
      var focusedKey = state.focus.zone === 'results' ? mediaKey(state.results[state.focus.index]) : '';
      var focusedMatch = -1;
      var index;
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('search'); }
      state.results = error ? [] : array(items).slice();
      state.visibleStartRow = 0;
      if (state.focus.zone === 'results' && !state.results.length) {
        state.focus = { zone: 'keyboard', row: rows().length - 1, column: 0, index: 0, navIndex: state.focus.navIndex };
      } else if (state.focus.zone === 'results') {
        for (index = 0; focusedKey && index < state.results.length; index += 1) {
          if (mediaKey(state.results[index]) === focusedKey) { focusedMatch = index; break; }
        }
        state.focus.index = focusedMatch >= 0 ? focusedMatch : clamp(state.focus.index, 0, state.results.length - 1);
      }
      renderResults();
      if (state.focus.zone === 'results' && state.results.length) {
        state.focus.row = Math.floor(state.focus.index / Math.max(1, Number(state.layout.columns || 1)));
        state.focus.column = state.focus.index % Math.max(1, Number(state.layout.columns || 1));
      }
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
      state.lastDirection = direction;
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
      if (state.focusTarget) {
        state.focusTarget.className = String(state.focusTarget.className || '').replace(/\s*is-focused/g, '');
        state.focusTarget = null;
      }
      state.open = false;
      state.t9Preview = '';
      if (node(values.viewId || 'search-view')) { node(values.viewId || 'search-view').className = 'search-view is-hidden'; }
      if (notify && values.onBack) { values.onBack(snapshot()); }
      return snapshot();
    }

    function resume() {
      state.open = true;
      if (node(values.viewId || 'search-view')) { node(values.viewId || 'search-view').className = 'search-view'; }
      updateFocus();
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
      if (state.focus.zone !== 'nav') {
        focusNavigation(state.focus.navIndex);
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
      focusKeyboard: focusKeyboard,
      focusNavigation: focusNavigation,
      focusResult: focusResult,
      handleDirection: move,
      flushT9: function () { if (t9Input) { t9Input.flush(); } },
      inputKeyCode: inputKeyCode,
      open: open,
      pointerFocus: pointerFocus,
      resume: resume,
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
