(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffMetadataRefresh = factory();
  }
}(this, function () {
  'use strict';

  function uniqueKeys(values) {
    return (values || []).filter(function (value, index, items) {
      return !!value && items.indexOf(value) === index;
    });
  }

  function run(options, callback) {
    var keys = uniqueKeys(options.keys);

    function next(index) {
      if (index >= keys.length) { callback(null); return; }
      options.refresh(keys[index], function (refreshError, activityId) {
        if (refreshError) { callback(refreshError); return; }
        options.wait(activityId, function () {
          options.reload(keys[index], function (reloadError) {
            if (reloadError) { callback(reloadError); return; }
            next(index + 1);
          });
        });
      });
    }

    next(0);
  }

  return { run: run };
}));
