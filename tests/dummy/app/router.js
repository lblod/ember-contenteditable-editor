import EmberRouter from '@ember/routing/router';
import config from './config/environment';

const Router = EmberRouter.extend({
  location: config.locationType,
  rootURL: config.rootURL
});

Router.map(function() {
  this.route('lists');
  this.route('editor', function(){
    this.route('update-before-after');
  });
});

export default Router;
