import EmberObject from '@ember/object';
import HandlerResponse from './handler-response';
import nextTextNode from './next-text-node';

export default EmberObject.extend({
  isHandlerFor(event) {
    return (event.type === "keydown" && event.key === "Tab" && this.rawEditor.currentNode);
  },
  handleEvent(event) {
    const currentNode = this.rawEditor.currentNode;
    const nextNode = this.nextNode(currentNode);
    this.rawEditor.updateRichNode();
    this.rawEditor.setCarret(nextNode, 0);
    console.log(nextNode);
    return new HandlerResponse({ allowPropagation: false});
  },
  nextNode(current) {
    return nextTextNode(current, this.rawEditor.rootNode);
  }
});

