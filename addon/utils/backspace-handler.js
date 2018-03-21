import { invisibleSpace, isVoidElement } from './dom-helpers';
import EmberObject from '@ember/object';
import { reads } from '@ember/object/computed';
import HandlerResponse from './handler-response';
import { get } from '@ember/object';
import getRichNodeMatchingDomNode from './get-rich-node-matching-dom-node';
import NodeWalker from './node-walker';
import { isRdfaNode } from './rdfa-rich-node-helpers';

export default EmberObject.extend({
  rootNode: reads('rawEditor.rootNode'),
  currentSelection: reads('rawEditor.currentSelection'),
  richNode: reads('rawEditor.richNode'),

  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event){
    return event.type === "keydown" && event.key === 'Backspace' && this.get('rawEditor.currentSelectionIsACursor');
  },

  /**
   * tests this handler can handle the specified event
   * @method handleEvent
   * @return {Object} HandlerResponse.create({allowPropagation: false})
   * @public
   */
  handleEvent(){
    let position = this.get('currentSelection')[0];
    let richNode = this.getMatchingRichNode(position);
    let textNode = this.getMatchingDomNode(richNode);

    this.set('rawEditor.currentNode', textNode);

    //enter relative space
    let relPosition = this.absoluteToRelativePosition(richNode, position);

    //the string provided by DOM does not match what is rendered on screen. Basically, a bunch of invisible chars should be removed.
    let preProcessedDomAndPosition = this.textNodeAndCursorPositionToRendered(textNode, relPosition);

    //effective backspace handling, i.e. what user expects to see when pressing backspace
    let processedDomAndPosition = this.removeCharToLeftAndUpdatePosition(preProcessedDomAndPosition.textNode, preProcessedDomAndPosition.position);

    let postProcessedDomAndPosition = this.postProcessTextNode(processedDomAndPosition.textNode, processedDomAndPosition.position);

    //now some custom DOM tree manipulation which should be somehow be extracted

    // if 2 chars left of a text node richt after A RDFANode should be flagged
    if(this.isAlmostEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(textNode)){
      let newNode = this.setDataFlaggedForNode(postProcessedDomAndPosition.textNode);
      this.get('rawEditor').updateRichNode();
      let newRichNode = getRichNodeMatchingDomNode(newNode, this.get('richNode'));
      this.set('rawEditor.currentNode', newRichNode.domNode);
      this.get('rawEditor').setCurrentPosition(newRichNode.end);
    }

    //if empty text node, we start cleaning the DOM tree (with specific RDFA flow in mind)
    else if(this.isEmptyTextNode(postProcessedDomAndPosition.textNode)){
      let newNode = this.rdfaDomCleanUp(postProcessedDomAndPosition.textNode);
      this.get('rawEditor').updateRichNode();
      let newRichNode = getRichNodeMatchingDomNode(newNode, this.get('richNode'));
      this.set('rawEditor.currentNode', newRichNode.domNode);
      this.get('rawEditor').setCurrentPosition(newRichNode.end);
    }

    else {
      //else we update position and update current position
      this.get('rawEditor').updateRichNode();
      let newAbsolutePosition = this.relativeToAbsolutePosition(richNode, postProcessedDomAndPosition.position);
      this.set('rawEditor.currentNode', postProcessedDomAndPosition.textNode);
      this.get('rawEditor').setCurrentPosition(newAbsolutePosition);

      //TODO: is it possible that we end up in an empty text node?
     }

    return HandlerResponse.create({allowPropagation: false});
  },

  /**
   * gets matching richnode (expects to find textNode else throws exception)
   * @method getMatchingRichNode
   * @param {Int} position
   * @return {RichNode}
   * @private
   */
  getMatchingRichNode(position){
    let parentNode = this.get('rawEditor').findSuitableNodeForPosition(position - 1); //TODO: why -1 ?
    let type = get(parentNode, 'type');
    if(type !== 'text'){
      throw new Error(`Expected node at ${position} to be text, got ${type}`);
    }
    return parentNode;
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
    return position - get(richNode, 'start');
  },

  /**
   * returns domNode from RichNode
   * @method getMatchingDomNode
   * @param {Object} richNode
   * @return {DomNode}
   * @private
   */
  getMatchingDomNode(richNode){
    return get(richNode, 'domNode');
  },

  /**
   * strip/cleaning logic to matc string to what is rendered in browser. Will strip characters. Will move cursor accordingly.
   * @method textNodeAndCursorPosutionToRendered
   * @param {DomNode} textNode
   * @param {Int} position
   * @return {Object} {textNode, position}
   * @private
   */
  textNodeAndCursorPositionToRendered(textNode, position){
    let stringToUpdate = textNode.textContent.slice(0, position);
    let strippedString = this.stripIrrelevantCharsBeforeCursor(stringToUpdate);
    let preProcessedPosition = position - (stringToUpdate.length - strippedString.length);
    textNode.textContent = textNode.textContent.slice(0, preProcessedPosition) + textNode.textContent.slice(position);
    return {textNode, position: preProcessedPosition};
  },

  /**
   * effective removal of one char from position of cursor. Updates cursor position too.
   * @method absoluteToRelativePostion
   * @param {DomNode} textNode
   * @param {Int} position
   * @return {Object} {textNode, position}
   * @private
   */
  removeCharToLeftAndUpdatePosition(textNode, position){
    let text = textNode.textContent;
    let updatedText = text.slice(0, position - 1) + text.slice(position);
    textNode.textContent = updatedText;
    return {textNode, position: position - 1};
  },

  /**
   * TODO: there is still a bug with this!
   * general postprocessing of the node
   * For now we want to avoid the situation <p>text [CURSOR]</p>.
   * This will make cursor jump to the 't'. So we remap to  <p>text&nbsp;[CURSOR]</p>.
   * @method postProcessTextNode
   * @param {DomNode} textNode
   * @param {Int} position
   * @return {Object} {textNode, position}
   * @private
   */
  postProcessTextNode(textNode, position){
    //lets make sure text node ends with &nbsp; if the cursor position is at the end
    //-> else cursor jumps over other space types if at the end of a DOM Element.
    if(position !== textNode.textContent.length - 1){
      return {textNode, position};
    }

    let lastChar = textNode.textContent.slice(-1);
    if(/\s/.test(lastChar)){
      textNode.textContent = textNode.textContent.slice(0, -1) + '\u00A0';
    }
    return {textNode, position};
  },

  /**
   * maps relative cursor position into absolute in text.
   * @method relativeToAbsolutePosition
   * @param {DomNode} textNode
   * @param {Int} position
   * @return {Int}
   * @private
   */
  relativeToAbsolutePosition(richNode, position){
    return position + get(richNode, 'start');
  },

  /**
   * cleans up DOM when pressing backspace and being in an empty node. Takes into account some side RDFA conditions.
   * @method rdfaDomCleanUp
   * @param {DomNode} textNode
   * @return {DomNode} domNode we will use to provide position
   * @private
   */
  rdfaDomCleanUp(domNode){
    let isEmptyRdfaOrEmptyTextNode = node => {
      return this.isParentFlaggedForAlmostRemoval(node) ||
        this.isEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(node) ||
        this.isTextNodeWithContent(node);
    };
    let matchingDomNode = this.cleanLeavesToLeftUntil(isEmptyRdfaOrEmptyTextNode, this.isVoidRdfaElementAndHasNextSibling.bind(this), domNode);

    if(this.isParentFlaggedForAlmostRemoval(matchingDomNode) || this.isEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(matchingDomNode)){
      matchingDomNode = this.setDataFlaggedForNode(matchingDomNode);
    }

    return matchingDomNode;
  },

  /**
   * cleans leaf nodes from left to right until condition is met or rootNode editor is hit
   * @method cleanDomToLeftUntil
   * @param {DOMEvent} event
   * @param {Bool} visitLastChild first
   * @return {DomNode} the node matching the predicate
   * @private
   */
  cleanLeavesToLeftUntil(predicate, isExceptionLeaf, node, visitLastChildFirst = false){
    let prevSibling = node.previousSibling;
    let parent = node.parentNode;

    //if we hit root of editor: we just return
    if(node.isSameNode(this.get('rootNode'))){
      return node;
    }

    if(predicate(node)){
      return node;
    }

    if((!node.childNodes || node.childNodes.length === 0) && !isExceptionLeaf(node)){
      parent.removeChild(node);
    }

    if(visitLastChildFirst && node.childNodes && node.childNodes.length > 0){
      return this.cleanLeavesToLeftUntil(predicate, isExceptionLeaf,  node.lastChild, true);
    }

    if(prevSibling){
      return this.cleanLeavesToLeftUntil(predicate, isExceptionLeaf, prevSibling, true);
    }

    return this.cleanLeavesToLeftUntil(predicate, isExceptionLeaf, parent);
  },

  /**
   * Basically we want to flag text nodes, almost empty (but not empty) which are first child of RDFA node
   * e.g.
   * <h1 property="eli:title">Me</h1> will return true
   * <h1 property="eli:title" data-flagged-remove='almost-complete'>Me</h1> will return false
   * @method isAlmostEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isAlmostEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(node){
    return this.isAlmostEmptyFirstChildFromRdfaNode(node) && !node.parentNode.getAttribute('data-flagged-remove');
  },

  /**
   * e.g.
   * <h1 property="eli:title">[EMPTY TEXTNODE]</h1> will return true
   * <h1 property="eli:title">[A NODE][EMPTY TEXTNODE]</h1> will return false
   * @method isEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(node){
    return !node.parentNode.getAttribute('data-flagged-remove') && this.isNodeFirstBornRdfaNode(node) && this.isEmptyTextNode(node);
  },

  /**
   * e.g.
   * <div> <meta property="eli:title"/>[SOME NODES] </div> will return true
   * <div>[SOME NODES] <meta property="eli:title"/> </div> will return false
   * @method isVoidRdfaElementAndHasNextSibling
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isVoidRdfaElementAndHasNextSibling(node){
    return this.isRdfaNode(node) && isVoidElement(node) && node.nextSibling;
  },

  /**
   * returns true if parent if flagged for removal
   * @method isParentFlaggedForAlmostRemoval
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isParentFlaggedForAlmostRemoval(node){
    return node.parentNode.getAttribute('data-flagged-remove') === 'almost-complete';
  },

  /**
   * e.g
   * <h1 property="eli:title">Me</h1> will return true
   * <h1 property="eli:title"></h1> will return false
   * <h1 property="eli:title">Felix</h1> will return false
   * see implementation for length treshold
   * @method isAlmostEmptyFirstChildFromRdfaNode
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isAlmostEmptyFirstChildFromRdfaNode(node){
    let isFirstChild = this.isNodeFirstBornRdfaNode(node);
    return node.nodeType === Node.TEXT_NODE && node.textContent.trim().length < 3 && !this.isEmptyTextNode(node) && isFirstChild;
  },

  /**
   * <h1 property="eli:title">[NODE_TO_CHECK]</h1> will return true
   * <h1 property="eli:title">[SOME OTHER NODES][NODE_TO_CHECK]</h1> returns false
   * @method isNodeFirstBornRdfaNode
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isNodeFirstBornRdfaNode(node){
    let isParentRdfaNode = this.isRdfaNode(node.parentNode);
    let firstChild = node.parentNode.firstChild.isSameNode(node);
    return firstChild && isParentRdfaNode;
  },

  /**
   * returns true if rdfa node
   * @method isRdfaNode
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isRdfaNode(node){
    let nodeWalker = NodeWalker.create();
    return isRdfaNode(nodeWalker.processDomNode(node));
  },

  /**
   * an emtpy text node ONLY contains invisible whitespaces
   * @method isEmptyTextNode
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isEmptyTextNode(node){
    //see also https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Whitespace_in_the_DOM
    let invisibleSpacesExceptNbsp = /[^\t\n\r \u200B]/;
    return node.nodeType === Node.TEXT_NODE && !(invisibleSpacesExceptNbsp.test(node.textContent));
  },

  /**
   * a text node with content (but no invisible white space)
   * @method isTextNodeWithContent
   * @param {DomNode} textNode
   * @return {Bool}
   * @private
   */
  isTextNodeWithContent(node){
    return node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0 && !/\u200B/.test(node.textContent.trim());
  },

  /**
   * the set data flag is handled here.
   * @method setDataFlaggedForNode
   * @param {DomNode} textNode
   * @return {DomNode} span with flag on
   * @private
   */
  setDataFlaggedForNode(node){
    let spanContent = document.createTextNode(invisibleSpace);
    let span;
    if(this.isAlmostEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(node)){
      let parent = node.parentNode;
      span = document.createElement('span');
      spanContent.textContent = node.textContent;
      span.setAttribute('data-flagged-remove', 'almost-complete');
      span.appendChild(spanContent);
      parent.insertBefore(span, node);
      this.get('rawEditor').set('currentNode', spanContent);
      parent.removeChild(node);
      return span;
    }
    else if(this.isParentFlaggedForAlmostRemoval(node)){
      span = node.parentNode;
      span.insertBefore(spanContent, node);
      span.setAttribute('data-flagged-remove', 'complete');
      this.get('rawEditor').set('currentNode', spanContent);
      span.removeChild(node);
      return span;
    }
    else if(this.isEmptyFirstChildFromRdfaNodeAndNotFlaggedForRemoval(node)){
      let parent = node.parentNode;
      span = document.createElement('span');
      span.setAttribute('data-flagged-remove', 'complete');
      span.appendChild(spanContent);
      parent.insertBefore(span, node);
      this.get('rawEditor').set('currentNode', spanContent);
      parent.removeChild(node);
      return span;
    }
  },

  /**
   * strips irrelevant chars
   * @method stripIrrelevantCharsBeforeCursor
   * @param {string} string
   * @return {string} string
   * @private
   */
  stripIrrelevantCharsBeforeCursor(string){
    if(string.length == 1){
      return string;
    }

    let lastTwoChars = string.slice(-2, string.length);

    //tests (char)(visible space) or (&nbsp;)(visible space)
    if(/\S\u0020/.test(lastTwoChars) || /\u00A0\u0020/.test(lastTwoChars)){
      return string;
    }
    let lastChar = string.slice(-1);

    //&nbsp;
    if(/\u00A0/.test(lastChar)){
      return string;
    }

    //any other white space will be stripped (and invisible space too)
    if(/\s/.test(lastChar) || /\u200B/.test(lastChar)){
      return this.stripIrrelevantCharsBeforeCursor(string.slice(0, -1));
    }
    return string;
  }

});
