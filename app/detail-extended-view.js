(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDetailExtendedView = factory(); }
}(this, function () {
  'use strict';

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var resizeTarget = documentRef && documentRef.defaultView;
    var castResizeBound = false;
    var state = {
      detail: null,
      extras: [],
      extrasLoading: false,
      active: false,
      row: 'anchor',
      castIndex: 0,
      castVisibleStart: 0,
      castPointerPinned: false,
      extraIndex: 0,
      extraVisibleStart: 0,
      extraPointerPinned: false,
      castWindowStart: -1,
      castWindowEnd: -1,
      extraWindowStart: -1,
      extraWindowEnd: -1
    };
    var castCardsByPosition = {};
    var extraCardsByPosition = {};

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function element(tagName, className, text) {
      var result;
      if (values.element) { return values.element(tagName, className, text); }
      result = documentRef.createElement(tagName);
      result.className = className || '';
      if (text !== undefined) { result.textContent = String(text); }
      return result;
    }
    function t(key) { return values.t ? values.t(key) : key; }
    function setText(id, text) { var target = node(id); if (target) { target.textContent = String(text || ''); } }
    function setHidden(id, hidden) {
      var target = node(id);
      if (!target) { return; }
      target.className = String(target.className || '').replace(/\s*is-hidden/g, '');
      if (hidden) { target.className += ' is-hidden'; }
    }
    function castItems() { return state.detail && state.detail.cast || []; }
    function castWindowRange() {
      var count = castItems().length;
      var maximumStart = Math.max(0, count - 6);
      var start;
      var index = state.castIndex;
      var range;
      if (!state.castPointerPinned) {
        range = windowRange(count, index, 6);
        state.castVisibleStart = range.start;
        return range;
      }
      start = clamp(state.castVisibleStart, 0, maximumStart);
      if (index < start) { start = index; }
      else if (index >= start + 6) { start = index - 5; }
      start = clamp(start, 0, maximumStart);
      state.castVisibleStart = start;
      return { start: start, end: Math.min(count, start + 6) };
    }
    function windowRange(count, index, visibleCount) {
      var start = Math.max(0, index - 2);
      start = Math.min(start, Math.max(0, count - visibleCount));
      return { start: start, end: Math.min(count, start + visibleCount) };
    }
    function extraWindowRange() {
      var count = state.extras.length;
      var maximumStart = Math.max(0, count - 4);
      var start;
      if (!state.extraPointerPinned) {
        start = windowRange(count, state.extraIndex, 4).start;
      } else {
        start = clamp(state.extraVisibleStart, 0, maximumStart);
        if (state.extraIndex < start) { start = state.extraIndex; }
        else if (state.extraIndex >= start + 4) { start = state.extraIndex - 3; }
      }
      state.extraVisibleStart = clamp(start, 0, maximumStart);
      return { start: state.extraVisibleStart, end: Math.min(count, state.extraVisibleStart + 4) };
    }
    function bufferedRange(range, count, aheadCount) {
      var ahead = Math.max(1, Number(aheadCount) || 1);
      return { start: Math.max(0, range.start - 1), end: Math.min(count, range.end + ahead) };
    }
    function imageSpecification(image, source, priority, fallbackWidth, fallbackHeight) {
      var size = values.ProgressiveImages.renderedSize(image, fallbackWidth || 220, fallbackHeight || 124);
      var preview = values.ProgressiveImages.previewSize(size.width, size.height, 96);
      var specification = {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: size.width,
        height: size.height,
        priority: priority,
        scope: 'detail-extended'
      };
      if (typeof values.sourceContext === 'function') { specification.sourceContext = values.sourceContext() || null; }
      return specification;
    }
    function formatDuration(duration) {
      var seconds = Math.max(0, Math.round(Number(duration || 0) / 1000));
      var minutes = Math.floor(seconds / 60);
      var remainder = seconds % 60;
      return minutes + ':' + (remainder < 10 ? '0' : '') + remainder;
    }
    function castCardClass(position, visible) {
      return 'detail-cast-card' + (visible ? '' : ' is-buffered') + (state.row === 'cast' && position === state.castIndex ? ' is-focused' : '');
    }
    function extraCardClass(position, visible) {
      return 'detail-extra-card' + (visible ? '' : ' is-buffered') + (state.row === 'extras' && position === state.extraIndex ? ' is-focused' : '');
    }
    function renderMetadata() {
      var detail = state.detail || {};
      var directors = detail.directors || [];
      setText('detail-extended-title', t('detail.moreDetails'));
      setText('detail-extended-genres-label', t('detail.genres'));
      setText('detail-extended-genres-value', (detail.genres || []).join(' • '));
      setText('detail-extended-directors-label', t('detail.directors'));
      setText('detail-extended-directors-value', directors.join(' • '));
      setHidden('detail-extended-directors-row', !directors.length);
      setText('detail-cast-title', t('detail.cast'));
      setText('detail-extras-title', t('detail.extras'));
      setHidden('detail-cast-section', !castItems().length);
      bindCastOverflowButtons();
      bindExtrasOverflowButtons();
    }
    function setOverflowButton(id, visible, label) {
      var button = node(id);
      if (!button) { return; }
      button.className = String(button.className || '').replace(/\s+is-visible\b/g, '') + (visible ? ' is-visible' : '');
      button.disabled = !visible;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      button.setAttribute('aria-label', label);
    }
    function updateCastOverflowButtons(visible) {
      var count = castItems().length;
      setOverflowButton('detail-cast-overflow-left', visible.start > 0, t('detail.scrollCastLeft'));
      setOverflowButton('detail-cast-overflow-right', visible.end < count, t('detail.scrollCastRight'));
      alignOverflowButtons(visible, castCardsByPosition, 'detail-cast-strip', 'detail-cast-overflow-left', 'detail-cast-overflow-right');
    }
    function alignOverflowButtons(visible, cards, stripId, leftId, rightId) {
      var strip = node(stripId);
      var viewport = strip && strip.parentNode;
      var first = cards[visible.start];
      var last = cards[visible.end - 1];
      var left = node(leftId);
      var right = node(rightId);
      var previousDisplay;
      var viewportBounds;
      var firstBounds;
      var lastBounds;
      var rightBounds;
      var gap;
      var leftPosition;
      if (!viewport || !first || !last || !left || !right || !right.style || !left.style || !right.getBoundingClientRect || !left.getBoundingClientRect) { return; }
      previousDisplay = right.style.display;
      right.style.display = 'flex';
      rightBounds = right.getBoundingClientRect();
      right.style.display = previousDisplay;
      viewportBounds = viewport.getBoundingClientRect();
      firstBounds = first.getBoundingClientRect();
      lastBounds = last.getBoundingClientRect();
      if (!isFinite(rightBounds.width) || !isFinite(firstBounds.left) || !isFinite(lastBounds.right) || !isFinite(viewportBounds.left)) { return; }
      gap = rightBounds.left - lastBounds.right;
      leftPosition = firstBounds.left - gap - rightBounds.width - viewportBounds.left;
      left.style.left = leftPosition + 'px';
    }
    function bindCastResize() {
      if (resizeTarget && resizeTarget.addEventListener && !castResizeBound) {
        resizeTarget.addEventListener('resize', handleCastResize);
        castResizeBound = true;
      }
    }
    function unbindCastResize() {
      if (resizeTarget && resizeTarget.removeEventListener && castResizeBound) {
        resizeTarget.removeEventListener('resize', handleCastResize);
        castResizeBound = false;
      }
    }
    function handleCastResize() {
      if (state.active) { updateCastOverflowButtons(castWindowRange()); updateExtrasOverflowButtons(extraWindowRange()); }
    }
    function updateExtrasOverflowButtons(visible) {
      setOverflowButton('detail-extras-overflow-left', visible.start > 0, t('detail.scrollExtrasLeft'));
      setOverflowButton('detail-extras-overflow-right', visible.end < state.extras.length, t('detail.scrollExtrasRight'));
      alignOverflowButtons(visible, extraCardsByPosition, 'detail-extras-strip', 'detail-extras-overflow-left', 'detail-extras-overflow-right');
    }
    function scrollExtras(direction) {
      var nextStart = clamp(state.extraVisibleStart + (direction < 0 ? -1 : 1), 0, Math.max(0, state.extras.length - 4));
      if (nextStart === state.extraVisibleStart) { return false; }
      state.extraPointerPinned = true;
      state.extraVisibleStart = nextStart;
      state.extraIndex = clamp(state.extraIndex, nextStart, nextStart + 3);
      state.row = 'extras';
      renderExtras();
      refreshCastSelection();
      return true;
    }
    function bindExtrasOverflowButtons() {
      var left = node('detail-extras-overflow-left');
      var right = node('detail-extras-overflow-right');
      if (left && !left._detailExtrasScrollBound) { left.onclick = function () { scrollExtras(-1); }; left._detailExtrasScrollBound = true; }
      if (right && !right._detailExtrasScrollBound) { right.onclick = function () { scrollExtras(1); }; right._detailExtrasScrollBound = true; }
    }
    function scrollCast(direction) {
      var count = castItems().length;
      var maximumStart = Math.max(0, count - 6);
      var nextStart = clamp(state.castVisibleStart + (direction < 0 ? -1 : 1), 0, maximumStart);
      if (nextStart === state.castVisibleStart) { return false; }
      state.castPointerPinned = true;
      state.castVisibleStart = nextStart;
      if (state.castIndex < nextStart) { state.castIndex = nextStart; }
      else if (state.castIndex >= nextStart + 6) { state.castIndex = nextStart + 5; }
      renderCast();
      return true;
    }
    function bindCastOverflowButtons() {
      var left = node('detail-cast-overflow-left');
      var right = node('detail-cast-overflow-right');
      if (left && !left._detailCastScrollBound) {
        left.onclick = function () { scrollCast(-1); };
        left._detailCastScrollBound = true;
      }
      if (right && !right._detailCastScrollBound) {
        right.onclick = function () { scrollCast(1); };
        right._detailCastScrollBound = true;
      }
    }
    function renderCast() {
      var container = node('detail-cast-strip');
      var items = castItems();
      var visible = castWindowRange();
      var buffered = bufferedRange(visible, items.length, 6);
      var existing = castCardsByPosition;
      var desired = [];
      var nextCardsByPosition = {};
      var jobs = [];
      var index;
      var person;
      var card;
      var image;
      var copy;
      var identity;
      var priority;
      var isBuffered;
      var reorder = false;
      if (!container || !state.active) { return; }
      for (index = buffered.start; index < buffered.end; index += 1) {
        person = items[index];
        identity = String(person.id || person.name || String(index));
        isBuffered = index < visible.start || index >= visible.end;
        priority = index === state.castIndex ? 0 : (isBuffered ? 2 : 1);
        card = existing[index] || null;
        if (card && (card.getAttribute('data-cast-key') !== identity || card.getAttribute('data-cast-thumb') !== String(person.thumb || ''))) {
          image = card.children && card.children[0];
          if (image && values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(image); }
          if (card.parentNode === container) { container.removeChild(card); }
          delete existing[index];
          card = null;
        }
        if (!card) {
          card = element('button', 'detail-cast-card');
          card.type = 'button';
          card.setAttribute('data-cast-key', identity);
          card.setAttribute('data-cast-thumb', String(person.thumb || ''));
          image = element('img', 'detail-cast-image');
          image.alt = '';
          card.appendChild(image);
          copy = element('span', 'detail-cast-copy');
          copy.appendChild(element('strong', 'detail-cast-name', person.name || ''));
          copy.appendChild(element('span', 'detail-cast-role', person.role || ''));
          card.appendChild(copy);
          if (person.thumb) {
            var specification = imageSpecification(image, person.thumb, priority, 160, 160);
            if (isBuffered) { specification.previewOnly = true; }
            jobs.push({ target: image, specification: specification });
          }
        } else if (!isBuffered && person.thumb && values.posterLoader && values.posterLoader.prioritize) {
          image = card.children && card.children[0];
          if (image) { values.posterLoader.prioritize(image, priority); }
        }
        if (card.children && card.children[1] && card.children[1].children) {
          copy = card.children[1];
          if (copy.children[0]) { copy.children[0].textContent = person.name || ''; }
          if (copy.children[1]) { copy.children[1].textContent = person.role || ''; }
        }
        card.className = castCardClass(index, index >= visible.start && index < visible.end);
        card.setAttribute('data-cast-position', index);
        nextCardsByPosition[index] = card;
        desired.push(card);
        delete existing[index];
      }
      for (index in existing) {
        if (Object.prototype.hasOwnProperty.call(existing, index) && existing[index].parentNode === container) {
          image = existing[index].children && existing[index].children[0];
          if (image && values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(image); }
          container.removeChild(existing[index]);
        }
      }
      for (index = 0; index < desired.length; index += 1) {
        if (container.children[index] !== desired[index]) { reorder = true; break; }
      }
      if (reorder) { desired.forEach(function (desiredCard) { container.appendChild(desiredCard); }); }
      castCardsByPosition = nextCardsByPosition;
      state.castWindowStart = buffered.start;
      state.castWindowEnd = buffered.end;
      updateCastOverflowButtons(visible);
      if (values.posterLoader && values.posterLoader.loadBatch && jobs.length) { values.posterLoader.loadBatch(jobs); }
    }
    function refreshCastSelection() {
      var items = castItems();
      var visible = castWindowRange();
      var buffered = bufferedRange(visible, items.length, 6);
      var container = node('detail-cast-strip');
      var index;
      var card;
      if (buffered.start !== state.castWindowStart || buffered.end !== state.castWindowEnd) { renderCast(); return; }
      for (index = buffered.start; index < buffered.end; index += 1) {
        card = castCardsByPosition[index];
        if (card && card.parentNode === container) { card.className = castCardClass(index, index >= visible.start && index < visible.end); }
      }
      updateCastOverflowButtons(visible);
    }
    function renderExtras() {
      var container = node('detail-extras-strip');
      var items = state.extras || [];
      var visible = extraWindowRange();
      var buffered = bufferedRange(visible, items.length);
      var existing = extraCardsByPosition;
      var desired = [];
      var nextCardsByPosition = {};
      var jobs = [];
      var index;
      var item;
      var card;
      var image;
      var copy;
      var identity;
      var imageSource;
      var referenceCard;
      var referenceImage;
      var referenceSize;
      if (!container || !state.active) { return; }
      for (index = buffered.start; index < buffered.end; index += 1) {
        item = items[index];
        identity = String(item.ratingKey || index);
        imageSource = String(item.image || '');
        card = existing[index] || null;
        if (card && (card.getAttribute('data-extra-key') !== identity || card.getAttribute('data-extra-image') !== imageSource)) {
          image = card.children && card.children[0];
          if (image && values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(image); }
          if (card.parentNode === container) { container.removeChild(card); }
          card = null;
        }
        if (!card) {
          card = element('button', 'detail-extra-card');
          card.type = 'button';
          card.setAttribute('data-extra-key', identity);
          card.setAttribute('data-extra-image', imageSource);
          image = element('img', 'detail-extra-image');
          image.alt = '';
          card.appendChild(image);
          copy = element('span', 'detail-extra-copy');
          copy.appendChild(element('strong', 'detail-extra-title', item.title || ''));
          copy.appendChild(element('span', 'detail-extra-meta', (item.subtype || t('detail.extra')) + (item.duration ? ' • ' + formatDuration(item.duration) : '')));
          card.appendChild(copy);
          if (item.image) { jobs.push({ target: image, source: item.image, priority: index === state.extraIndex ? 0 : 1 }); }
        } else {
          copy = card.children && card.children[1];
          if (copy && copy.children) {
            if (copy.children[0]) { copy.children[0].textContent = item.title || ''; }
            if (copy.children[1]) { copy.children[1].textContent = (item.subtype || t('detail.extra')) + (item.duration ? ' • ' + formatDuration(item.duration) : ''); }
          }
          if (index >= visible.start && index < visible.end && item.image && values.posterLoader && values.posterLoader.prioritize) {
            values.posterLoader.prioritize(card.children[0], index === state.extraIndex ? 0 : 1);
          }
        }
        card.className = extraCardClass(index, index >= visible.start && index < visible.end);
        card.setAttribute('data-extra-position', index);
        nextCardsByPosition[index] = card;
        desired.push(card);
        delete existing[index];
      }
      for (index in existing) {
        if (Object.prototype.hasOwnProperty.call(existing, index) && existing[index].parentNode === container) {
          image = existing[index].children && existing[index].children[0];
          if (image && values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(image); }
          container.removeChild(existing[index]);
        }
      }
      for (index = 0; index < desired.length; index += 1) {
        if (container.children[index] !== desired[index]) { container.insertBefore(desired[index], container.children[index] || null); }
      }
      extraCardsByPosition = nextCardsByPosition;
      state.extraWindowStart = buffered.start;
      state.extraWindowEnd = buffered.end;
      updateExtrasOverflowButtons(visible);
      if (values.posterLoader && values.posterLoader.loadBatch && jobs.length) {
        referenceCard = nextCardsByPosition[visible.start];
        referenceImage = referenceCard && referenceCard.children && referenceCard.children[0];
        referenceSize = values.ProgressiveImages.renderedSize(referenceImage, 220, 124);
        for (index = 0; index < jobs.length; index += 1) {
          jobs[index].specification = imageSpecification(jobs[index].target, jobs[index].source, jobs[index].priority, referenceSize.width, referenceSize.height);
          delete jobs[index].source;
          delete jobs[index].priority;
        }
        values.posterLoader.loadBatch(jobs);
      }
    }
    function refreshExtraSelection() {
      var items = state.extras || [];
      var visible = extraWindowRange();
      var buffered = bufferedRange(visible, items.length);
      var container = node('detail-extras-strip');
      var index;
      var card;
      if (buffered.start !== state.extraWindowStart || buffered.end !== state.extraWindowEnd) { renderExtras(); return; }
      for (index = buffered.start; index < buffered.end; index += 1) {
        card = extraCardsByPosition[index];
        if (card && card.parentNode === container) { card.className = extraCardClass(index, index >= visible.start && index < visible.end); }
      }
      updateExtrasOverflowButtons(visible);
    }
    function setDetail(detail) {
      state.detail = detail || null;
      state.castIndex = 0;
      state.castVisibleStart = 0;
      state.castPointerPinned = false;
      if (state.active) {
        if (state.row === 'anchor' && castItems().length) { state.row = 'cast'; }
        renderMetadata();
        renderCast();
      }
      return state.detail;
    }
    function setExtrasLoading(value) {
      state.extrasLoading = value === true;
      setHidden('detail-extras-section', !state.extrasLoading && !state.extras.length);
      setText('detail-extras-status', state.extrasLoading ? t('detail.extrasLoading') : '');
      return state.extrasLoading;
    }
    function setExtras(items) {
      state.extras = (items || []).slice();
      state.extrasLoading = false;
      state.extraIndex = clamp(state.extraIndex, 0, Math.max(0, state.extras.length - 1));
      state.extraVisibleStart = 0;
      state.extraPointerPinned = false;
      setHidden('detail-extras-section', !state.extras.length);
      setText('detail-extras-status', '');
      if (!castItems().length && state.extras.length) { state.row = 'extras'; }
      if (state.active) { renderExtras(); }
      return state.extras.slice();
    }
    function enter() {
      state.active = true;
      bindCastResize();
      state.castIndex = clamp(state.castIndex, 0, Math.max(0, castItems().length - 1));
      state.extraIndex = clamp(state.extraIndex, 0, Math.max(0, state.extras.length - 1));
      state.row = castItems().length ? 'cast' : (state.extras.length ? 'extras' : 'anchor');
      renderMetadata();
      renderCast();
      renderExtras();
      setExtrasLoading(state.extrasLoading);
      return snapshot();
    }
    function leave() { state.active = false; unbindCastResize(); return snapshot(); }
    function atTop() { return state.row !== 'extras' || !castItems().length; }
    function select(row, index) {
      if (!state.active) { return false; }
      if (row === 'cast' && castItems().length) {
        state.row = 'cast';
        state.castIndex = clamp(Number(index) || 0, 0, castItems().length - 1);
        state.castPointerPinned = true;
        refreshCastSelection();
        if (state.extras.length) { refreshExtraSelection(); }
        return true;
      }
      if (row === 'extras' && state.extras.length) {
        state.row = 'extras';
        state.extraIndex = clamp(Number(index) || 0, 0, state.extras.length - 1);
        state.extraPointerPinned = false;
        if (castItems().length) { refreshCastSelection(); }
        refreshExtraSelection();
        return true;
      }
      return false;
    }
    function selectedExtra() {
      var source;
      var result = {};
      var key;
      if (state.row !== 'extras') { return null; }
      source = state.extras[state.extraIndex];
      if (!source) { return null; }
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }
    function focusTarget() {
      var card;
      var container;
      if (state.row === 'cast') {
        container = node('detail-cast-strip');
        card = castCardsByPosition[state.castIndex];
        if (card && card.parentNode === container) { return card; }
      }
      if (state.row === 'extras') {
        container = node('detail-extras-strip');
        card = extraCardsByPosition[state.extraIndex];
        if (card && card.parentNode === container) { return card; }
      }
      return node('detail-extended-anchor');
    }
    function navigate(direction) {
      if (state.row === 'cast') {
        if (direction === 'left' || direction === 'right') {
          state.castPointerPinned = false;
          state.castIndex = clamp(state.castIndex + (direction === 'left' ? -1 : 1), 0, Math.max(0, castItems().length - 1));
          refreshCastSelection();
        } else if (direction === 'down' && state.extras.length) {
          state.row = 'extras';
          refreshCastSelection();
          refreshExtraSelection();
        } else if (direction === 'up') { return { row: state.row, leave: true }; }
      } else if (state.row === 'extras') {
        if (direction === 'left' || direction === 'right') {
          state.extraPointerPinned = false;
          state.extraIndex = clamp(state.extraIndex + (direction === 'left' ? -1 : 1), 0, Math.max(0, state.extras.length - 1));
          refreshExtraSelection();
        } else if (direction === 'up') {
          if (castItems().length) { state.row = 'cast'; refreshCastSelection(); refreshExtraSelection(); }
          else { return { row: state.row, leave: true }; }
        }
      } else if (direction === 'up') { return { row: state.row, leave: true }; }
      else if (direction === 'down' && state.extras.length) { state.row = 'extras'; refreshExtraSelection(); }
      return { row: state.row, leave: false };
    }
    function snapshot() {
      return {
        active: state.active,
        row: state.row,
        castIndex: state.castIndex,
        extraIndex: state.extraIndex,
        extrasLoading: state.extrasLoading,
        extrasCount: state.extras.length
      };
    }
    function reset() {
      unbindCastResize();
      state.detail = null;
      state.extras = [];
      state.extrasLoading = false;
      state.active = false;
      state.row = 'anchor';
      state.castIndex = 0;
      state.castVisibleStart = 0;
      state.castPointerPinned = false;
      state.extraIndex = 0;
      state.extraVisibleStart = 0;
      state.extraPointerPinned = false;
      state.castWindowStart = -1;
      state.castWindowEnd = -1;
      state.extraWindowStart = -1;
      state.extraWindowEnd = -1;
      castCardsByPosition = {};
      extraCardsByPosition = {};
      if (node('detail-cast-strip')) { node('detail-cast-strip').innerHTML = ''; }
      if (node('detail-extras-strip')) { node('detail-extras-strip').innerHTML = ''; }
      setText('detail-extras-status', '');
      setHidden('detail-cast-section', true);
      setHidden('detail-extras-section', true);
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('detail-extended'); }
      return snapshot();
    }

    return {
      setDetail: setDetail,
      setExtrasLoading: setExtrasLoading,
      setExtras: setExtras,
      enter: enter,
      leave: leave,
      atTop: atTop,
      select: select,
      selectedExtra: selectedExtra,
      focusTarget: focusTarget,
      navigate: navigate,
      scrollCast: scrollCast,
      snapshot: snapshot,
      reset: reset
    };
  }

  return { create: create };
}));
