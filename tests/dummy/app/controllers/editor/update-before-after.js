import Controller from '@ember/controller';
import { debug } from '@ember/debug';
import { A } from '@ember/array';
export default Controller.extend({
  init() {
    this._super(...arguments);
    this.set('currentSelection', [0, 0]);
    this.set('components', A());
  },
  rawEditor: null,
  highlight: false,
  showContent: true,
  actions: {
    rawEditorInit(editor) {
      this.set('editor', editor);
      window.editor = editor; //Handy to play with
    },
    selectionUpdate() {
      this.set('currentSelection',this.get('rawEditor.currentSelection'));
    },
    handleTextInsert(start, content) {
      debug('text insert');
      debug(start + ' ' + content);
    },
    handleTextRemove(start,end) {
      debug('text remove');
      debug(start + ' ' +  end);
    },
    elementUpdate() {
      debug(this.get('rawEditor.rootNode'));
    },
    reload(){
      window.location.reload(true);
    },
    case1(){
      let selection = this.editor.selectContext([58, 58], {property: 'http://test/editor/update-before-after/property1'});
      this.editor.update(selection, {before: {property: ['test:property3'] } });
    },
    case2(){
      let selection = this.editor.selectContext([58, 58], {property: 'http://test/editor/update-before-after/property1'});
      this.editor.update(selection, {after: {property: ['test:property3'] } });
    },
    case3(){
      let selection = this.editor.selectContext([58, 58], {property: 'http://test/editor/update-before-after/property1'});
      this.editor.update(selection, {after: {property: ['test:property3'], resource: 'http://a/new/resource' } });
    },
    case4(){
      let selection = this.editor.selectContext([58, 58], {property: 'http://test/editor/update-before-after/property1'});
      this.editor.update(selection, {after: {property: ['test:property3'], content: 'some content' } });
    },
    case5(){
      let selection = this.editor.selectContext([0, 10000], {resource: 'http://test/editor/update-before-after/Resource1'});
      this.editor.update(selection, {after: {property: 'test:aPropertyFoaf test:anotherPropertyOfFoaf', content: 'some content', typeof: ['test:aShinyNewThing'],
                                             resource:'http://new/resource' } });
    }
  }
});
