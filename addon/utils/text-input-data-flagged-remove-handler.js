import EmberObject from '@ember/object';
import { invisibleSpace } from './dom-helpers';
import { reads } from '@ember/object/computed';
import { get } from '@ember/object';
import HandlerResponse from './handler-response';
import getRichNodeMatchingDomNode from './get-rich-node-matching-dom-node';

const supportedInputCharacters = /[a-zA-Z0-9.,!@#$%^&*={};'"+-?_()/\\ ]/;

export default EmberObject.extend({
  rootNode: reads('rawEditor.rootNode'),
  currentSelection: reads('rawEditor.currentSelection'),
  richNode: reads('rawEditor.richNode'),
  currentNode: reads('rawEditor.currentNode'),
  currentSelectionIsACursor: reads('rawEditor.currentSelectionIsACursor'),

  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event){
    if (event.type !== "keydown") return false;
    let inp = event.key;
    let isKnownInput = ( this.get('currentSelectionIsACursor') || this.aSelectionWeUnderstand() ) &&
        inp.length === 1 && ! event.ctrlKey && !event.altKey && supportedInputCharacters.test(inp);
    return isKnownInput && this.get('currentNode') && this.isFlaggedRemove(this.get('currentNode'));
  },

  handleEvent(){
    //this is the span
    let response = HandlerResponse.create();
    let span  = this.get('currentNode').parentNode;

    //it is not user friendly when it disappaers on first char.
    if(span.textContent && span.textContent.length < 3){
      span.setAttribute('data-flagged-remove', 'almost-complete');
      return response;
    }

    let parent = span.parentNode;
    let newTextNode = document.createTextNode(span.textContent);

    //We expect the backspace handler to add some invisible space to trick browsers.
    newTextNode.textContent = newTextNode.textContent.replace(invisibleSpace, '');

    parent.insertBefore(newTextNode, span);
    parent.removeChild(span);
    this.get('rawEditor').updateRichNode();
    this.get('rawEditor').set('currentNode', newTextNode);
    let richNode = getRichNodeMatchingDomNode(newTextNode, this.get('richNode'));
    this.get('rawEditor').setCurrentPosition(richNode.end);

    return response;
  },

  isFlaggedRemove(domNode){
    let parent = domNode.parentNode;
    return parent && parent.getAttribute('data-flagged-remove');
  },

  aSelectionWeUnderstand() {
    let windowSelection = window.getSelection();
    if (windowSelection.rangeCount === 0)
      return false;
    let range = windowSelection.getRangeAt(0);
    if (this.get('rootNode').contains(range.commonAncestorContainer)) {
      let startNode = this.get('rawEditor').getRichNodeFor(range.startContainer);
      let endNode = this.get('rawEditor').getRichNodeFor(range.endContainer);
      if (startNode && startNode === endNode && get(startNode,'type') === 'text')
        return true;
    }
    return false;
  }

});
