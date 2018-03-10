import Controller from '@ember/controller';
import { debug } from '@ember/debug';
export default Controller.extend({
  init() {
    this._super(...arguments);
    this.set('currentSelection', [0, 0]);
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
    removeHighlight() {
      let sel = this.get('currentSelection');
      this.get('rawEditor').clearHighlightForRange(...sel, {typeof: "schema:CreativeWork"});
    },
    clearAll() {
      this.get('rawEditor').clearAllHighlights();
    }
  }
});
