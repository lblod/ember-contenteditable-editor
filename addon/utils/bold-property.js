import EditorProperty from './editor-property';

class BoldProperty extends EditorProperty {
  constructor() {
    super();
    this.newContext = true;
    this.tagName = 'strong';
  }
  enabledAt(richNode) {
    if (richNode.type === 'text') {
      return window.getComputedStyle(richNode.parent.domNode).fontWeight > 400;
    }
    else if (richNode.type === 'tag') {
      return window.getComputedStyle(richNode.domNode).fontWeight > 400;
    }
    else
      return false;
  }
}

export default new BoldProperty();
