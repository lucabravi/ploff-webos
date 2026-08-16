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
    var catalogNodesByIndex = {};
    var recommendationNodesByPosition = {};
    var state = {
      mode: 'catalog', usesGridScroll: true, contentActive: true,
      items: [], recommendations: [], totalSize: 0,
      focus: { zone: 'grid', index: 0, recommendationRow: 0 },
      layout: { columns: 1, visibleRows: 1, totalRows: 0, cardWidth: 0, cardHeight: 0 },
      window: { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 },
      renderedFocus: { mode: '', index: -1, recommendationRow: -1 },
      renderToken: 0,
      scrollTimer: null, scrollUsesAnimationFrame: false
    };

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function profile() {
      var current = values.cardProfile ? values.cardProfile() : null;
      return current || { metrics: values.cardMetrics ? values.cardMetrics() : { width: 200, imageHeight: 300, columnStep: 220, rowStep: 360 }, poster: null };
    }
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
      var value = String(text || '');
      if (target && target.textContent !== value) { target.textContent = value; }
    }

    function updateAttribute(target, key, value) {
      value = String(value);
      if (target && target.getAttribute(key) !== value) { target.setAttribute(key, value); }
    }

    function card(index, item, recommendationRow) {
      var result = element('button', 'library-card' + (recommendationRow !== undefined ? ' library-recommendation-card' : ''));
      var image = element('img', 'library-card-image');
      var caption = element('span', 'library-card-caption');
      var title = element('span', 'library-card-title');
      var meta = element('span', 'library-card-meta');
      var detail = element('span', 'library-card-detail');
      image.alt = '';
      result.type = 'button';
      result.appendChild(image);
      caption.appendChild(title);
      caption.appendChild(meta);
      caption.appendChild(detail);
      result.appendChild(caption);
      result.__ploffLibraryParts = { image: image, caption: caption, title: title, meta: meta, detail: detail, ratingBadge: null, libraryBadge: null, progress: null, progressValue: null };
      return result;
    }

    function cardParts(target) {
      var parts = target.__ploffLibraryParts;
      if (parts) { return parts; }
      parts = {
        image: target.getElementsByTagName('img')[0] || null,
        caption: target.querySelector('.library-card-caption'),
        title: target.querySelector('.library-card-title'),
        meta: target.querySelector('.library-card-meta'),
        detail: target.querySelector('.library-card-detail'),
        ratingBadge: target.querySelector('.library-rating-badge'),
        libraryBadge: target.querySelector('.library-source-badge'),
        progress: target.querySelector('.progress-track'),
        progressValue: target.querySelector('.progress-value')
      };
      target.__ploffLibraryParts = parts;
      return parts;
    }

    function presentationVersion() { return values.presentationVersion ? values.presentationVersion() : ''; }

    function presentationCache(item, version) {
      item = item || {};
      return {
        item: item,
        version: version,
        title: item.title,
        titleKey: item.titleKey,
        titleParameters: item.titleParameters,
        originalTitle: item.originalTitle,
        parentTitle: item.parentTitle,
        grandparentTitle: item.grandparentTitle,
        year: item.year,
        index: item.index,
        parentIndex: item.parentIndex,
        leafCount: item.leafCount,
        childCount: item.childCount,
        meta: item.meta,
        metaKey: item.metaKey,
        metaParameters: item.metaParameters,
        metaNumber: item.metaParameters && item.metaParameters.number,
        detail: item.detail,
        detailKey: item.detailKey,
        detailParameters: item.detailParameters,
        seasonCount: item.seasonCount,
        genre: item.genre,
        rating: item.rating,
        progress: item.progress,
        viewOffset: item.viewOffset,
        duration: item.duration,
        viewed: item.viewed === true,
        image: item.image,
        libraryTitle: item.libraryTitle
      };
    }

    function currentPresentationCache(cache, item, version) {
      return cache && cache.item === item && cache.version === version &&
        cache.title === item.title && cache.titleKey === item.titleKey && cache.titleParameters === item.titleParameters &&
        cache.originalTitle === item.originalTitle && cache.parentTitle === item.parentTitle &&
        cache.grandparentTitle === item.grandparentTitle && cache.year === item.year && cache.index === item.index &&
        cache.parentIndex === item.parentIndex && cache.leafCount === item.leafCount && cache.childCount === item.childCount &&
        cache.meta === item.meta && cache.metaKey === item.metaKey && cache.metaParameters === item.metaParameters &&
        cache.metaNumber === (item.metaParameters && item.metaParameters.number) && cache.detail === item.detail &&
        cache.detailKey === item.detailKey && cache.detailParameters === item.detailParameters &&
        cache.seasonCount === item.seasonCount && cache.genre === item.genre && cache.rating === item.rating && cache.progress === item.progress &&
        cache.viewOffset === item.viewOffset && cache.duration === item.duration && cache.viewed === (item.viewed === true) && cache.image === item.image && cache.libraryTitle === item.libraryTitle;
    }

    function presentation(item) {
      var title = mediaTitle(item);
      var meta = mediaMeta(item);
      var detail = mediaDetail(item);
      var rating = typeof item.rating === 'number' && !isNaN(item.rating) ? item.rating.toFixed(1) : '';
      var progress = typeof item.progress === 'number' ? clamp(item.progress, 0, 100) : null;
      var libraryTitle = values.showLibraryBadge && values.showLibraryBadge() ? String(item.libraryTitle || '') : '';
      return {
        key: mediaKey(item),
        title: title,
        meta: meta,
        detail: detail,
        aria: [title, meta, detail, libraryTitle].filter(function (value) { return !!value; }).join(', '),
        rating: rating,
        progress: progress,
        viewed: item.viewed === true,
        image: String(item.image || ''),
        libraryTitle: libraryTitle
      };
    }

    function cardPresentation(target, item, version) {
      if (target && currentPresentationCache(target.__ploffLibraryPresentationCache, item, version) && target.__ploffLibraryPresentation) {
        return target.__ploffLibraryPresentation;
      }
      if (target) { target.__ploffLibraryPresentationCache = presentationCache(item, version); }
      return presentation(item);
    }

    function samePresentation(left, right) {
      return left && right && left.key === right.key && left.title === right.title && left.meta === right.meta &&
        left.detail === right.detail && left.aria === right.aria && left.rating === right.rating &&
        left.progress === right.progress && left.viewed === right.viewed && left.image === right.image &&
        left.libraryTitle === right.libraryTitle;
    }

    function updateProgress(target, progress, parts) {
      if (progress !== null) {
        if (!parts.progress) {
          parts.progress = element('span', 'progress-track');
          parts.progressValue = element('span', 'progress-value');
          parts.progress.appendChild(parts.progressValue);
          target.appendChild(parts.progress);
        }
        if (parts.progressValue && parts.progressValue.style.width !== progress + '%') { parts.progressValue.style.width = progress + '%'; }
      } else if (parts.progress && parts.progress.parentNode) {
        parts.progress.parentNode.removeChild(parts.progress);
        parts.progress = null;
        parts.progressValue = null;
      }
    }

    function updateCard(target, index, item, recommendationRow, nextPresentation) {
      var parts = cardParts(target);
      var previous = target.__ploffLibraryPresentation;
      updateAttribute(target, 'data-media-key', nextPresentation.key);
      if (recommendationRow === undefined) { updateAttribute(target, 'data-library-index', index); }
      else {
        updateAttribute(target, 'data-library-recommendation-row', recommendationRow);
        updateAttribute(target, 'data-library-recommendation-column', index);
      }
      if (samePresentation(previous, nextPresentation)) { return false; }
      updateAttribute(target, 'aria-label', nextPresentation.aria);
      updateText(parts.title, nextPresentation.title);
      updateText(parts.meta, nextPresentation.meta);
      updateText(parts.detail, nextPresentation.detail);
      if (nextPresentation.rating) {
        if (!parts.ratingBadge) {
          parts.ratingBadge = element('span', 'library-rating-badge');
          target.insertBefore(parts.ratingBadge, parts.caption);
        }
        updateText(parts.ratingBadge, '♥ ' + nextPresentation.rating);
      } else if (parts.ratingBadge && parts.ratingBadge.parentNode) {
        parts.ratingBadge.parentNode.removeChild(parts.ratingBadge);
        parts.ratingBadge = null;
      }
      if (nextPresentation.libraryTitle) {
        if (!parts.libraryBadge) {
          parts.libraryBadge = element('span', 'library-source-badge media-library-badge');
          target.insertBefore(parts.libraryBadge, parts.caption);
        }
        updateText(parts.libraryBadge, nextPresentation.libraryTitle);
      } else if (parts.libraryBadge && parts.libraryBadge.parentNode) {
        parts.libraryBadge.parentNode.removeChild(parts.libraryBadge);
        parts.libraryBadge = null;
      }
      updateProgress(target, nextPresentation.progress, parts);
      target.__ploffLibraryPresentation = nextPresentation;
      return true;
    }

    function cancelPoster(target) {
      var image = target && cardParts(target).image;
      if (!image) { return; }
      if (values.posterLoader && values.posterLoader.cancel) { values.posterLoader.cancel(image); }
      image.__ploffLibraryPoster = null;
    }

    function queuePoster(target, source, priority, jobs, scope, cardLayout, previewOnly) {
      var image = cardParts(target).image;
      var previous;
      var next;
      var shouldQueue;
      var specification;
      if (!image || !values.renderedPosterSpecification) { return; }
      next = {
        source: source,
        priority: priority,
        scope: scope || 'library',
        width: cardLayout.metrics.width,
        height: cardLayout.metrics.imageHeight,
        previewOnly: previewOnly === true
      };
      previous = image.__ploffLibraryPoster;
      shouldQueue = !previous || previous.source !== next.source || previous.scope !== next.scope ||
        previous.width !== next.width || previous.height !== next.height ||
        previous.previewOnly === true && next.previewOnly === false;
      image.__ploffLibraryPoster = next;
      if (!shouldQueue && previous && next.priority < previous.priority) {
        if (values.posterLoader && values.posterLoader.prioritize) { values.posterLoader.prioritize(image, next.priority); }
        return;
      }
      if (shouldQueue) {
        specification = values.fixedPosterSpecification && cardLayout.poster
          ? values.fixedPosterSpecification(next.source, cardLayout.poster, next.priority, next.scope)
          : values.renderedPosterSpecification(image, next.source, next.priority, next.scope, next.width, next.height);
        specification.previewOnly = next.previewOnly;
        jobs.push({ target: image, specification: specification });
      }
    }

    function applyCatalogFocus(target, index, nextPresentation, visibleStart, visibleEnd, fullStart, fullEnd, jobs, cardLayout) {
      var focused = state.contentActive && state.focus.index === index;
      var visible = index >= visibleStart && index < visibleEnd;
      var fullArtwork = focused || index >= fullStart && index < fullEnd;
      var priority = focused ? 0 : (visible ? 1 : (fullArtwork ? 2 : 3));
      var className = 'library-card' + (nextPresentation.viewed ? ' is-viewed' : '') + (focused ? ' is-focused' : '');
      if (target.className !== className) { target.className = className; }
      queuePoster(target, nextPresentation.image, priority, jobs, 'library', cardLayout, !fullArtwork);
    }

    function claimNode(target, token) {
      if (!target || target.__ploffLibraryRenderToken === token) { return null; }
      target.__ploffLibraryRenderToken = token;
      return target;
    }

    function claimKeyed(nodes, key, token) {
      var list = nodes[key] || [];
      var index;
      var target;
      for (index = 0; index < list.length; index += 1) {
        target = claimNode(list[index], token);
        if (target) { return target; }
      }
      return null;
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

    function renderCatalog(force, currentProfile) {
      var container = node('library-grid');
      var content = node('library-grid-content');
      var cardLayout = currentProfile || profile();
      var cardMetrics = cardLayout.metrics;
      var existingByIndex = {};
      var existingByKey = {};
      var existingNodes = [];
      var freeNodes = [];
      var records = [];
      var children;
      var index;
      var position;
      var target;
      var current;
      var visibleStart;
      var visibleEnd;
      var fullStart;
      var fullEnd;
      var jobs = [];
      var nextLayout;
      var nextWindow;
      var unchanged;
      var token;
      var nextPresentation;
      var left;
      var top;
      var width;
      var version;
      if (!container || !content) { return false; }
      nextLayout = (values.SearchModel || {}).measureLayout((container.clientWidth || 1612) - 12, container.clientHeight || 600, cardMetrics.columnStep, cardMetrics.rowStep, state.items.length);
      nextLayout.visibleRows = state.usesGridScroll ? Math.max(1, Math.ceil((container.clientHeight || 600) / cardMetrics.rowStep)) : 1;
      nextLayout.cardWidth = cardMetrics.width;
      nextLayout.cardHeight = cardMetrics.rowStep;
      if (state.usesGridScroll) {
        nextWindow = catalogWindow(container, nextLayout, cardMetrics);
        content.className = 'library-grid-content is-catalog';
        if (content.style.height !== (nextLayout.totalRows * cardMetrics.rowStep) + 'px') { content.style.height = (nextLayout.totalRows * cardMetrics.rowStep) + 'px'; }
      } else {
        nextWindow = values.SearchModel.virtualWindow(state.focus.index, state.items.length, nextLayout.columns, nextLayout.visibleRows, values.overscanRows === undefined ? 3 : values.overscanRows, state.window.visibleStartRow);
        content.className = 'library-grid-content';
        if (content.style.height !== 'auto') { content.style.height = 'auto'; }
      }
      unchanged = state.layout.columns === nextLayout.columns && state.layout.visibleRows === nextLayout.visibleRows &&
        state.layout.cardWidth === nextLayout.cardWidth && state.layout.cardHeight === nextLayout.cardHeight &&
        state.window.start === nextWindow.start && state.window.end === nextWindow.end &&
        state.window.visibleStartRow === nextWindow.visibleStartRow && state.window.offsetRows === nextWindow.offsetRows;
      state.layout = nextLayout;
      state.window = nextWindow;
      if (force === false && unchanged) { return false; }
      children = content.children;
      for (index = 0; index < children.length; index += 1) {
        target = children[index];
        if (!target.hasAttribute('data-library-index')) { continue; }
        existingNodes.push(target);
        existingByIndex[target.getAttribute('data-library-index')] = target;
        current = String(target.getAttribute('data-media-key') || '');
        if (!existingByKey[current]) { existingByKey[current] = []; }
        existingByKey[current].push(target);
      }
      token = state.renderToken += 1;
      version = presentationVersion();
      visibleStart = state.window.visibleStartRow * state.layout.columns;
      visibleEnd = Math.min(state.items.length, visibleStart + state.layout.visibleRows * state.layout.columns);
      fullStart = Math.max(0, visibleStart - state.layout.columns);
      fullEnd = Math.min(state.items.length, visibleEnd + state.layout.columns);
      for (index = state.window.start; index < state.window.end; index += 1) {
        current = mediaKey(state.items[index]);
        target = claimKeyed(existingByKey, current, token) || claimNode(existingByIndex[index], token);
        nextPresentation = target ? cardPresentation(target, state.items[index], version) : null;
        records.push({ index: index, item: state.items[index], presentation: nextPresentation, target: target });
      }
      for (index = 0; index < existingNodes.length; index += 1) {
        if (existingNodes[index].__ploffLibraryRenderToken !== token) { freeNodes.push(existingNodes[index]); }
      }
      for (index = 0; index < freeNodes.length; index += 1) { cancelPoster(freeNodes[index]); }
      position = 0;
      for (index = 0; index < records.length; index += 1) {
        if (!records[index].target) {
          records[index].target = freeNodes[position] || card(records[index].index, records[index].item);
          records[index].target.__ploffLibraryRenderToken = token;
          position += 1;
        }
        if (!records[index].presentation) { records[index].presentation = cardPresentation(records[index].target, records[index].item, version); }
      }
      for (index = 0; index < freeNodes.length; index += 1) {
        if (freeNodes[index].parentNode === content) { content.removeChild(freeNodes[index]); }
      }
      catalogNodesByIndex = {};
      for (index = 0; index < records.length; index += 1) {
        target = records[index].target;
        catalogNodesByIndex[records[index].index] = target;
        updateCard(target, records[index].index, records[index].item, undefined, records[index].presentation);
        applyCatalogFocus(target, records[index].index, records[index].presentation, visibleStart, visibleEnd, fullStart, fullEnd, jobs, cardLayout);
        if (state.usesGridScroll) {
          left = ((records[index].index % state.layout.columns) * cardMetrics.columnStep) + 'px';
          top = (Math.floor(records[index].index / state.layout.columns) * cardMetrics.rowStep) + 'px';
          width = cardMetrics.width + 'px';
        } else { left = ''; top = ''; width = ''; }
        if (target.style.left !== left) { target.style.left = left; }
        if (target.style.top !== top) { target.style.top = top; }
        if (target.style.width !== width) { target.style.width = width; }
      }
      for (position = 0; position < records.length; position += 1) {
        target = records[position].target;
        current = content.children[position];
        if (current === target) { continue; }
        if (current) { content.insertBefore(target, current); }
        else { content.appendChild(target); }
      }
      while (content.children.length > records.length) { content.removeChild(content.children[content.children.length - 1]); }
      if (jobs.length && values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
      return true;
    }

    function renderRecommendations() {
      var container = node('library-recommended');
      var grid = node('library-grid');
      var jobs = [];
      var cardLayout;
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
      var nextPresentation;
      var version;
      if (!container || !grid) { return; }
      if (state.mode !== 'recommended') { container.className = 'library-recommended is-hidden'; grid.className = 'library-grid'; return; }
      cardLayout = profile();
      version = presentationVersion();
      recommendationNodesByPosition = {};
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
          nextPresentation = cardPresentation(target, rowData.items[column], version);
          usedCards.push(target);
          recommendationNodesByPosition[rowIndex + ':' + column] = target;
          updateCard(target, column, rowData.items[column], rowIndex, nextPresentation);
          target.className = 'library-card library-recommendation-card' + (nextPresentation.viewed ? ' is-viewed' : '') + (state.contentActive && state.focus.recommendationRow === rowIndex && state.focus.index === column ? ' is-focused' : '');
          row.appendChild(target);
          queuePoster(target, nextPresentation.image, state.contentActive && state.focus.recommendationRow === rowIndex && state.focus.index === column ? 0 : 1, jobs, 'library', cardLayout, false);
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

    function buildDetachedRecommendations(rows, maximumCards) {
      var grid;
      var recommendations;
      var limit = Math.max(0, Number(maximumCards || 0));
      var count = 0;
      var rowIndex;
      var column;
      var rowData;
      var section;
      var title;
      var row;
      var target;
      var nextPresentation;
      var jobs = [];
      var cardLayout = profile();
      var version = presentationVersion();
      if (!documentRef || !documentRef.createDocumentFragment || !limit) { return null; }
      grid = documentRef.createDocumentFragment();
      recommendations = documentRef.createDocumentFragment();
      rows = array(rows);
      for (rowIndex = 0; rowIndex < rows.length && count < limit; rowIndex += 1) {
        rowData = rows[rowIndex] || {};
        section = element('section', 'library-recommendation-section');
        section.setAttribute('data-library-recommendation-key', recommendationKey(rowData, rowIndex));
        title = element('h3', 'library-recommendation-title');
        updateText(title, values.recommendationTitle ? values.recommendationTitle(rowData) : rowData.title);
        section.appendChild(title);
        row = element('div', 'library-recommendation-row');
        for (column = 0; column < array(rowData.items).length && count < limit; column += 1) {
          target = card(column, rowData.items[column], rowIndex);
          nextPresentation = cardPresentation(target, rowData.items[column], version);
          updateCard(target, column, rowData.items[column], rowIndex, nextPresentation);
          target.className = 'library-card library-recommendation-card' + (nextPresentation.viewed ? ' is-viewed' : '');
          row.appendChild(target);
          queuePoster(target, nextPresentation.image, 3, jobs, 'library-prefetch', cardLayout, false);
          count += 1;
        }
        section.appendChild(row);
        recommendations.appendChild(section);
      }
      if (values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
      return { grid: grid, recommendations: recommendations };
    }

    function render() { if (state.mode === 'recommended') { renderRecommendations(); } else { renderCatalog(); renderRecommendations(); } return snapshot(); }

    function focusSnapshot() {
      return { zone: 'grid', index: state.focus.index, recommendationRow: state.focus.recommendationRow };
    }

    function navigationSnapshot() {
      var recommendationItemCount = 0;
      state.recommendations.forEach(function (row) { recommendationItemCount += array(row && row.items).length; });
      return {
        itemCount: state.items.length,
        recommendationItemCount: recommendationItemCount,
        totalSize: state.totalSize,
        focus: focusSnapshot(),
        layout: { columns: state.layout.columns, visibleRows: state.layout.visibleRows, totalRows: state.layout.totalRows },
        window: { start: state.window.start, end: state.window.end, visibleStartRow: state.window.visibleStartRow, offsetRows: state.window.offsetRows }
      };
    }

    function sameFocus(left, right) {
      return left && right && left.mode === right.mode && left.index === right.index && left.recommendationRow === right.recommendationRow;
    }

    function focusReference() {
      return { mode: state.mode, index: state.focus.index, recommendationRow: state.focus.recommendationRow };
    }

    function focusTargetFor(reference) {
      if (!reference || reference.index < 0) { return null; }
      if (reference.mode === 'recommended') {
        return recommendationNodesByPosition[reference.recommendationRow + ':' + reference.index] || null;
      }
      return catalogNodesByIndex[reference.index] || null;
    }

    function removeFocusedClass(target) {
      if (!target) { return; }
      target.className = String(target.className || '').replace(/(?:^|\s)is-focused(?=\s|$)/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function addFocusedClass(target) {
      if (target && (' ' + target.className + ' ').indexOf(' is-focused ') === -1) { target.className += ' is-focused'; }
    }

    function focusTarget() {
      var current = focusReference();
      var changed = !sameFocus(current, state.renderedFocus);
      var previous = changed ? focusTargetFor(state.renderedFocus) : null;
      var target;
      var image;
      if (previous) { removeFocusedClass(previous); }
      target = focusTargetFor(current);
      if (!target && state.contentActive) {
        if (state.mode === 'recommended') { renderRecommendations(); }
        else { renderCatalog(); }
        target = focusTargetFor(current);
      }
      if (!state.contentActive) {
        removeFocusedClass(target);
        state.renderedFocus = current;
        return focusSnapshot();
      }
      addFocusedClass(target);
      image = target && target.getElementsByTagName('img')[0];
      if (image && values.posterLoader && values.posterLoader.prioritize) { values.posterLoader.prioritize(image); }
      if (target && !pointerSelectionActive()) {
        target.focus();
        keepVisible(target);
      }
      state.renderedFocus = current;
      if (changed && values.onFocus) { values.onFocus(focusSnapshot(), focusedItem()); }
      return focusSnapshot();
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

    function refreshFocus() { clearFocus(); return focusTarget(); }
    function refreshRenderedFocus() { clearFocus(); return focusTarget(); }
    function setMode(mode, usesGridScroll) { state.mode = mode === 'recommended' ? 'recommended' : 'catalog'; state.usesGridScroll = !!usesGridScroll; return navigationSnapshot(); }
    function setContentActive(active) {
      state.contentActive = !!active;
      if (!state.contentActive) { removeFocusedClass(focusTargetFor(state.renderedFocus)); }
      return focusSnapshot();
    }
    function setItems(items, totalSize) {
      var focusedKey = mediaKey(state.items[state.focus.index]);
      var nextItems = array(items).slice();
      var initialFocusIndex = arguments.length > 2 ? Number(arguments[2]) : -1;
      var hasInitialFocus = isFinite(initialFocusIndex) && initialFocusIndex >= 0;
      var index;
      state.items = nextItems;
      state.totalSize = Number(totalSize === undefined ? state.items.length : totalSize);
      if (hasInitialFocus) { state.focus.index = initialFocusIndex; }
      else {
        for (index = 0; focusedKey && index < state.items.length; index += 1) {
          if (mediaKey(state.items[index]) === focusedKey) { state.focus.index = index; break; }
        }
      }
      state.focus.index = clamp(state.focus.index, 0, Math.max(0, state.items.length - 1));
      if (hasInitialFocus) { positionCatalogFocus(state.focus.index); }
      return render();
    }

    function appendItems(items, totalSize) {
      var page = array(items);
      var index;
      for (index = 0; index < page.length; index += 1) { state.items.push(page[index]); }
      state.totalSize = Number(totalSize === undefined ? state.items.length : totalSize);
      state.focus.index = clamp(state.focus.index, 0, Math.max(0, state.items.length - 1));
      if (state.mode === 'catalog') { renderCatalog(false); }
      return navigationSnapshot();
    }

    function positionCatalogFocus(index) {
      var container = node('library-grid');
      var content = node('library-grid-content');
      var cardLayout;
      var metrics;
      var layout;
      var columns;
      var row;
      var totalRows;
      var maximumScroll;
      var centeredScroll;
      if (!state.usesGridScroll || !container || !content || !state.items.length) { return null; }
      cardLayout = profile();
      metrics = cardLayout.metrics;
      layout = (values.SearchModel || {}).measureLayout((container.clientWidth || 1612) - 12, container.clientHeight || 600, metrics.columnStep, metrics.rowStep, state.items.length);
      columns = Math.max(1, Number(layout.columns || 1));
      row = Math.floor(index / columns);
      totalRows = Math.ceil(state.items.length / columns);
      maximumScroll = Math.max(0, totalRows * metrics.rowStep - Number(container.clientHeight || 0));
      centeredScroll = row * metrics.rowStep - Math.max(0, (Number(container.clientHeight || 0) - metrics.rowStep) / 2);
      content.className = 'library-grid-content is-catalog';
      content.style.height = (totalRows * metrics.rowStep) + 'px';
      container.scrollTop = clamp(Math.round(centeredScroll), 0, maximumScroll);
      return cardLayout;
    }

    function mountCatalogFocus(index) {
      var cardLayout;
      if (catalogNodesByIndex[index]) { return false; }
      cardLayout = positionCatalogFocus(index);
      if (!cardLayout) { return false; }
      renderCatalog(false, cardLayout);
      return !!catalogNodesByIndex[index];
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
    function focusCatalog(index) {
      state.mode = state.mode === 'recommended' ? 'recommended' : 'catalog';
      state.focus.index = clamp(Number(index || 0), 0, Math.max(0, state.items.length - 1));
      if (state.mode === 'catalog') { mountCatalogFocus(state.focus.index); }
      return refreshFocus();
    }
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

    function cancelScrollUpdate() {
      var root = values.root || {};
      if (state.scrollTimer === null) { return; }
      if (state.scrollUsesAnimationFrame && root.cancelAnimationFrame) { root.cancelAnimationFrame(state.scrollTimer); }
      else if (root.clearTimeout) { root.clearTimeout(state.scrollTimer); }
      state.scrollTimer = null;
      state.scrollUsesAnimationFrame = false;
    }

    function scheduleScrollUpdate(callback) {
      var root = values.root || {};
      var completed = false;
      var identifier;
      function run() { completed = true; callback(); }
      if (root.requestAnimationFrame) {
        state.scrollUsesAnimationFrame = true;
        identifier = root.requestAnimationFrame(run);
      } else if (root.setTimeout) {
        state.scrollUsesAnimationFrame = false;
        identifier = root.setTimeout(run, 16);
      } else { run(); }
      state.scrollTimer = completed ? null : identifier;
    }

    function onScroll() {
      var container = node('library-grid');
      if (!state.usesGridScroll || state.mode === 'recommended' || !container || state.scrollTimer !== null) { return; }
      scheduleScrollUpdate(function () {
        var cardLayout = profile();
        var cardMetrics = cardLayout.metrics;
        state.scrollTimer = null;
        state.scrollUsesAnimationFrame = false;
        renderCatalog(false, cardLayout);
        if (state.items.length < state.totalSize && container.scrollTop + container.clientHeight >= container.scrollHeight - cardMetrics.rowStep * 2 && values.onNearEnd) { values.onNearEnd(); }
      });
    }

    function reset() {
      cancelScrollUpdate(); catalogNodesByIndex = {}; recommendationNodesByPosition = {}; state.items = []; state.recommendations = []; state.totalSize = 0; state.focus.index = 0; state.focus.recommendationRow = 0; state.window = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 }; state.renderedFocus = { mode: '', index: -1, recommendationRow: -1 };
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope('library'); }
      return render();
    }

    function restore(value) {
      var saved = value || {};
      state.mode = saved.mode === 'recommended' ? 'recommended' : 'catalog';
      state.usesGridScroll = saved.usesGridScroll !== false;
      state.items = array(saved.items).slice();
      state.recommendations = array(saved.recommendations).map(function (row) {
        return { title: row.title, identifier: row.identifier, key: row.key, items: array(row.items).slice() };
      });
      state.totalSize = Number(saved.totalSize || state.items.length);
      state.focus.recommendationRow = clamp(Number(saved.focus && saved.focus.recommendationRow || 0), 0, Math.max(0, state.recommendations.length - 1));
      state.focus.index = clamp(Number(saved.focus && saved.focus.index || 0), 0, Math.max(0,
        state.mode === 'recommended'
          ? array(state.recommendations[state.focus.recommendationRow] && state.recommendations[state.focus.recommendationRow].items).length - 1
          : state.items.length - 1));
      catalogNodesByIndex = {}; recommendationNodesByPosition = {};
      state.renderedFocus = { mode: '', index: -1, recommendationRow: -1 };
      return render();
    }

    function snapshot() {
      return { mode: state.mode, items: state.items.slice(), recommendations: state.recommendations.slice(), totalSize: state.totalSize, focus: { zone: 'grid', index: state.focus.index, recommendationRow: state.focus.recommendationRow }, layout: state.layout, window: state.window };
    }

    return { appendItems: appendItems, buildDetachedRecommendations: buildDetachedRecommendations, focusedItem: focusedItem, focusCatalog: focusCatalog, focusRecommendations: focusRecommendations, focusSnapshot: focusSnapshot, handleDirection: handleDirection, navigationSnapshot: navigationSnapshot, onScroll: onScroll, pointerFocus: pointerFocus, refreshFocus: refreshFocus, render: render, reset: reset, restore: restore, restoreFocus: restoreFocus, setContentActive: setContentActive, setItems: setItems, setMode: setMode, setRecommendations: setRecommendations, snapshot: snapshot };
  }

  return { create: create };
}));
