(function() {
  function vendorModule() {
    'use strict';

    return {
      'default': self['JsDiff'],
      __esModule: true,
    };
  }

  define('diff', [], vendorModule);
})();
