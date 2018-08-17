import Component from '@ember/component';
import layout from '../templates/components/a-test-component';
export default Component.extend({
  layout,
  actions: {
    checked(name, value) {
      this.set('content.aanwezigen.' + name, ! value);
      this.contentUpdate(this.content);
    }
  }
});
