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
      this.set('rawEditor', editor);
    },
    toggleContent() {
      this.toggleProperty('showContent');
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
    highlightText() {
      let sel = this.get('currentSelection');
      this.get('rawEditor').highlightRange(...sel, {typeof: "schema:CreativeWork"});
    },
    insertComponentOnCursor() {
      let [start ] = this.get('currentSelection');
      this.get('rawEditor').insertComponent(start, "a-test-component", {aanwezigen: { joris: false, niels: true, jan: true, piet:false}});
    },
    removeHighlight() {
      let sel = this.get('currentSelection');
      this.get('rawEditor').clearHighlightForRange(...sel, {typeof: "schema:CreativeWork"});
    },
    clearAll() {
      this.get('rawEditor').clearAllHighlights();
    },
    insertUL(){
      this.get('rawEditor').insertUL();
    }
  }
});
