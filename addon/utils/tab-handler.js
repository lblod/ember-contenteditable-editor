import EmberObject from '@ember/object';
import HandlerResponse from './handler-response';
import { tagName, isVoidElement, insertTextNodeWithSpace } from './dom-helpers';

export default EmberObject.extend({
  isHandlerFor(event) {
    return (event.type === "keydown" && event.key === "Tab" && this.rawEditor.currentNode);
  },
  handleEvent(event) {
    const currentNode = this.rawEditor.currentNode;
    const nextNode = this.nextNode(currentNode);
    this.rawEditor.updateRichNode();
    this.rawEditor.setCarret(nextNode, 0);
    console.log(nextNode.parentNode);
    return new HandlerResponse({ allowPropagation: false});
  },
  nextNode(current) {
    if (current.nodeType === Node.ELEMENT_NODE && current.firstChild) {
      // current node has children, move down
      if (current.firstChild.nodeType === Node.TEXT_NODE) {
        return current.firstChild;
      }
      else if (current.firstChild.nodeType === Node.ELEMENT_NODE && tagName(current.firstChild) === 'li') {
        return this.nextNode(current.firstChild);
      }
      else {
        return insertTextNodeWithSpace(current,current.firstChild);
      }
    }
    else if (current.nodeType === Node.ELEMENT_NODE) {
      // current node is an element without children
      if (isVoidElement(current)) {
        // current node is a void node, create text node after
        if (current.nextSibling.nodeType === Node.TEXT_NODE)
          return current.nextSibling;
        else
          return insertTextNodeWithSpace(current.parentNode, current, true);
      }
      else {
        // create text node in empty tag
        const newNode = document.createTextNode();
        current.appendChild(newNode);
        return newNode;
      }
    }
    else if (current.nodeType === Node.TEXT_NODE) {
      // it's a text node
      if (current.nextSibling) {
        return this.nextNode(current.nextSibling);
      }
      else if (current.parentNode === this.rawEditor.rootNode) {
        return current;
      }
      else {
        // no sibling, parent is not the editor
        var parent = current.parentNode;
        if (parent.nextSibling && parent.nextSibling.nodeType === Node.TEXT_NODE) {
          return parent.nextSibling;
        }
        else if (parent.nextSibling && parent.nextSibling.nodeType === Node.ELEMENT_NODE && tagName(parent.nextSibling) === 'li') {
          return this.nextNode(parent.nextSibling);
        }
        else {
          return insertTextNodeWithSpace(parent.parentNode, parent, true);
        }
      }
    }
    else {
      // it's an unsupported tag, skip
      if (current.nextSibling)
        return this.nextNode(current.nextSibling);
      else
        return this.nextNode(current.parentNode);
    }
  }
});

