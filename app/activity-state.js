(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffActivityState = factory();
  }
}(this, function () {
  'use strict';

  function idMap(activities) {
    var result = {};
    (activities || []).forEach(function (activity) {
      if (activity && activity.id) { result[String(activity.id)] = true; }
    });
    return result;
  }

  function createWaiter(activityId, baselineActivities, startedAt) {
    return {
      activityId: String(activityId || ''),
      baseline: idMap(baselineActivities),
      tracked: {},
      seen: false,
      startedAt: Number(startedAt || 0)
    };
  }

  function advanceWaiter(waiter, activities, now) {
    var current = idMap(activities);
    var key;
    var trackedCount = 0;
    if (waiter.activityId) {
      if (current[waiter.activityId]) {
        waiter.seen = true;
        return false;
      }
      if (waiter.seen) { return true; }
      return Number(now) - waiter.startedAt >= 3500;
    }
    for (key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key) && !waiter.baseline[key]) {
        waiter.tracked[key] = true;
      }
    }
    for (key in waiter.tracked) {
      if (!Object.prototype.hasOwnProperty.call(waiter.tracked, key)) { continue; }
      trackedCount += 1;
      if (current[key]) { return false; }
    }
    if (trackedCount) { return true; }
    return Number(now) - waiter.startedAt >= 3500;
  }

  function fingerprint(activities) {
    return JSON.stringify((activities || []).map(function (activity) {
      return {
        id: String(activity.id || ''),
        progress: Number(activity.progress || 0),
        subtitle: String(activity.subtitle || ''),
        title: String(activity.title || ''),
        type: String(activity.type || '')
      };
    }).sort(function (left, right) {
      return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0);
    }));
  }

  return {
    advanceWaiter: advanceWaiter,
    createWaiter: createWaiter,
    fingerprint: fingerprint
  };
}));
