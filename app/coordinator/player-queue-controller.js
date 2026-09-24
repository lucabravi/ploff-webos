(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffPlayerQueueController = factory();
  }
}(this, function () {
  'use strict';

  function create(values) {
    var options = values || {};
    var root = options.root || {};
    var document = options.document;
    var PlaybackQueueModel = options.PlaybackQueueModel;
    var ProgressiveImages = options.ProgressiveImages;
    var queueController = options.queueController;
    var scrollDirection = 0;
    var prefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
    var cards = {};
    var prefetchImages = {};
    var renderToken = 0;
    var spacers = {};
    var cardOriginIdentity = '';
    var playbackPaused = null;
    var closedPrefetchToken = 0;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
      if (typeof callback === 'function') {
        return arguments.length > 7
          ? callback(arg1, arg2, arg3, arg4, arg5, arg6, arg7)
          : callback(arg1, arg2, arg3, arg4, arg5, arg6);
      }
      return undefined;
    }

    function t(key, parameters) { return call(options.translate, key, parameters) || key; }
    function element(tagName, className, text) { return call(options.element, tagName, className, text); }
    function detailSnapshot() { return call(options.detailSnapshot) || {}; }
    function playbackSnapshot() { return call(options.playbackSnapshot) || {}; }
    function currentSettings() { return call(options.currentSettings) || {}; }
    function currentView() { return String(call(options.currentView) || 'home'); }
    function pointerActive() { return call(options.pointerActive) === true; }
    function queueSnapshot() { return queueController && queueController.snapshot ? queueController.snapshot() || {} : {}; }
    function activeQueue(snapshotValue) {
      return queueController && queueController.activeQueue ? queueController.activeQueue(snapshotValue || detailSnapshot()) : null;
    }
    function activeIndex(queueValue, snapshotValue) {
      return queueController && queueController.activeIndex
        ? Math.max(0, queueController.activeIndex(queueValue, snapshotValue || detailSnapshot()))
        : 0;
    }
    function posterLoader() { return call(options.posterLoader) || null; }
    function sourceContext() { return typeof options.sourceContext === 'function' ? options.sourceContext() : null; }
    function presentationFor(item) {
      var resolved;
      if (typeof options.resolvePresentationItem !== 'function') {
        return { item: item, sourceContext: sourceContext(), available: true };
      }
      resolved = options.resolvePresentationItem(item);
      if (!resolved || !resolved.item) {
        return { item: item, sourceContext: null, available: false };
      }
      return {
        item: resolved.item,
        sourceContext: resolved.sourceContext || null,
        available: resolved.available !== false
      };
    }

    function label() { return t('player.queue'); }

    function ensureUi() {
      var row;
      var settings;
      var button;
      var drawer;
      var header;
      var title;
      if (destroyed || !document || document.getElementById('player-playlist-queue-button')) { return false; }
      row = document.querySelector('.player-buttons');
      settings = document.getElementById('player-settings-button');
      if (!row || !settings) { return false; }
      button = element('button', 'player-button player-icon-button player-playlist-queue-command is-unavailable');
      if (!button) { return false; }
      button.id = 'player-playlist-queue-button';
      button.type = 'button';
      button.setAttribute('aria-controls', 'player-playlist-queue');
      button.setAttribute('aria-expanded', 'false');
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      button.appendChild(element('span', 'playlist-queue-icon-line'));
      row.insertBefore(button, settings);
      drawer = element('aside', 'player-playlist-queue');
      drawer.id = 'player-playlist-queue';
      drawer.setAttribute('aria-hidden', 'true');
      header = element('div', 'player-playlist-queue-header');
      title = element('h3', 'player-playlist-queue-title');
      title.appendChild(element('span', 'player-playlist-queue-title-text'));
      header.appendChild(title);
      header.appendChild(element('span', 'player-playlist-queue-position'));
      drawer.appendChild(header);
      drawer.appendChild(element('div', 'player-playlist-queue-list'));
      document.getElementById('player-view').appendChild(drawer);
      return true;
    }

    function available() { return !!activeQueue(detailSnapshot()); }

    function updateButton(queueState, availableValue) {
      var button;
      var isAvailable;
      var snapshot;
      if (destroyed) { return false; }
      snapshot = queueState || queueSnapshot();
      ensureUi();
      button = document && document.getElementById('player-playlist-queue-button');
      if (!button) { return false; }
      isAvailable = availableValue === undefined ? available() : availableValue;
      button.className = 'player-button player-icon-button player-playlist-queue-command' +
        (isAvailable ? '' : ' is-unavailable');
      button.setAttribute('aria-label', label());
      button.setAttribute('aria-expanded', snapshot.drawer && snapshot.drawer.open ? 'true' : 'false');
      if (!isAvailable && snapshot.drawer && snapshot.drawer.open) { close(false); }
      if (isAvailable && snapshot.drawer && !snapshot.drawer.open) { prefetchClosedDrawer(snapshot); }
      return true;
    }

    function nowPlayingClass(current, paused) {
      return 'playlist-queue-card-now-playing' +
        (current ? (paused ? '' : ' is-playing') : ' is-hidden');
    }

    function cardClass(index, currentIndex, focused, viewed) {
      return 'chapter-card playlist-queue-card' +
        (index === currentIndex ? ' is-current' : '') +
        (focused ? ' is-focused' : '') +
        (viewed ? ' is-viewed' : '');
    }

    function updateQueueTitleOverflow(title) {
      var textNode = title && title.childNodes && title.childNodes[0];
      var style;
      var distance;
      var textValue;
      var availableWidth;
      if (!title || !textNode) { return; }
      textValue = String(textNode.textContent || '');
      availableWidth = Number(title.clientWidth || 0);
      if (title.__playlistQueueTitleValue === textValue && title.__playlistQueueTitleWidth === availableWidth) { return; }
      title.__playlistQueueTitleValue = textValue;
      title.__playlistQueueTitleWidth = availableWidth;
      textNode.className = String(textNode.className || '').replace(/\s+is-overflowing\b/g, '');
      style = textNode.style;
      if (style) {
        if (style.removeProperty) { style.removeProperty('--text-marquee-distance'); }
        else { style['--text-marquee-distance'] = ''; }
      }
      distance = Number(textNode.scrollWidth || 0) - availableWidth;
      if (distance <= 1) { return; }
      if (style) {
        if (style.setProperty) { style.setProperty('--text-marquee-distance', '-' + distance + 'px'); }
        else { style['--text-marquee-distance'] = '-' + distance + 'px'; }
      }
      textNode.className += ' is-overflowing';
    }

    function viewportItems(list) {
      var height = Math.max(1, Number(list && list.clientHeight || 0));
      return height > 1 ? Math.max(1, Math.ceil(height / 214)) : 5;
    }

    function sdSize() {
      return ProgressiveImages && ProgressiveImages.previewSize
        ? ProgressiveImages.previewSize(390, 154, 96)
        : { width: 96, height: 38 };
    }

    function spacer(name, count) {
      var node = spacers[name];
      var height;
      if (count <= 0) { return null; }
      if (!node) {
        node = element('div', 'playlist-queue-spacer ' + name);
        node.setAttribute('aria-hidden', 'true');
        spacers[name] = node;
      }
      height = count * 214 + 'px';
      if (node.style.height !== height) { node.style.height = height; }
      return node;
    }

    function reconcileNodes(list, desiredNodes) {
      var index;
      var current;
      if (!list) { return; }
      for (index = list.childNodes.length - 1; index >= 0; index -= 1) {
        current = list.childNodes[index];
        if (desiredNodes.indexOf(current) < 0) { list.removeChild(current); }
      }
      for (index = 0; index < desiredNodes.length; index += 1) {
        current = list.childNodes[index] || null;
        if (current !== desiredNodes[index]) { list.insertBefore(desiredNodes[index], current); }
      }
    }

    function loadArtwork(image, source, tier, priority, requestContext) {
      var loader = posterLoader();
      var preview;
      var requestKey;
      if (!image || !source || tier === 'none') { return; }
      requestKey = String(tier) + '|' + String(source);
      if (image.__playlistQueueArtworkKey === requestKey) { return; }
      image.__playlistQueueArtworkKey = requestKey;
      if (tier === 'final') {
        call(options.loadRenderedPoster, image, source, priority, 'playlist-queue', 390, 154, requestContext);
        return;
      }
      if (!loader || !loader.load) { return; }
      preview = sdSize();
      loader.load(image, {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: preview.width,
        height: preview.height,
        priority: priority,
        scope: 'playlist-queue',
        sourceContext: requestContext
      });
    }

    function cardKey(record, absoluteIndex) {
      return String(record && record.occurrenceId || 'queue-occurrence-' + absoluteIndex);
    }

    function createCard() {
      var card = element('button', 'chapter-card playlist-queue-card');
      var imageFrame = element('span', 'playlist-queue-card-image-frame');
      var image = element('img', 'chapter-card-image playlist-queue-card-image');
      var badge = element('span', 'playlist-queue-card-badge');
      var nowPlaying = element('span', 'playlist-queue-card-now-playing');
      var duration = element('span', 'playlist-queue-card-duration');
      var caption = element('span', 'chapter-card-caption playlist-queue-card-caption');
      var title = element('span', 'chapter-card-title playlist-queue-card-title');
      var position = element('span', 'chapter-card-time');
      card.type = 'button';
      image.alt = '';
      nowPlaying.setAttribute('aria-hidden', 'true');
      imageFrame.appendChild(image);
      imageFrame.appendChild(duration);
      caption.appendChild(title);
      caption.appendChild(position);
      card.appendChild(imageFrame);
      card.appendChild(badge);
      card.appendChild(nowPlaying);
      card.appendChild(caption);
      card.__playlistQueueImage = image;
      card.__playlistQueueBadge = badge;
      card.__playlistQueueNowPlaying = nowPlaying;
      card.__playlistQueueDuration = duration;
      card.__playlistQueueTitle = title;
      card.__playlistQueuePosition = position;
      return card;
    }

    function releaseCards(retained) {
      var loader = posterLoader();
      var keys = Object.keys(cards);
      var index;
      var card;
      for (index = 0; index < keys.length; index += 1) {
        if (retained && retained[keys[index]]) { continue; }
        card = cards[keys[index]];
        if (loader && loader.load && card && card.__playlistQueueImage) {
          card.__playlistQueueImage.__playlistQueueArtworkKey = '';
          loader.load(card.__playlistQueueImage, { source: '', scope: 'playlist-queue' });
        }
        delete cards[keys[index]];
      }
    }

    function releasePrefetchImages(retained) {
      var loader = posterLoader();
      var keys = Object.keys(prefetchImages);
      var index;
      var image;
      for (index = 0; index < keys.length; index += 1) {
        if (retained && retained[keys[index]]) { continue; }
        image = prefetchImages[keys[index]];
        if (loader && loader.load && image) {
          image.__playlistQueuePrefetchKey = '';
          loader.load(image, { source: '', scope: 'playlist-queue-prefetch' });
        }
        delete prefetchImages[keys[index]];
      }
    }

    function prefetchArtwork(records) {
      var loader = posterLoader();
      var preview = sdSize();
      var retained = {};
      var index;
      var record;
      var item;
      var presentation;
      var key;
      var image;
      var requestKey;
      if (!loader || !loader.load) {
        releasePrefetchImages(null);
        return;
      }
      for (index = 0; index < (records || []).length; index += 1) {
        record = records[index];
        item = record && record.item;
        if (!item || !item.image) { continue; }
        presentation = presentationFor(item);
        if (!presentation.available) { continue; }
        item = presentation.item;
        if (!item || !item.image) { continue; }
        key = cardKey(record, Number(record.absoluteIndex || 0));
        retained[key] = true;
        image = prefetchImages[key];
        if (!image) {
          image = element('img', 'playlist-queue-prefetch-image');
          prefetchImages[key] = image;
        }
        requestKey = String(item.image) + '|' + preview.width + 'x' + preview.height;
        if (image.__playlistQueuePrefetchKey === requestKey) { continue; }
        image.__playlistQueuePrefetchKey = requestKey;
        loader.load(image, {
          source: item.image,
          previewWidth: preview.width,
          previewHeight: preview.height,
          width: preview.width,
          height: preview.height,
          priority: 2,
          scope: 'playlist-queue-prefetch',
          sourceContext: presentation.sourceContext,
          previewOnly: true
        });
      }
      releasePrefetchImages(retained);
    }

    function setText(node, value) {
      value = String(value === null || value === undefined ? '' : value);
      if (node && node.textContent !== value) { node.textContent = value; }
    }

    function setClass(node, value) {
      value = String(value || '');
      if (node && node.className !== value) { node.className = value; }
    }

    function setAttribute(node, name, value) {
      value = String(value === null || value === undefined ? '' : value);
      if (node && (!node.getAttribute || node.getAttribute(name) !== value)) { node.setAttribute(name, value); }
    }

    function itemPosition(item, absoluteIndex, total) {
      return (absoluteIndex + 1) + '/' + total;
    }

    function durationLabel(duration) {
      var total = Math.round(Number(duration) / 1000);
      var hours;
      var minutes;
      var seconds;
      if (!isFinite(total) || total <= 0) { return '--:--'; }
      hours = Math.floor(total / 3600);
      minutes = Math.floor((total % 3600) / 60);
      seconds = total % 60;
      minutes = minutes < 10 ? '0' + minutes : String(minutes);
      seconds = seconds < 10 ? '0' + seconds : String(seconds);
      return hours > 0 ? String(hours) + ':' + minutes + ':' + seconds : minutes + ':' + seconds;
    }

    function updateCard(card, item, absoluteIndex, currentIndex, focused, total, paused) {
      var position = itemPosition(item, absoluteIndex, total);
      var title = PlaybackQueueModel.itemDisplayTitle(item);
      var typeLabel = PlaybackQueueModel.itemTypeLabel(item, currentSettings().uiLanguage, t);
      var viewedLabel;
      card.__playlistQueueIsViewed = !!item.viewed;
      viewedLabel = card.__playlistQueueIsViewed ? ', ' + t('library.watched') : '';
      setClass(card, cardClass(absoluteIndex, currentIndex, focused, card.__playlistQueueIsViewed));
      setAttribute(card, 'data-playlist-queue-index', absoluteIndex);
      setAttribute(card, 'aria-label', typeLabel + ', ' + title + ', ' + position + viewedLabel);
      setText(card.__playlistQueueBadge, typeLabel);
      setClass(card.__playlistQueueNowPlaying, nowPlayingClass(absoluteIndex === currentIndex, paused));
      setClass(card.__playlistQueueDuration, 'playlist-queue-card-duration' + (item.type === 'episode' ? '' : ' is-hidden'));
      setText(card.__playlistQueueDuration, item.type === 'episode' ? durationLabel(item.duration) : '');
      setText(card.__playlistQueueTitle, title);
      setText(card.__playlistQueuePosition, position);
    }

    function updatePlaybackMarkers(paused) {
      var keys;
      var index;
      var card;
      var current;
      if (destroyed) { return false; }
      paused = paused === true;
      if (playbackPaused === paused) { return true; }
      playbackPaused = paused;
      keys = Object.keys(cards);
      for (index = 0; index < keys.length; index += 1) {
        card = cards[keys[index]];
        current = (' ' + String(card.className || '') + ' ').indexOf(' is-current ') >= 0;
        setClass(card.__playlistQueueNowPlaying, nowPlayingClass(current, paused));
      }
      return true;
    }

    function scrollFocus(direction, card, next) {
      var list = document && document.querySelector('.player-playlist-queue-list');
      if (!list || !card) { return; }
      list.scrollTop = PlaybackQueueModel.drawerScrollTop({
        scrollTop: list.scrollTop,
        clientHeight: list.clientHeight,
        focusedTop: card.offsetTop,
        focusedHeight: card.offsetHeight,
        nextTop: next ? next.offsetTop : NaN,
        nextHeight: next ? next.offsetHeight : 0,
        direction: direction,
        isLast: !next
      });
    }

    function resetViewportScroll() {
      var drawer = document && document.getElementById('player-playlist-queue');
      var player = document && document.getElementById('player-view');
      if (root.scrollTo) { root.scrollTo(0, 0); }
      if (document && document.documentElement) { document.documentElement.scrollLeft = 0; }
      if (document && document.body) { document.body.scrollLeft = 0; }
      if (player) { player.scrollLeft = 0; }
      if (drawer) { drawer.scrollLeft = 0; }
    }

    function focusCard(card) {
      if (!card || !card.focus) { return; }
      resetViewportScroll();
      card.focus();
      resetViewportScroll();
    }

    function updateDrawerFocus(queueValue, drawerValue, currentIndexValue) {
      var active = queueValue || activeQueue();
      var drawerState = drawerValue || queueSnapshot().drawer;
      var keys = Object.keys(cards);
      var currentIndex;
      var cardIndex;
      var index;
      var card;
      var focused = null;
      var next = null;
      if (!active || !drawerState) { return; }
      currentIndex = currentIndexValue === undefined ? activeIndex(active) : Number(currentIndexValue || 0);
      for (index = 0; index < keys.length; index += 1) {
        card = cards[keys[index]];
        cardIndex = Number(card.getAttribute('data-playlist-queue-index'));
        setClass(card, cardClass(cardIndex, currentIndex, cardIndex === drawerState.index, card.__playlistQueueIsViewed));
        if (cardIndex === drawerState.index) { focused = card; }
        else if (cardIndex === drawerState.index + 1) { next = card; }
      }
      scrollFocus(scrollDirection, focused, next);
      scrollDirection = 0;
      resetViewportScroll();
      if (!pointerActive() && drawerState.focusReady) { focusCard(focused); }
    }

    function applyDrawerWindow(queueValue, drawerState, list, title, position, windowResult, direction, currentIndexValue) {
      var currentIndex = Number(currentIndexValue || 0);
      var total = Math.max(0, Number(windowResult && windowResult.total || 0));
      var windowValue = windowResult && windowResult.bounds || PlaybackQueueModel.windowBounds({ total: total });
      var records = windowResult && windowResult.items || [];
      var retainedCards = {};
      var record;
      var absoluteIndex;
      var item;
      var presentation;
      var key;
      var card;
      var image;
      var artworkTier;
      var loader = posterLoader();
      var desiredNodes = [];
      var artworkRequests = [];
      var emptyArtworkImages = [];
      var paused = playbackSnapshot().paused === true;
      var spacerNode;
      var offset;
      playbackPaused = paused;
      setText(title && title.childNodes && title.childNodes[0], queueValue.title || label());
      updateQueueTitleOverflow(title);
      setText(position, (currentIndex + 1) + ' / ' + total);
      spacerNode = spacer('is-before', windowValue.retainedStart);
      if (spacerNode) { desiredNodes.push(spacerNode); }
      for (offset = 0; offset < records.length; offset += 1) {
        record = records[offset];
        absoluteIndex = Number(record && record.absoluteIndex || 0);
        item = record && record.item;
        if (!item) { continue; }
        presentation = presentationFor(item);
        item = presentation.item;
        key = cardKey(record, absoluteIndex);
        retainedCards[key] = true;
        card = cards[key];
        if (!card) {
          card = createCard();
          cards[key] = card;
        }
        updateCard(card, item, absoluteIndex, currentIndex, absoluteIndex === drawerState.index, total, paused);
        card.setAttribute('data-playlist-queue-index', absoluteIndex);
        card.setAttribute('data-playlist-queue-occurrence', String(record.occurrenceId || ''));
        desiredNodes.push(card);
        image = card.__playlistQueueImage;
        artworkTier = PlaybackQueueModel.windowTier(windowValue, absoluteIndex);
        if (presentation.available && item.image) {
          artworkRequests.push({
            image: image,
            source: item.image,
            tier: artworkTier,
            priority: absoluteIndex === drawerState.index ? 0 : 1,
            sourceContext: presentation.sourceContext
          });
        } else if (loader && loader.load) { emptyArtworkImages.push(image); }
      }
      spacerNode = spacer('is-after', total - windowValue.retainedEnd);
      if (spacerNode) { desiredNodes.push(spacerNode); }
      reconcileNodes(list, desiredNodes);
      releaseCards(retainedCards);
      for (offset = 0; offset < emptyArtworkImages.length; offset += 1) {
        loader.load(emptyArtworkImages[offset], { source: '', scope: 'playlist-queue' });
      }
      for (offset = 0; offset < artworkRequests.length; offset += 1) {
        loadArtwork(
          artworkRequests[offset].image,
          artworkRequests[offset].source,
          artworkRequests[offset].tier,
          artworkRequests[offset].priority,
          artworkRequests[offset].sourceContext
        );
      }
      prefetchArtwork(windowResult && windowResult.prefetchItems || []);
      scrollDirection = direction;
      updateDrawerFocus(queueValue, drawerState, currentIndex);
    }

    function renderDrawer(detailStateValue, queueValue, currentIndexValue) {
      var detailState = detailStateValue || detailSnapshot();
      var active = queueValue || activeQueue(detailState);
      var drawer;
      var list;
      var title;
      var position;
      var currentIndex = currentIndexValue === undefined ? activeIndex(active, detailState) : Number(currentIndexValue || 0);
      var token = renderToken += 1;
      var direction = scrollDirection;
      ensureUi();
      drawer = document && document.getElementById('player-playlist-queue');
      list = drawer && drawer.querySelector('.player-playlist-queue-list');
      title = drawer && drawer.querySelector('.player-playlist-queue-title');
      position = drawer && drawer.querySelector('.player-playlist-queue-position');
      if (!drawer || !list || !active || !queueController || !queueController.loadDrawerWindow) { return false; }
      queueController.loadDrawerWindow({
        viewportItems: viewportItems(list),
        direction: prefetchDirection.direction
      }, function (error, windowResult) {
        var liveQueueState = queueSnapshot();
        if (destroyed || token !== renderToken || !liveQueueState.drawer || !liveQueueState.drawer.open) { return; }
        if (error || !windowResult) {
          call(options.showMessage, t('status.libraryUnavailable'));
          return;
        }
        applyDrawerWindow(active, liveQueueState.drawer, list, title, position, windowResult, direction, currentIndex);
      }, detailState);
      return true;
    }

    function renderDrawerState(snapshot) {
      var drawer;
      var player;
      var detailState;
      var queueValue = snapshot && snapshot.queue;
      var currentIndex = Number(snapshot && snapshot.currentIndex || 0);
      if (destroyed) { return false; }
      ensureUi();
      drawer = document && document.getElementById('player-playlist-queue');
      player = document && document.getElementById('player-view');
      if (!drawer || !player) { return false; }
      if (snapshot && snapshot.open) {
        detailState = detailSnapshot();
        drawer.className = 'player-playlist-queue is-open';
        drawer.setAttribute('aria-hidden', 'false');
        player.className = player.className.replace(/\s*has-playlist-queue-open/g, '') + ' has-playlist-queue-open';
        renderDrawer(detailState, queueValue, currentIndex);
        updateDrawerFocus(queueValue, snapshot, currentIndex);
        resetViewportScroll();
      } else {
        drawer.className = 'player-playlist-queue';
        drawer.setAttribute('aria-hidden', 'true');
        player.className = player.className.replace(/\s*has-playlist-queue-open/g, '');
        resetViewportScroll();
      }
      updateButton({ drawer: snapshot || { open: false } }, !!queueValue);
      return true;
    }

    function prefetchClosedDrawer(snapshotValue) {
      var state = snapshotValue || queueSnapshot();
      var detail;
      var queue;
      var currentIndex;
      var identity;
      var token;
      if (destroyed || currentView() !== 'player' || !state.drawer || state.drawer.open || !queueController.loadDrawerWindow) {
        return false;
      }
      detail = detailSnapshot();
      queue = activeQueue(detail);
      if (!queue) {
        releasePrefetchImages(null);
        return false;
      }
      currentIndex = activeIndex(queue, detail);
      identity = String(state.sequence && state.sequence.identity || '');
      token = closedPrefetchToken += 1;
      queueController.loadDrawerWindow({
        viewportItems: 5,
        direction: 0,
        focusIndex: currentIndex,
        visibleOnly: true
      }, function (error, windowResult) {
        var liveState;
        if (destroyed || token !== closedPrefetchToken || error || !windowResult) { return; }
        liveState = queueSnapshot();
        if (currentView() !== 'player' || !liveState.drawer || liveState.drawer.open ||
            String(liveState.sequence && liveState.sequence.identity || '') !== identity) { return; }
        prefetchArtwork(windowResult.items || []);
      }, detail);
      return true;
    }

    function updatePresentation() {
      var state;
      var identity;
      if (destroyed) { return false; }
      state = queueSnapshot();
      identity = String(state.sequence && state.sequence.identity || '');
      if (identity !== cardOriginIdentity) {
        releaseCards(null);
        releasePrefetchImages(null);
        cardOriginIdentity = identity;
      }
      if (state.drawer && state.drawer.open) {
        closedPrefetchToken += 1;
        renderDrawerState(state.drawer);
      } else {
        updateButton(state);
      }
      return true;
    }

    function open() {
      if (destroyed || !available() || currentView() !== 'player') { return false; }
      scrollDirection = 0;
      prefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
      ensureUi();
      call(options.closeChapterDrawer, false);
      call(options.cancelAutoplay, false);
      call(options.showControls);
      call(options.cancelControlsTimeout);
      queueController.openDrawer(detailSnapshot(), call(options.animationDuration, 220));
      return true;
    }

    function close(restoreFocus) {
      var buttons;
      var index;
      if (destroyed) { return false; }
      scrollDirection = 0;
      prefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
      if (queueController && queueController.closeDrawer) { queueController.closeDrawer(); }
      if (restoreFocus && currentView() === 'player' && document) {
        buttons = document.querySelectorAll('.player-button');
        for (index = 0; index < buttons.length; index += 1) {
          if (buttons[index].id === 'player-playlist-queue-button') {
            call(options.setControlsZone, 'buttons', index);
            break;
          }
        }
        call(options.showControls);
      }
      return true;
    }

    function move(direction) {
      if (destroyed || !queueController || !queueController.moveDrawer) { return false; }
      scrollDirection = Number(direction) < 0 ? -1 : 1;
      if (PlaybackQueueModel && PlaybackQueueModel.prefetchDirection) {
        prefetchDirection = PlaybackQueueModel.prefetchDirection(prefetchDirection, scrollDirection);
      } else {
        prefetchDirection.direction = scrollDirection;
      }
      queueController.moveDrawer(direction, detailSnapshot());
      return true;
    }

    function pointerFocus(button) {
      var snapshot;
      if (destroyed || !button || !button.hasAttribute || !button.hasAttribute('data-playlist-queue-index')) { return false; }
      snapshot = queueSnapshot();
      if (!snapshot.drawer || !snapshot.drawer.open || !queueController || !queueController.pointDrawer) { return false; }
      queueController.pointDrawer(Number(button.getAttribute('data-playlist-queue-index')), detailSnapshot());
      return true;
    }

    function resetPresentation() {
      if (destroyed) { return false; }
      renderToken += 1;
      scrollDirection = 0;
      prefetchDirection = { direction: 0, pendingDirection: 0, pendingCount: 0 };
      cardOriginIdentity = '';
      playbackPaused = null;
      closedPrefetchToken += 1;
      releaseCards(null);
      releasePrefetchImages(null);
      return true;
    }

    function resetPlaybackState() {
      if (destroyed) { return false; }
      playbackPaused = null;
      return true;
    }

    function destroy() {
      if (destroyed) { return; }
      resetPresentation();
      destroyed = true;
      call(options.cancelImages, 'playlist-queue');
      call(options.cancelImages, 'playlist-queue-prefetch');
    }

    if (!document) { throw new Error('PlayerQueueController requires document'); }
    if (!PlaybackQueueModel) { throw new Error('PlayerQueueController requires PlaybackQueueModel'); }
    if (!queueController) { throw new Error('PlayerQueueController requires queueController'); }

    return {
      close: close,
      destroy: destroy,
      ensureUi: ensureUi,
      label: label,
      move: move,
      open: open,
      pointerFocus: pointerFocus,
      renderDrawerState: renderDrawerState,
      resetPlaybackState: resetPlaybackState,
      resetPresentation: resetPresentation,
      updateButton: updateButton,
      updatePlaybackMarkers: updatePlaybackMarkers,
      updatePresentation: updatePresentation
    };
  }

  return { create: create };
}));
