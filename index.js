'use strict';
var path = require('path');
var Funnel = require('broccoli-funnel');
var MergeTrees = require('broccoli-merge-trees');

module.exports = {
  name: 'ember-contenteditable-editor',
  included: function (app) {
    this._super.included(app);
    app.import('vendor/diff.min.js');
    app.import('vendor/shims/diff.js');
  },
  treeForVendor(vendorTree) {
    var diffTree = new Funnel(path.dirname(require.resolve("diff/dist/diff.min.js")), {
      files: ['diff.min.js']
    });

    return new MergeTrees([vendorTree, diffTree]);
  }
};
