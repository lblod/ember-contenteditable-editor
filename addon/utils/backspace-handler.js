import EmberObject from '@ember/object';
import { reads } from '@ember/object/computed';
import HandlerResponse from './handler-response';
import { get } from '@ember/object';
import { invisibleSpace, isEmptyList, isList, removeNode } from './dom-helpers';
import previousTextNode from './previous-text-node';
import { warn } from '@ember/debug';
import { A } from '@ember/array';

export default EmberObject.extend({
  rootNode: reads('rawEditor.rootNode'),
  currentSelection: reads('rawEditor.currentSelection'),
  richNode: reads('rawEditor.richNode'),
  currentNode: reads('rawEditor.currentNode'),

  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event){
    return event.type === "keydown"
      && event.key === 'Backspace'
      && this.get('rawEditor.currentSelectionIsACursor')
      && this.doesCurrentNodeBelongsToContentEditable();
  },

  doesCurrentNodeBelongsToContentEditable(){
    return this.currentNode.parentNode && this.currentNode.parentNode.isContentEditable;
  },
  /**
   * given richnode and absolute position, matches position within text node
   * @method absoluteToRelativePostion
   * @param {Object} richNode
   * @param {Int} position
   * @return {RichNode}
   * @private
   */
  absoluteToRelativePosition(richNode, position){
    return position -  get(richNode, 'start');
  },

  /**
   * handle backspace event
   * @method handleEvent
   * @return {HandlerResponse}
   * @public
   */
  handleEvent() {
    this.rawEditor.externalDomUpdate('backspace', () => this.backSpace());
    return HandlerResponse.create({ allowPropagation: false });
  },
  visibleText(node) {
    return node.textContent.replace(invisibleSpace,'').replace(/\s+/,' ');
  },
  backSpace() {
    const position = this.currentSelection[0];
    const textNode = this.currentNode;
    const richNode = this.rawEditor.getRichNodeFor(textNode);
    try {
      //enter relative space
      const relPosition = this.absoluteToRelativePosition(richNode, position);
      const visibleLength = this.visibleText(textNode).length;
      if (visibleLength > 0) {
        // non empty node
        if (relPosition === 0) {
          // start of node, move to previous node an start backspacing there
          const previousNode = previousTextNode(textNode, this.rawEditor.rootNode);
          if (previousNode) {
            this.rawEditor.setCarret(previousNode, previousNode.length, false);
            this.backSpace();
          }
          else {
            warn('empty previousnode, not doing anything', { id: 'rdfaeditor.invalidState'});
          }
        }
        else {
          // not empty and we're not at the start, delete character before the carret
          const text = textNode.textContent;
          const slicedText = text.slice(relPosition - 1 , relPosition);
          textNode.textContent = text.slice(0, relPosition - 1) + text.slice(relPosition);
          this.rawEditor.setCarret(textNode, relPosition - 1 , false);
          if (slicedText === invisibleSpace) {
            this.handleEvent();
          }
        }
      }
      else {
        // empty node, move to previous text node and remove nodes in between
        const previousNode = previousTextNode(textNode, this.rawEditor.rootNode);
        if (previousNode) {
          // if previousNode is null we should be at the start of the editor
          this.rawEditor.setCarret(previousNode, previousNode.length, false);
          this.removeNodesFromTo(textNode, previousNode);
        }
      }
    }
    catch(e) {
      warn(e, { id: 'rdfaeditor.invalidState'});
    }
  },
  previousNode(node) {
    /* backwards walk of dom tree */
    var previousNode;
    if (node.previousSibling) {
      previousNode = node.previousSibling;
      if (previousNode.lastChild)
        previousNode = previousNode.lastChild;
    }
    else if(node.parentNode) {
      previousNode = node.parentNode;
    }
    else {
      throw "node does not have a parent node, not part of editor";
    }
    return previousNode;
  },
  removeNodesFromTo(nodeAfter, nodeBefore, nodes = A()) {
    var previousNode = this.previousNode(nodeAfter);
    if (previousNode === nodeBefore) {
      for (const node of nodes) {
        if ( ! isList(node) || isEmptyList(node))
          removeNode(node);
      }
    }
    else if (previousNode === this.rawEditor.rootNode) {
      warn('no path between nodes exists', { id: 'rdfaeditor.invalidState'});
    }
    else {
      nodes.pushObject(nodeAfter);
      this.removeNodesFromTo(previousNode, nodeBefore, nodes);
    }
  }
});
