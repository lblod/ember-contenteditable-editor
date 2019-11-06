import EmberObject from '@ember/object';
import { reads } from '@ember/object/computed';
import HandlerResponse from './handler-response';
import { get } from '@ember/object';
import {
  invisibleSpace,
  isEmptyList,
  isList,
  removeNode,
  isAllWhitespace,
  isLI,
  findPreviousLi
} from './dom-helpers';
import previousTextNode from './previous-text-node';
import { warn, debug } from '@ember/debug';
import { A } from '@ember/array';

/**
 * default uri for block removal
 * TODO: the initial idea was to put this code in rdfa-editor,
 *       but it seems to be a tedious task.
 *       The idea is that eventually, both contenteditable and rdfa-editor should be merged.
 * @static
 * @public
 * @final
 */
const BLOCK_REMOVAL_NODE_URI = 'http://lblod.data.gift/vocabularies/editor/isBlockRemovalNode';

/**
 * Backspace Handler, a event handler to handle the generic backspace case
 *
 * @module contenteditable-editor
 * @class BackspaceHandler
 * @constructor
 * @extends EmberObject
 */
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
  deleteCharacter(textNode, trueRelativePosition) {
    const text = textNode.textContent;
    const slicedText = text.slice(trueRelativePosition - 1 , trueRelativePosition);
    textNode.textContent = text.slice(0, trueRelativePosition - slicedText.length) + text.slice(trueRelativePosition);
    this.rawEditor.updateRichNode();
    this.rawEditor.setCarret(textNode, trueRelativePosition - slicedText.length);
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
    return Math.max(position -  get(richNode, 'start'), 0);
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
  /**
   * return to visible text of a node,
   * e.g. removes invisibleSpaces and compacts consecutive spaces to 1 space
   * @method visibleText
   * @param {Node} node
   * @return {String}
   * @public
   */
  visibleText(node) {
    return this.stringToVisibleText(node.textContent);
  },
  /**
   * removes invisibleSpaces and compacts consecutive spaces to 1 space
   * @method stringToVisibleText
   * @param {String} text
   * @return {String}
   * @public
   */
  stringToVisibleText(string) {
    return string.replace(invisibleSpace,'').replace(/\s+/,' ');
  },
  /**
   * executes a backspace
   * @method backspace
   * @public
   */
  backSpace() {
    const position = this.currentSelection[0];
    const textNode = this.currentNode;
    const richNode = this.rawEditor.getRichNodeFor(textNode);
    try {
      const originalText = textNode.textContent;
      const visibleText = this.visibleText(textNode);
      const visibleLength = visibleText.length;
      textNode.textContent = visibleText;
      if (visibleLength > 0 && !isAllWhitespace(textNode)) {
        // non empty node
        const relPosition = this.absoluteToRelativePosition(richNode, position);
        const textBeforeCursor = originalText.slice(0, relPosition);
        /* we need to correct the position, as we've just modified the text content
         * this calculates the delta by comparing the length of the original text before the cursor and the new length
         */
        const posCorrection = textBeforeCursor.length - this.stringToVisibleText(textBeforeCursor).length;
        const trueRelativePosition = relPosition - posCorrection;
        if (trueRelativePosition === 0) {
          // start of node, move to previous node an start backspacing there
          const previousNode = previousTextNode(textNode, this.rawEditor.rootNode);
          if (previousNode) {
            this.rawEditor.updateRichNode();
            this.rawEditor.setCarret(previousNode, previousNode.length);

            if(this.requiresBlockRemovalOfNode(previousNode, this.rawEditor.rootNode)){
              this.handleBlockRemovalofNode(previousNode, this.rawEditor.rootNode);
            }

            else if (isLI(textNode.parentNode) && richNode.start === richNode.parent.start) {
              // we're at the start of an li and need to handle this
              this.removeLI(textNode.parentNode);
              this.rawEditor.updateRichNode();
            }
            else {
              this.backSpace();
            }
          }
          else {
            debug('empty previousnode, not doing anything');
          }
        }
        else {

          if(this.requiresBlockRemovalOfNode(textNode, this.rawEditor.rootNode)){
            this.handleBlockRemovalofNode(textNode, this.rawEditor.rootNode);
          }

          // not empty and we're not at the start, delete character before the carret
          else this.deleteCharacter(textNode, trueRelativePosition);
        }
      }
      else {
        // empty node, move to previous text node and remove nodes in between
        let previousNode = previousTextNode(textNode, this.rawEditor.rootNode);
        if (previousNode) {
          this.removeNodesFromTo(textNode, previousNode);

          if(this.requiresBlockRemovalOfNode(previousNode, this.rawEditor.rootNode)){
            this.handleBlockRemovalofNode(previousNode, this.rawEditor.rootNode);
          }
          else {
            // if previousNode is null we should be at the start of the editor and do nothing
            this.rawEditor.updateRichNode();
            this.rawEditor.setCarret(previousNode, previousNode.length);
          }
        }
        else {
          debug('empty previousnode, not doing anything');
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
      nodes.pushObject(nodeAfter);
      for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          removeNode(node);
        }
        else if (isLI(node)) {
          this.removeLI(node);
        }
        else if (node.children.length === 0 || isEmptyList(node)) {
          removeNode(node);
        }
        else {
          // still has content, not removing
        }
      }
    }
    else if (previousNode === this.rawEditor.rootNode) {
      warn('no path between nodes exists', { id: 'rdfaeditor.invalidState'});
    }
    else {
      nodes.pushObject(nodeAfter);
      this.removeNodesFromTo(previousNode, nodeBefore, nodes);
    }
  },
  /**
   * handles node removal for list items
   * list items can also be removed when not empty yet, most online editors seem to move content to a previous or parent node
   * so that's what we do here
   */
  removeLI(listitem) {
    const previousLI=findPreviousLi(listitem);
    const list = listitem.parentNode;
    const parent = list.parentNode ? list.parentNode : null;
    if (previousLI) {
      // move contents of node to previousLI and remove node
      while(listitem.firstChild){
        previousLI.append(listitem.firstChild); // moves the dom node
      }
      listitem.remove();
    }
    else if(parent) {
      // move contents to parent LI and remove node
      while(listitem.firstChild) {
        parent.append(listitem.firstChild); // moves the dom node
      }
      listitem.remove();
    }
    else {
      // no parent, do nothing for now
    }
  },

  handleBlockRemovalofNode(node, rootNode){
    const nodeToDeleteAsBlock = this.getNodeForBlockRemoval(node, this.rawEditor.rootNode);
    const previousNode = previousTextNode(nodeToDeleteAsBlock, this.rawEditor.rootNode);
    this.removeNodesFromTo(previousNode, nodeToDeleteAsBlock);
    nodeToDeleteAsBlock.remove();
    this.rawEditor.updateRichNode();
    this.rawEditor.setCarret(previousNode, previousNode.length);
  },

  requiresBlockRemovalOfNode(node, rootNode){
    if(this.getNodeForBlockRemoval(node, rootNode)){
      return true;
    }
    return false;
  },

  getNodeForBlockRemoval(node, rootNode){
    if(this.hasBlockRemovalProperty(node)){
      return node;
    }
    if(node.isSameNode(rootNode)){
      return null;
    }
    if(node.parentNode){
      return this.getNodeForBlockRemoval(node.parentNode, rootNode);
    }
    return null;
  },

  hasBlockRemovalProperty(node){
    if(!node.attributes) return false;
    if(!node.attributes["property"]) return false;
    if(!node.attributes["property"].value) return false;
    //TODO: this direct string matching is done for performance reasons. Marawa should eventually support incremental scanning.
    if(node.attributes["property"].value.indexOf(BLOCK_REMOVAL_NODE_URI) > -1) return true;
    return false;
  }

});
