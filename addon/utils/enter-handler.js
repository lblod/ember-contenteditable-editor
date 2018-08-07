import EmberObject from '@ember/object';
import { reads, alias } from '@ember/object/computed';
import getRichNodeMatchingDomNode from './get-rich-node-matching-dom-node';
import {
  tagName,
  isDisplayedAsBlock,
  invisibleSpace,
  isEmptyList,
  insertNodeBAfterNodeA,
  insertTextNodeWithSpace
} from './dom-helpers';
import HandlerResponse from './handler-response';
import { get } from '@ember/object';
import { debug } from '@ember/debug';
import { isBlank } from '@ember/utils';

/**
 * Enter Handler, a event handler to handle the generic enter case
 *
 * @module contenteditable-editor
 * @class EnterHandler
 * @constructor
 * @extends EmberObject
 */
export default EmberObject.extend({
  currentNode: alias('rawEditor.currentNode'),
  currentSelection: reads('rawEditor.currentSelection'),
  richNode: reads('rawEditor.richNode'),
  rootNode: reads('rawEditor.rootNode'),
  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event) {
    return event.type === "keydown" && event.key === "Enter" && this.get('rawEditor.currentSelectionIsACursor');
  },

  /**
   * handle the event
   * @method handleEvent
   * @param {DOMEvent} event
   * @return {HandlerResponse} response
   */
  handleEvent() {
    let currentNode = this.get('currentNode');
    let node = getRichNodeMatchingDomNode(currentNode, this.get('richNode'));
    let currentPosition = this.get('currentSelection')[0];
    let nodeForEnter = this.relevantNodeForEnter(node);
    let newCurrentNode;
    if (tagName(get(nodeForEnter, 'domNode')) === "li") {
      debug('enter in li');
      this.get('rawEditor').externalDomUpdate(
        'inserting enter in li',
        () => this.insertEnterInLi(node, nodeForEnter, currentPosition, currentNode)
      );
      return HandlerResponse.create({allowPropagation: false});
    }
    else {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        let insertBr = () => {
          debug('placing br');
          let splitAt = currentPosition - get(node, 'start');
          let above = document.createTextNode(currentNode.textContent.slice(0,splitAt));
          let content = currentNode.textContent.slice(splitAt);
          if (isBlank(content))
            content = invisibleSpace;
          let below = document.createTextNode(content);
          let br = document.createElement('br');
          currentNode.parentNode.insertBefore(above, currentNode);
          currentNode.parentNode.insertBefore(br, currentNode);
          currentNode.parentNode.insertBefore(below, currentNode);
          currentNode.parentNode.removeChild(currentNode);
          newCurrentNode = below;
        };
        this.get('rawEditor').externalDomUpdate('inserting enter in text', insertBr);
      }
      else {
        debug('-------------- not handling this enter yet------------------');
        return HandlerResponse.create({allowPropagation: true, allowBrowserDefault: true});
      }
      this.get('rawEditor').updateRichNode();
      let richNode = getRichNodeMatchingDomNode(newCurrentNode, this.get('richNode'));
      this.get('rawEditor').setCurrentPosition(get(richNode, 'start'));
      return HandlerResponse.create({allowPropagation: false});
    }
  },

  /**
   * @method relevantNodeForEnter
   * @param {RichNode} richnode
   * @private
   */
  relevantNodeForEnter(node) {
    while(! isDisplayedAsBlock(get(node,'domNode')) && ! this.get('rootNode').isSameNode(get(node, 'domNode'))) {
      node = get(node, 'parent');
    }
    return node;
  },

  /**
   * @method lisIsEmpty
   * @param {RichNode} node
   * @private
   */
  liIsEmpty(node) {
    let re = new RegExp(invisibleSpace,"g");
    return isBlank(get(node, 'domNode').textContent.replace(re, ''));
  },

  /**
   * @method insertEnterInLi
   * @param {RichNode} node
   * @param {RichNode} nodeForEnter
   * @param {number} currentPosition
   * @param {DOMNode} currentNode
   * @private
   */
  insertEnterInLi(node, nodeForEnter, currentPosition/*, currentNode*/) {
    // it's an li
    let ulOrOl = get(nodeForEnter, 'parent');
    let domNode = get(ulOrOl, 'domNode');
    let liDomNode = get(nodeForEnter, 'domNode');
    let parentOfUl = get(ulOrOl, 'parent.domNode');
    let textNode;
    if (this.liIsEmpty(nodeForEnter)) {
      // remove li
      let after = liDomNode.nextElementSibling === null;
      domNode.removeChild(liDomNode);
      textNode = insertTextNodeWithSpace(parentOfUl, domNode, after);
      if (isEmptyList(domNode))
        parentOfUl.removeChild(domNode);
      this.set('currentNode', textNode);
    }
    else if (currentPosition === get(nodeForEnter, 'start')) {
      // insert li before li
      let newElement = document.createElement('li');
      domNode.insertBefore(newElement,liDomNode);
      textNode = insertTextNodeWithSpace(newElement);
      this.set('currentNode', textNode);
    }
    else {
      // insert li after li
      let newElement = document.createElement('li');
      insertNodeBAfterNodeA(domNode, liDomNode, newElement);
      textNode = insertTextNodeWithSpace(newElement);
      this.set('currentNode', textNode);
    }
    this.get('rawEditor').updateRichNode();
    let richNode = getRichNodeMatchingDomNode(textNode, this.get('richNode'));
    this.get('rawEditor').setCurrentPosition(get(richNode, 'start'));
  }
});
