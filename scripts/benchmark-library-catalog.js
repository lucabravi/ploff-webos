'use strict';

var LibraryGridView = require('../app/library-grid-view');
var LibraryContainers = require('../app/library-containers');
var SearchModel = require('../app/search-model');

var ITEM_COUNT = Number(process.env.PLOFF_CATALOG_ITEMS || 5000);
var ROUNDS = Number(process.env.PLOFF_CATALOG_ROUNDS || 7);

function emptyCounters() {
  return {
    appendChild: 0,
    cardMetrics: 0,
    cardProfile: 0,
    createdNodes: 0,
    focus: 0,
    layoutReads: 0,
    mediaDetail: 0,
    mediaMeta: 0,
    mediaTitle: 0,
    posterBatches: 0,
    posterCancels: 0,
    posterFullJobs: 0,
    posterJobs: 0,
    posterPreviewJobs: 0,
    posterSpecifications: 0,
    querySelector: 0,
    removeChild: 0,
    setAttribute: 0
  };
}

function resetCounters(target) {
  var fresh = emptyCounters();
  Object.keys(fresh).forEach(function (key) { target[key] = fresh[key]; });
}

function copyCounters(source) {
  var result = {};
  Object.keys(source).forEach(function (key) { result[key] = source[key]; });
  return result;
}

function matches(value, selector) {
  var pair = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
  if (pair) { return value.getAttribute(pair[1]) === pair[2]; }
  if (selector.charAt(0) === '.') { return (' ' + value.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1; }
  return value.tagName.toLowerCase() === selector.toLowerCase();
}

function find(root, selector, result) {
  var output = result || [];
  root.children.forEach(function (child) {
    if (matches(child, selector)) { output.push(child); }
    find(child, selector, output);
  });
  return output;
}

function node(counters, tagName, className, text) {
  var value;
  counters.createdNodes += 1;
  value = {
    tagName: String(tagName || '').toUpperCase(),
    className: className || '',
    textContent: text || '',
    children: [],
    attributes: {},
    style: {},
    parentNode: null,
    clientWidth: 0,
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
    scrollLeft: 0,
    appendChild: function (child) {
      counters.appendChild += 1;
      if (child.parentNode) { child.parentNode.removeChild(child); }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore: function (child, reference) {
      var index = this.children.indexOf(reference);
      counters.appendChild += 1;
      if (child.parentNode) { child.parentNode.removeChild(child); }
      child.parentNode = this;
      if (index < 0) { this.children.push(child); }
      else { this.children.splice(index, 0, child); }
      return child;
    },
    removeChild: function (child) {
      var index = this.children.indexOf(child);
      counters.removeChild += 1;
      if (index >= 0) { this.children.splice(index, 1); child.parentNode = null; }
      return child;
    },
    setAttribute: function (key, attributeValue) {
      counters.setAttribute += 1;
      this.attributes[key] = String(attributeValue);
    },
    getAttribute: function (key) { return this.attributes[key]; },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attributes, key); },
    focus: function () { counters.focus += 1; this.focused = true; },
    getBoundingClientRect: function () {
      counters.layoutReads += 1;
      return {
        top: 0,
        left: 0,
        right: this.clientWidth || 100,
        bottom: this.clientHeight || 80,
        width: this.clientWidth || 100,
        height: this.clientHeight || 80
      };
    }
  };
  value.querySelector = function (selector) {
    counters.querySelector += 1;
    return find(value, selector)[0] || null;
  };
  value.querySelectorAll = function (selector) {
    counters.querySelector += 1;
    return find(value, selector);
  };
  value.getElementsByTagName = function (tag) {
    counters.querySelector += 1;
    return find(value, String(tag).toLowerCase());
  };
  Object.defineProperty(value, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      while (value.children.length) { value.removeChild(value.children[0]); }
      value.textContent = '';
    }
  });
  return value;
}

function fixture() {
  var counters = emptyCounters();
  var roots = {};
  var rafId = 0;
  var documentRef;
  var view;
  ['library-grid', 'library-grid-content', 'library-recommended'].forEach(function (id) {
    roots[id] = node(counters, 'div');
    roots[id].id = id;
  });
  roots['library-grid'].clientWidth = 512;
  roots['library-grid'].clientHeight = 240;
  roots['library-grid'].scrollHeight = 1000000;
  roots['library-grid'].appendChild(roots['library-grid-content']);
  documentRef = {
    createElement: function (tagName) { return node(counters, tagName); },
    createTextNode: function (text) { return node(counters, '#text', '', text); },
    getElementById: function (id) { return roots[id]; },
    querySelector: function (selector) {
      var ids = Object.keys(roots);
      var index;
      var found;
      counters.querySelector += 1;
      for (index = 0; index < ids.length; index += 1) {
        found = find(roots[ids[index]], selector);
        if (found.length) { return found[0]; }
      }
      return null;
    },
    querySelectorAll: function (selector) {
      var output = [];
      counters.querySelector += 1;
      Object.keys(roots).forEach(function (id) { find(roots[id], selector, output); });
      return output;
    }
  };
  view = LibraryGridView.create({
    root: {
      cancelAnimationFrame: function () {},
      clearTimeout: function () {},
      requestAnimationFrame: function (callback) { rafId += 1; callback(); return rafId; },
      setTimeout: function (callback) { callback(); return 1; }
    },
    document: documentRef,
    SearchModel: SearchModel,
    moveGridDown: LibraryContainers.moveGridDown,
    element: function (tagName, className, text) { return node(counters, tagName, className, text); },
    cardProfile: function () {
      counters.cardProfile += 1;
      return {
        metrics: { width: 100, imageHeight: 70, columnStep: 100, rowStep: 80 },
        poster: { width: 100, height: 70, previewWidth: 96, previewHeight: 67 }
      };
    },
    cardMetrics: function () {
      counters.cardMetrics += 1;
      return { width: 100, imageHeight: 70, columnStep: 100, rowStep: 80 };
    },
    mediaTitle: function (item) { counters.mediaTitle += 1; return item.title; },
    mediaCardMeta: function (item) { counters.mediaMeta += 1; return item.meta || ''; },
    mediaCardDetail: function (item) { counters.mediaDetail += 1; return item.detail || ''; },
    mediaKey: function (item) { return item.ratingKey; },
    fixedPosterSpecification: function (source, size, priority, scope) {
      counters.posterSpecifications += 1;
      return { source: source, priority: priority, scope: scope, width: size.width, height: size.height, previewWidth: size.previewWidth, previewHeight: size.previewHeight };
    },
    renderedPosterSpecification: function (image, source, priority, scope, width, height) {
      counters.posterSpecifications += 1;
      return { source: source, priority: priority, scope: scope, width: width, height: height };
    },
    posterLoader: {
      cancelScope: function () {},
      cancel: function () { counters.posterCancels += 1; },
      loadBatch: function (jobs) {
        counters.posterBatches += 1;
        counters.posterJobs += jobs.length;
        jobs.forEach(function (job) {
          if (job && job.specification && job.specification.previewOnly) { counters.posterPreviewJobs += 1; }
          else { counters.posterFullJobs += 1; }
        });
      },
      prioritize: function () {}
    },
    clearFocus: function () {},
    pointerSelectionActive: function () { return false; },
    onFocus: function () {},
    overscanRows: 3
  });
  return { counters: counters, roots: roots, view: view };
}

function items(count, start) {
  var result = [];
  var index;
  var offset = Number(start || 0);
  for (index = 0; index < count; index += 1) {
    result.push({
      ratingKey: 'item-' + (offset + index),
      title: 'Catalog item ' + (offset + index),
      meta: '2026',
      detail: 'Detail ' + (offset + index),
      image: '/library/metadata/' + (offset + index) + '/thumb',
      progress: index % 3 === 0 ? 37 : undefined,
      rating: index % 5 === 0 ? 8.4 : undefined,
      viewed: index % 7 === 0
    });
  }
  return result;
}

function elapsedMilliseconds(callback) {
  var start = process.hrtime.bigint();
  callback();
  return Number(process.hrtime.bigint() - start) / 1000000;
}

function median(values) {
  var sorted = values.slice().sort(function (left, right) { return left - right; });
  var middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function addCounters(target, source) {
  Object.keys(source).forEach(function (key) { target[key] = Number(target[key] || 0) + Number(source[key] || 0); });
}

function divideCounters(source, divisor) {
  var result = {};
  Object.keys(source).forEach(function (key) { result[key] = Number((source[key] / divisor).toFixed(3)); });
  return result;
}

function runScenario(name, iterations, prepare, execute) {
  var times = [];
  var totals = emptyCounters();
  var round;
  var context;
  for (round = 0; round < ROUNDS + 1; round += 1) {
    context = fixture();
    prepare(context);
    resetCounters(context.counters);
    var time = elapsedMilliseconds(function () { execute(context, iterations); });
    if (round > 0) {
      times.push(time);
      addCounters(totals, copyCounters(context.counters));
    }
  }
  return {
    name: name,
    iterations: iterations,
    medianMs: Number(median(times).toFixed(3)),
    operationsPerIteration: divideCounters(totals, iterations * ROUNDS)
  };
}

function benchmark() {
  var catalogItems = items(ITEM_COUNT);
  var results = [];
  results.push(runScenario('focus-move-integrated', 5000, function (context) {
    context.view.setMode('catalog', true);
    context.view.setItems(catalogItems, ITEM_COUNT);
  }, function (context, iterations) {
    var index;
    for (index = 0; index < iterations; index += 1) {
      context.view.handleDirection(index % 2 === 0 ? 'right' : 'left');
      context.view.refreshFocus();
    }
  }));
  results.push(runScenario('scroll-same-window', 3000, function (context) {
    context.view.setMode('catalog', true);
    context.view.setItems(catalogItems, ITEM_COUNT);
  }, function (context, iterations) {
    var index;
    for (index = 0; index < iterations; index += 1) {
      context.roots['library-grid'].scrollTop = index % 70;
      context.view.onScroll();
    }
  }));
  results.push(runScenario('scroll-row-boundary', 1500, function (context) {
    context.view.setMode('catalog', true);
    context.view.setItems(catalogItems, ITEM_COUNT);
  }, function (context, iterations) {
    var index;
    for (index = 0; index < iterations; index += 1) {
      context.roots['library-grid'].scrollTop = index % 2 === 0 ? 320 : 400;
      context.view.onScroll();
    }
  }));
  results.push(runScenario('append-pages', 100, function (context) {
    context.loadedItems = items(60);
    context.view.setMode('catalog', true);
    context.view.setItems(context.loadedItems, 6060);
  }, function (context, iterations) {
    var index;
    var page;
    for (index = 0; index < iterations; index += 1) {
      page = items(60, context.loadedItems.length);
      context.loadedItems = context.loadedItems.concat(page);
      if (context.view.appendItems) { context.view.appendItems(page, 6060); }
      else { context.view.setItems(context.loadedItems, 6060); }
    }
  }));
  return {
    node: process.version,
    items: ITEM_COUNT,
    rounds: ROUNDS,
    results: results
  };
}

function print(result) {
  console.log('Ploff catalog benchmark');
  console.log('Node ' + result.node + ', items ' + result.items + ', measured rounds ' + result.rounds);
  result.results.forEach(function (scenario) {
    console.log('\n' + scenario.name + ': ' + scenario.medianMs.toFixed(3) + ' ms / ' + scenario.iterations + ' iterations');
    console.log(JSON.stringify(scenario.operationsPerIteration));
  });
  console.log('\nJSON');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) { print(benchmark()); }

module.exports = { benchmark: benchmark, fixture: fixture, items: items, resetCounters: resetCounters };
