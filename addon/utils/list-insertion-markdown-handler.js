import EmberObject from '@ember/object';
import { reads, alias } from '@ember/object/computed';
import getRichNodeMatchingDomNode from './get-rich-node-matching-dom-node';
import { get } from '@ember/object';
import { isBlank } from '@ember/utils';
import HandlerResponse from './handler-response';
import { invisibleSpace } from './dom-helpers';


let OLMARKDOWN = /(1\.\s)(.*)/;
let ULMARKDOWN = /(\*\.\s)(.*)/;

let MARKDOWNS = [
  {pattern: OLMARKDOWN, tag: 'ol'},
  {pattern: ULMARKDOWN, tag: 'ul'},
];

/**
 * handles new creation markdown
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

  nodeContainsRelevantMarkdown(node){
    if(!node.nodeType === Node.TEXT_NODE)
      return false;
    return this.findMarkdown(node.textContent);
  },

  findMarkdown(text){
    return MARKDOWNS.find(m => { return text.match(m.pattern); });
  },

  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event) {
    return event.type === 'keydown' &&
      this.get('rawEditor.currentSelectionIsACursor') &&
      event.key == 'Enter' &&
      this.nodeContainsRelevantMarkdown(this.get('currentNode'));
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
    let newCurrentNode;

    let markdown = this.findMarkdown(currentNode.textContent).pattern;

    let insertElement = () => {
      let matchGroups = currentNode.textContent.match(markdown);
      let beforeContent = currentNode.textContent.slice(0, matchGroups.index);
      let beforeContentNode = document.createTextNode(beforeContent);
      let elementContent = matchGroups[2];

      let contentTextNode = document.createTextNode(this.isVisiblyEmptyString(elementContent) ? invisibleSpace: elementContent);
      let listNode = document.createElement(this.findMarkdown(currentNode.textContent).tag);

      //insert the node with content
      let liNode = document.createElement('li');
      liNode.append(contentTextNode);
      listNode.append(liNode);

      let liNodeForCursor = liNode;
      if(!this.isVisiblyEmptyString(elementContent)) {
        //add a second li, because it feels as expected behaviour for user
        liNodeForCursor = document.createElement('li');
        liNodeForCursor.append(document.createTextNode(invisibleSpace));
        listNode.append(liNodeForCursor);
      }

      //TODO: is this required?
      if(!isBlank(beforeContent))
        currentNode.parentNode.insertBefore(beforeContentNode, currentNode);
      currentNode.parentNode.insertBefore(listNode, currentNode);
      currentNode.parentNode.insertBefore(document.createTextNode(invisibleSpace), currentNode);
      currentNode.parentNode.removeChild(currentNode);
      newCurrentNode = liNodeForCursor;
    };

    this.get('rawEditor').externalDomUpdate('inserting markdown', insertElement);
    this.get('rawEditor').updateRichNode();
    let richNode = getRichNodeMatchingDomNode(newCurrentNode, this.get('richNode'));
    this.get('rawEditor').setCurrentPosition(get(richNode, 'start'));
    return HandlerResponse.create({allowPropagation: false});
  },

  isVisiblyEmptyString(string_instance){
    return string_instance.length === 0 || (new RegExp( '^' + invisibleSpace + '+$')).test(string_instance);
  }


});
