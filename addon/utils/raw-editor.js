import {
  isDisplayedAsBlock,
  invisibleSpace,
  insertTextNodeWithSpace,
  insertNodeBAfterNodeA,
  sliceTextIntoTextNode,
  removeNode,
  isVoidElement,
  isIgnorableElement,
  tagName,
  createElementsFromHTML
} from './dom-helpers';
import getRichNodeMatchingDomNode from './get-rich-node-matching-dom-node';
import CappedHistory from './capped-history';
import forgivingAction from './forgiving-action';
import EmberObject from '@ember/object';
import replaceTextWithHtml from './replace-text-with-html';
import flatMap from './flat-map';
import { walk as walkDomNode } from '@lblod/marawa/node-walker';
import { analyse as scanContexts } from '@lblod/marawa/rdfa-context-scanner';
import RichNode from '@lblod/marawa/rich-node';
import { processDomNode as walkDomNodeAsText } from './text-node-walker';
import previousTextNode from './previous-text-node';
import { getTextContent } from './text-node-walker';
import { debug, warn } from '@ember/debug';
import { get, computed } from '@ember/object';
import { A } from '@ember/array';
import DiffMatchPatch from 'diff-match-patch';
import { task, timeout } from 'ember-concurrency';
import nextTextNode from './next-text-node';
const HIGHLIGHT_DATA_ATTRIBUTE = 'data-editor-highlight';
const NON_BREAKING_SPACE = '\u00A0';


/* IE11 and safari polyfill from MDN */
function ReplaceWithPolyfill() {
  'use-strict'; // For safari, and IE > 10
  var parent = this.parentNode, i = arguments.length, currentNode;
  if (!parent) return;
  if (!i) // if there are no arguments
    parent.removeChild(this);
  while (i--) { // i-- decrements i and returns the value of i before the decrement
    currentNode = arguments[i];
    if (typeof currentNode !== 'object'){
      currentNode = this.ownerDocument.createTextNode(currentNode);
    } else if (currentNode.parentNode){
      currentNode.parentNode.removeChild(currentNode);
    }
    // the value of "i" below is after the decrement
    if (!i) // if currentNode is the first argument (currentNode === arguments[0])
      parent.replaceChild(currentNode, this);
    else // if currentNode isn't the first
      parent.insertBefore(this.previousSibling, currentNode);
  }
}
if (!Element.prototype.replaceWith)
    Element.prototype.replaceWith = ReplaceWithPolyfill;
if (!CharacterData.prototype.replaceWith)
    CharacterData.prototype.replaceWith = ReplaceWithPolyfill;
if (!DocumentType.prototype.replaceWith)
  DocumentType.prototype.replaceWith = ReplaceWithPolyfill;
/* IE11 and safari polyfill */



function findNodesToHighlight( node, start, end ){
  // We need to highlight all portions of text based on the output
  // contained in them.  We can split the important nodes in three
  // pieces:
  //
  // - start: text nodes which contain partial content to highlight
  // - middle: rich nodes which need to be fully highlighted
  // - end: trailing text nodes which contain partial content to
  //     highlight
  //
  // Detecting this range is tricky

  if( node.start > end || node.end < start )
    // out of range
    return [];
  else if( node.start === start && node.end === end )
    // exact range
    return [node];
  else {
    // partial range
    if( node.type === "tag" ){
      // partial tag walks children
      return node.children // accept br tags etc
        && node.children.flatMap( (child) => findNodesToHighlight( child, start, end ) );
    } else if( node.type === "text" ){
      // partial text returns itself
      return [node];
    } else {
      // other nodes are ignored
      return [];
    }
  }
}

function rawHighlightRegionInNode( node, start, end ) {
  // Next we need to ensure all the highlights are placed in the
  // right spot.  This means finding all the "Phrasing content"
  // https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/Content_categories#Phrasing_content
  // and adding marks around that if the content is not already
  // inside of a mark.

  if( node.type === "tag" ){
    // make sure the data attribute is set
    if( node.start < start || node.end > end ){
      warn( "rawHighlightRegionInNode does not support partial highlighting of nodes" );
    } else {
      node.domNode.setAttribute(HIGHLIGHT_DATA_ATTRIBUTE, 'true');
    }
  } else if( node.type === "text" ) {
    // split into marks and add data attribute
    // we know the text length will not change in this case so we can replace in place.
    const relativeStart = Math.max(start - node.start, 0);
    const relativeEnd = Math.min(end - node.start, node.text.length);
    const [preText, infixText, postText] =
          [ node.text.slice( 0, relativeStart ),
            node.text.slice( relativeStart, relativeEnd ),
            node.text.slice( relativeEnd ) ];

    const prefixNode = preText == "" ? null : document.createTextNode( preText );
    const infixNode = document.createElement('mark');
    const infixTextNode = document.createTextNode( infixText );
    infixNode.appendChild( infixTextNode );
    infixNode.setAttribute(HIGHLIGHT_DATA_ATTRIBUTE, 'true');
    const postfixNode = postText == "" ? null : document.createTextNode( postText );
    const newDomNodes = [prefixNode,infixNode,postfixNode].filter( (x) => x );

    // TODO: we shouldn't be creating these manually, we should trigger some
    // NodeWalker version.
    const preRichNode = ! prefixNode ? null : new RichNode({
      domNode: prefixNode,
      parent: node.parent,
      start: node.start,
      end: start,
      text: preText,
      type: "text"
    });
    const infixRichNode = ! infixNode ? null : new RichNode({
      domNode: infixNode,
      parent: node.parent,
      start: start,
      end: end,
      text: infixText,
      type: "tag"
    });
    infixRichNode.children = [ new RichNode({
      domNode: infixTextNode,
      parent: infixRichNode,
      start: start,
      end: end,
      text: infixText, // TODO: remove if consuming code doesn't use the TextNodeWalker
      type: "text"
    }) ];
    const postfixRichNode = ! postfixNode ? null : new RichNode({
      domNode: postfixNode,
      parent: node.parent,
      start: end,
      end: end + postText.length,
      text: postText,
      type: "text"
    });
    const newRichNodes = [];
    if( preRichNode ) { newRichNodes.push( preRichNode ); }
    newRichNodes.push( infixRichNode );
    if( postfixRichNode ) { newRichNodes.push( postfixRichNode ); }

    // update the DOM tree
    node.domNode.replaceWith( ...newDomNodes );
    // update the richNode tree
    const parent = node.parent;
    parent.children.splice( parent.children.indexOf( node ), 1, ...newRichNodes );
  } else {
    warn( "raw highlighting can only occur on text nodes or on tag nodes" );
  }
}

/**
 * raw contenteditable editor, a utility class that shields editor internals from consuming applications.
 *
 * @module contenteditable-editor
 * @class RawEditor
 * @constructor
 * @extends EmberObject
 */
const RawEditor = EmberObject.extend({
  /**
   * root node of the editor
   * @property rootNode
   * @type DOMNode
   * @public
   */
  rootNode: null,

  /**
   * richNode, a rich representation of the dom tree created with NodeWalker
   * @property richNode
   * @type RichNode
   * @public
   */
  richNode: null,

  /**
   * the current selection in the editor
   * @property currentSelection
   * @type Array
   * @public
   *
   * NOTE: don't change this in place
   */
  currentSelection: null,

  /**
   * the start of the current range
   *
   * NOTE: this is correctly bound because currentSelection is never
   * changed in place
   */
  currentPosition: computed( 'currentSelection', function() {
    return this.currentSelection[0];
  }),

  /**
   * the domNode containing our caret
   * @property currentNode
   * @type DomNode
   * @public
   */
  currentNode: null,

  /**
   * current textContent from editor
   *
   * @property currentTextContent
   * @type String
   * @public
   */
  currentTextContent: null,

  /**
   * components present in the editor
   * @property components
   * @type {Object}
   * @public
   */
  components: null,

  /**
   * is current selection a cursor
   * @property currentSelectionIsACursor
   * @type boolean
   * @public
   */
  currentSelectionIsACursor: computed('currentSelection', function() {
    let sel = this.currentSelection;
    return sel[0] === sel[1];
  }),

  init() {
    this.set('history', CappedHistory.create({ maxItems: 100}));
    this.set('components', A());
  },

  /**
   *
   * @method replaceTextWithHTML
   * @param {Number} start index absolute
   * @param {Number} end index absolute
   * @param {String} html string
   * @param {Array} Optional extra info, which will be passed around when triggering update events.
   * @public
   */
  replaceTextWithHTML(start, end, html, extraInfo = []) {
    this.createSnapshot();
    let newNodes = replaceTextWithHtml(this.richNode, start, end, html);
    let contentLength = newNodes.map( node => getTextContent(node).length).reduce( (total, i) => total + i);
    var nextSibling = newNodes[newNodes.length-1].nextSibling;
    if (nextSibling === null || nextSibling.nodeType !== Node.TEXT_NODE) {
      nextSibling = document.createTextNode(invisibleSpace);
      insertNodeBAfterNodeA(newNodes[0].parentNode, newNodes[newNodes.length-1], nextSibling);
    }
    this.updateRichNode();
    this.set('currentNode', nextSibling );
    this.setCurrentPosition(start + contentLength);
    this.generateDiffEvents.perform(extraInfo);
    forgivingAction('elementUpdate', this)();
    return newNodes;
  },

  /**
   * replaces dom node with html string.
   * @method replaceNodeWithHTML
   * @param {Object} DomNode to work on
   * @param {Object} string containing html
   * @param {Boolean} instructive to place cursor after inserted HTML,
   * @param {Array} Optional extra info, which will be passed around when triggering update events.
   *
   * @return returns inserted domNodes (with possibly an extra trailing textNode).
   * @public
   */
  replaceNodeWithHTML(node, html, placeCursorAfterInsertedHtml = false, extraInfo = []){
    //TODO: make sure the elements to insert are non empty when not allowed, e.g. <div></div>
    //TODO: think: what if htmlstring is "<div>foo</div><div>bar</div>" -> do we need to force a textnode in between?

    //keeps track of current node.
    let getCurrentCarretPosition = this.getRelativeCursorPosition();
    let currentNode = this.currentNode;

    let keepCurrentPosition = !placeCursorAfterInsertedHtml && !node.isSameNode(currentNode) && !node.contains(currentNode);

    if(!placeCursorAfterInsertedHtml && (node.isSameNode(currentNode) || node.contains(currentNode)))
      warn(`Current node is same or contained by node to replace. Current node will change.`,
           {id: 'contenteditable.replaceNodeWithHTML.currentNodeReplace'});

    //find rich node matching dom node
    let richNode = this.getRichNodeFor(node);
    if(!richNode) return null;

    let richParent = richNode.parent;
    if (!richParent) return null;

    //insert new nodes first
    let domNodesToInsert = createElementsFromHTML(html);

    let lastInsertedRichElement = this.insertElementsAfterRichNode(richParent, richNode, domNodesToInsert);
    lastInsertedRichElement = this.insertValidCursorNodeAfterRichNode(richParent, lastInsertedRichElement);

    // proceed with removal
    removeNode(richNode.domNode);

    //update editor state
    const textNodeAfterInsert = !keepCurrentPosition ? nextTextNode(lastInsertedRichElement.domNode) : null;
    this.updateRichNode();
    this.generateDiffEvents.perform(extraInfo);
    if(keepCurrentPosition) {
      this.setCarret(currentNode, getCurrentCarretPosition);
    }
    else {
      this.setCarret(textNodeAfterInsert,0);
    }
    if(lastInsertedRichElement.domNode.isSameNode(domNodesToInsert.slice(-1)[0]))
      return domNodesToInsert;
    return [...domNodesToInsert, lastInsertedRichElement.domNode];
  },

  /**
   * removes a node. If node to be removed is contains current cursor position. The cursor
   * position will be update to a previous sensible node too.
   * @method removeNode
   * @param {Object} DomNode to work on
   * @param {Array} Optional extra info, which will be passed around when triggering update events.
   *
   * @return returns node we ended up in.
   * @public
   */
  removeNode(node, extraInfo = []){
    //keeps track of current node.
    let carretPositionToEndIn = this.getRelativeCursorPosition();
    let nodeToEndIn = this.currentNode;
    let keepCurrentPosition = !node.isSameNode(nodeToEndIn) && !node.contains(nodeToEndIn);

    if(!keepCurrentPosition){
      nodeToEndIn = previousTextNode(node, this.rootNode);
      carretPositionToEndIn = nodeToEndIn.length;
    }

    //find rich node matching dom node
    let richNode = this.getRichNodeFor(node);
    if(!richNode) return null;

    // proceed with removal
    removeNode(richNode.domNode);

    this.updateRichNode();
    this.generateDiffEvents.perform(extraInfo);

    this.setCarret(nodeToEndIn, carretPositionToEndIn);

    return nodeToEndIn;
  },

  /**
   * Prepends the children of a node with an html block
   * @method prependChildrenHTML
   * @param {Object} DomNode to work on
   * @param {Object} string containing html
   * @param {Boolean} instructive to place cursor after inserted HTML,
   * @param {Array} Optional extra info, which will be passed around when triggering update events.
   *
   * @return returns inserted domNodes (with possibly an extra trailing textNode).
   * @public
   */
  prependChildrenHTML(node, html, placeCursorAfterInsertedHtml = false, extraInfo = []){
    //TODO: check if node allowed children?
    let getCurrentCarretPosition = this.getRelativeCursorPosition();
    let currentNode = this.currentNode;

    let keepCurrentPosition = !placeCursorAfterInsertedHtml;

    //find rich node matching dom node
    let richParent = this.getRichNodeFor(node);
    if(!richParent) return null;

    //insert new nodes first
    let domNodesToInsert = createElementsFromHTML(html);

    if (domNodesToInsert.length == 0)
      return [ node ];

    let lastInsertedRichElement = this.prependElementsRichNode(richParent, domNodesToInsert);
    lastInsertedRichElement = this.insertValidCursorNodeAfterRichNode(richParent, lastInsertedRichElement);

    //update editor state
    const textNodeAfterInsert = !keepCurrentPosition ? nextTextNode(lastInsertedRichElement.domNode) : null;
    this.updateRichNode();
    this.generateDiffEvents.perform(extraInfo);
    if(keepCurrentPosition) {
      this.setCarret(currentNode, getCurrentCarretPosition);
    }
    else {
      this.setCarret(textNodeAfterInsert,0);
    }

    if(lastInsertedRichElement.domNode.isSameNode(domNodesToInsert.slice(-1)[0]))
      return domNodesToInsert;
    return [...domNodesToInsert, lastInsertedRichElement.domNode];
  },

  /**
   * inserts an emtpy textnode after richnode, if non existant.
   *
   * @method insertElementsAfterRichNode
   *
   * @param {RichNode} parent element where the elements should be added.
   * @param {RichNode} last sibling where new elements should occur after
   * @param {Array} array of (DOM) elements to insert
   *
   * @return {RichNode} returns last inserted element as RichNode. That is a rich textNode
   * @private
   */
  insertValidCursorNodeAfterRichNode(richParent, richNode){
    if (richNode.domNode.nextSibling === null || richNode.domNode.nextSibling.nodeType !== Node.TEXT_NODE) {
      let newNode = document.createTextNode(invisibleSpace);
      return this.insertElementsAfterRichNode(richParent, richNode, [newNode]);
    }
    return walkDomNodeAsText(richNode.domNode.nextSibling, richParent.domNode, richNode.end);
  },

  /**
   * Prepends a list of elements to children
   *
   * @method prependElementsRichNode
   *
   * @param {RichNode} parent element where the elements should be added.
   * @param {Array} array of (DOM) elements to insert
   *
   * @return {RichNode} returns last inserted element as RichNode
   * @private
   */
  prependElementsRichNode(richParent, elements){
    let newFirstChild = elements[0];
    if(richParent.domNode.firstChild)
      richParent.domNode.insertBefore(newFirstChild, richParent.domNode.firstChild);
    else
      richParent.domNode.appendChild(newFirstChild);

    let newFirstRichChild = walkDomNodeAsText(newFirstChild, richParent.domNode, richParent.start);
    return this.insertElementsAfterRichNode(richParent, newFirstRichChild, elements.slice(1));
  },

  /**
   * Inserts an array of elements into the editor.
   *
   * @method insertElementsAfterRichNode
   *
   * @param {RichNode} parent element where the elements should be added.
   * @param {RichNode} last sibling where new elements should occur after
   * @param {Array} array of (DOM) elements to insert
   *
   * @return {RichNode} returns last inserted element as RichNode
   * @private
   */
  insertElementsAfterRichNode(richParent, richNode, remainingElements){
    if( remainingElements.length == 0 )
      return richNode;

    let nodeToInsert = remainingElements[0];

    insertNodeBAfterNodeA(richParent.domNode, richNode.domNode, nodeToInsert);

    let richNodeToInsert = walkDomNodeAsText(nodeToInsert, richParent.domNode, richNode.end);

    return this.insertElementsAfterRichNode(richParent, richNodeToInsert, remainingElements.slice(1));
  },

  /**
   * Higlight a section of the editor text
   *
   * @method highlightRange
   *
   * @param {number} start Start of the region
   * @param {number} end End of the region
   * @param {Object} data map of data to be included on the highlight, can be used to add rdfa or data- attributes
   * @public
   */
  highlightRange(start, end, data = {}) {
    if( data && Object.entries(data).length != 0 ) {
      warn( "Data attributes were supplied to highlightRange but this is not supported at the moment" );
      warn( data );
    }

    let match = this.findHighlights(node => node.end === end && node.start === start);
    if (match.length === 0) {
      const currentPosition = this.currentPosition;
      const needsPositionUpdate = start >= currentPosition && end <= currentPosition;

      const nodesToHighlight = findNodesToHighlight( this.richNode, start, end );
      nodesToHighlight.forEach( (node) => rawHighlightRegionInNode( node, start, end ) );

      // this.updateRichNode(); // DONE by updating the tree manually
      if( needsPositionUpdate )
        this.setCurrentPosition( currentPosition );
    }
    else {
      // note: this warning may not appear sufficiently often due to partial highlights
      warn('highlighting already highlighted region', {id: 'content-editable.highlight-it'});
    }
  },

  /**
   * Clear the highlights contained in a specified range
   *
   * @method clearHightlightForRange
   *
   * @param {number} start Start of the range
   * @param {number} end End of the range
   *
   * @public
   */
  clearHighlightForRange(start,end) {
    let nodes = this.findHighlights(node => node.start >= start && node.end <= end);
    if (nodes.length === 0) warn(`no highlight found contained in range [$start, $end]`, {id: "content-editable.highlight-not-found"});
    nodes.forEach( highlight => { this.removeHighlight(highlight); });
    this.updateRichNode();
    this.setCurrentPosition(this.get('currentSelection')[0], false); //ensure caret is still correct
  },

  /**
   * Given a list of locations, clear the linked highlight
   *
   * @method clearHighlightForLocations
   *
   * @param {Array} [[start, end], ...,[start, end]]
   *
   * @public
   */
  clearHighlightForLocations(locations){
    let highlights = this.findHighlights( (node) => {
      return locations.find( location => {
        return node.start >= location[0] && node.end <= location[1];
      } ); } );

    this.clearHighlights( highlights );
  },

  /**
   *
   * @method removeHighlight
   * @param {RichNode} highlight
   * @private
   */
  removeHighlight(highlight) {
    if( highlight.domNode.nodeName === "MARK" ){
      // TODO: remove the mark
      highlight.domNode.removeAttribute(HIGHLIGHT_DATA_ATTRIBUTE);
    } else {
      highlight.domNode.removeAttribute(HIGHLIGHT_DATA_ATTRIBUTE);
    }
    // removeNodeFromTree(node);
    this.updateRichNode();
  },

  /**
   * Clear all highlights in the editor
   *
   * @method clearAllHightlights
   *
   * @public
   */
  clearAllHighlights() {
    let highlights = this.findHighlights();
    if (highlights.length === 0) warn("no highlights found", {id: "content-editable.highlight-not-found"});
    this.clearHighlights(highlights);
  },

  /**
   * Clear list of  highlights in the editor
   *
   * @method clearAllHightlights
   *
   * @private
   */
  clearHighlights(highlights){
    if( highlights.length === 0 )
      return;

    highlights.forEach(
      highlight => {
        this.removeHighlight(highlight);
      }
    );
    this.setCurrentPosition(this.get('currentSelection')[0], false); //ensure caret is still correct
    this.updateRichNode();
  },

  /**
   * retun all elements which are a highlight, matching the supplied
   * predicate
   *
   * @method findHighlights
   * @param {Function} predicate If no predicate is supplied all matches are returned
   * @private
   */
  findHighlights(predicate = () => true) {
    return flatMap(this.get('richNode'), (node) => {
      return predicate( node )
        && node.type === "tag"
        && node.domNode.getAttribute(HIGHLIGHT_DATA_ATTRIBUTE) === "true";
    } );
  },


  /**
   * Whether an element is displayed as a block
   *
   * @method isDisplayedAsBlock
   *
   * @param {RichNode} richNode Node to validate
   *
   * @return {boolean} true iff the element is displayed as a block
   *
   * @private
   */
  isDisplayedAsBlock(richNode) {
    isDisplayedAsBlock(get(richNode, 'domNode'));
  },

  /**
   * Informs the consumer that the text was inserted at the given
   * position.
   *
   * Others can set it on this component, but we are the only ones to
   * call it.
   *
   * @param {number} position Index of the inserted text.
   * @param {String} text Text content that has been inserted.
   */
  textInsert( /*position, text*/ ) {
    warn("textInsert was called on raw-editor without listeners being set.", { id: 'content-editable.invalid-state'});
  },

  /**
   * Insert text at provided position,
   *
   * @method insertText
   * @param {String} text to insert
   * @param {Number} position
   *
   * @return {DOMNode} node
   * @public
   */
  insertText(text, position) {
    if (!this.get('richNode')) {
      warn(`richNode wasn't set before inserting text onposition ${position}`,{id: 'content-editable.rich-node-not-set'});
      this.updateRichNode();
    }
    const textNode = this.findSuitableNodeForPosition(position);
    const type = get(textNode, 'type');
    let domNode;
    if (type === 'text') {
      if (text === " ")
        text = NON_BREAKING_SPACE;
      const parent = get(textNode, 'parent');
      if (position === get(textNode, 'end') && tagName(get(parent, 'domNode')) === 'mark') {
        const mark = get(parent, 'domNode');
        const markParent = get(parent, 'parent.domNode');
        // there is no inserting at the end of highlight, we insert next to the highlight
        domNode = document.createTextNode(text);
        insertNodeBAfterNodeA(markParent, mark, domNode);
      }
      else {
        domNode = get(textNode, 'domNode');
        const relativePosition = position - get(textNode, 'start');
        if (text !== NON_BREAKING_SPACE && relativePosition > 0 &&
            domNode.textContent[relativePosition-1] === NON_BREAKING_SPACE) {
          let content = domNode.textContent;
          domNode.textContent = content.slice(0, relativePosition -1) + " " + content.slice(relativePosition);
        }
        sliceTextIntoTextNode(domNode, text, relativePosition);
      }
      this.set('currentNode', domNode);
    }
    else {
      // we should always have a suitable node... last attempt to safe things somewhat
      warn(`no text node found at position ${position}`, {id: 'content-editable.no-text-node-found'});
      warn('inconsistent state in editor!', {id: 'content-editable.no-text-node-found'});
      domNode = document.createTextNode(text);
      get(textNode, 'domNode').appendChild(domNode);
      this.set('currentNode', domNode);
    }
    this.updateRichNode();
    return domNode;
  },

  /**
   * insert a component at the provided position
   * @method insertComponent
   * @param {Number} position
   * @param {String} componentName
   * @param {Object} componentContent
   * @return {String} componentID
   * @public
   */
  insertComponent(position, name, content, id = uuidv4()) {
    var el;
    if (position instanceof Element)
      el = position;
    else
      [el] = this.replaceTextWithHTML(position, position, `<div contenteditable="false" id="editor-${id}"><!-- component ${id} --></div>`);
    let config = { id, element: el, name, content: EmberObject.create(content) };
    this.components.pushObject(config);
    this.updateRichNode();
    this.updateSelectionAfterComplexInput();
    return id;
  },

  /**
   * remove a component
   * @method removeComponent
   * @param {String} componentID
   * @public
   */
  removeComponent(id) {
    let item = this.components.find( (item) => item.id === id);
    this.components.removeObject(item);
    this.updateRichNode();
    this.updateSelectionAfterComplexInput();
  },

  isTagWithOnlyABreakAsChild(node) {
    let type = node.domNode.nodeType;
    let children = get(node, 'children');
    return (type === Node.ELEMENT_NODE &&
            children.length === 1 &&
            get(children[0], 'type') === 'tag' &&
            tagName(get(children[0], 'domNode')) === 'br'
           );
  },

  insertTextNodeWithSpace(parent, relativeToSibling = null, after = false) {
    let parentDomNode = get(parent, 'domNode');
    let textNode = insertTextNodeWithSpace(parentDomNode, relativeToSibling, after);
    this.updateRichNode();
    this.generateDiffEvents.perform([{noSnapshot: true}]);
    return this.getRichNodeFor(textNode);
  },


  /**
   * determines best suitable node to position caret in for provided rich node and position
   * creates a text node if necessary
   * @method findSuitableNodeInRichNode
   * @param {RichNode} node
   * @param {number} position
   * @return {RichNode}
   * @private
   */
  findSuitableNodeInRichNode(node, position) {
    if (!node)
      throw new Error('no node provided to findSuitableNodeinRichNode');
    let type = node.type;
    // in some browsers voidElements don't implement the interface of an element
    // for positioning we provide it's own type
    if (isVoidElement(node.domNode))
      type = 'void';
    if (type === 'text') {
      return node;
    }
    else if (type === 'void') {
      let textNode = document.createTextNode(invisibleSpace);
      let parent = get(node, 'parent');
      let parentDomNode = get(parent,'domNode');
      let children = get(parent, 'children');
      parentDomNode.replaceChild(textNode, node.domNode);
      if(children.length > 1 && tagName(get(node,'domNode')) === 'br')
        parentDomNode.insertBefore(document.createElement('br'), textNode); // new br to work around funky br type="moz"
      else if (children.length !== 1 || tagName(get(node,'domNode')) !== 'br')
        parentDomNode.insertBefore(node.domNode, textNode); // restore original void element
      this.updateRichNode();
      return this.getRichNodeFor(textNode);
    }
    else if (type === 'tag') {
      if (this.isTagWithOnlyABreakAsChild(node)) {
        debug('suitable node: is tag with only a break as child');
        let domNode = node.domNode;
        let textNode = document.createTextNode(invisibleSpace);
        domNode.replaceChild(textNode, domNode.firstChild);
        this.updateRichNode();
        return this.getRichNodeFor(textNode);
      }
      else {
        debug('suitable node: using deepest matching node');
        let appropriateNodeFilter = node =>
            node.start <= position && node.end >= position
            && ! isVoidElement(node.domNode)
            && ! isIgnorableElement(node.domNode)
            && node.type !== 'other';
        let nodesContainingPosition = flatMap(node, appropriateNodeFilter);
        if (nodesContainingPosition.length > 0) {
          let deepestContainingNode = nodesContainingPosition[nodesContainingPosition.length -1];
          if (deepestContainingNode === node) {
            debug(`creating new textnode in provided node of type ${node.type} range ${node.start} ${node.end}`);
            return this.insertTextNodeWithSpace(node);
          }
          else {
            debug('retrying');
            return this.findSuitableNodeInRichNode(deepestContainingNode, position);
          }
        }
        else {
          return this.insertTextNodeWithSpace(node);
        }
      }
    }
    throw new Error(`unsupported node type ${type} for richNode`);
  },

  /**
   * select a node based on the provided caret position, taking into account the current active node
   * if no suitable node exists, create one (within reason)
   * @method findSuitableNodeForPosition
   * @param {Number} position
   * @return {RichNode} node containing position or null if not found
   * @private
   */
  findSuitableNodeForPosition(position) {
    let currentRichNode = this.getRichNodeFor(this.get('currentNode'));
    let richNode = this.get('richNode');
    if (currentRichNode && get(currentRichNode, 'start') <= position && get(currentRichNode, 'end') >= position) {
      let node = this.findSuitableNodeInRichNode(currentRichNode, position);
      return node;
    }
    else if (get(richNode, 'start') <= position && get(richNode, 'end') >= position){
      let node = this.findSuitableNodeInRichNode(this.get('richNode'),position);
      return node;
    }
    else {
      warn(`position ${position} is not in range of document ${get(richNode, 'start')} ${get(richNode, 'end')}`, {id: 'content-editable:not-a-suitable-position'});
      return this.findSuitableNodeForPosition(get(richNode, 'end'));
    }
  },

  /**
   * create a snapshot for undo history
   * @method createSnapshot
   * @public
   */
  createSnapshot() {
    let document = {
      content: this.get('rootNode').innerHTML,
      currentSelection: this.currentSelection
    };
    this.get('history').push(document);
  },

  /**
   * @method updateRichNode
   * @private
   */
  updateRichNode() {
    const richNode = walkDomNode( this.rootNode );
    this.set('richNode', richNode);
  },

  /**
   * restore a snapshot from undo history
   * @method undo
   * @public
   */
  undo() {
    let previousSnapshot = this.get('history').pop();
    if (previousSnapshot) {
      this.get('rootNode').innerHTML = previousSnapshot.content;
      this.updateRichNode();
      this.set('currentNode', null);
      this.setCurrentPosition(previousSnapshot.currentSelection[0]);
      this.generateDiffEvents.perform([{noSnapshot: true}]);
    }
    else {
      warn('no more history to undo', {id: 'contenteditable-editor:history-empty'});
    }
  },

  /**
   * @method moveCaretInTextNode
   * @param {TEXTNode} textNode
   * @param {number} position
   * @private
   */
  moveCaretInTextNode(textNode, position){
    let docRange = document.createRange();
    let currentSelection = window.getSelection();
    docRange.setStart(textNode, position);
    docRange.collapse(true);
    currentSelection.removeAllRanges();
    currentSelection.addRange(docRange);
    this.get('rootNode').focus();
  },

   /**
   * get richnode matching a DOMNode
   *
   * @method getRichNodeFor
   *
   * @param {DOMNode} node
   *
   * @return {RichNode} node
   *
   * @private
   */
  getRichNodeFor(domNode, tree = this.get('richNode')) {
    return getRichNodeMatchingDomNode(domNode, tree);
  },

  /**
   * execute a DOM transformation on the editor content, ensures a consistent editor state
   * @method externalDomUpdate
   * @param {String} description
   * @param {function} domUpdate
   * @public
   */
  externalDomUpdate(description, domUpdate) {
    debug(`executing an external dom update: ${description}`, {id: 'contenteditable.external-dom-update'} );
    domUpdate();
    this.updateRichNode();
    this.updateSelectionAfterComplexInput();
    forgivingAction('elementUpdate', this)();
    this.generateDiffEvents.perform();
  },

  /**
   * update the selection based on dom window selection
   * to be used when we are unsure what sort of input actually happened
   *
   * @method updateSelectionAfterComplexInput
   * @private
   */
  updateSelectionAfterComplexInput() {
    let windowSelection = window.getSelection();
    if (windowSelection.rangeCount > 0) {
      let range = windowSelection.getRangeAt(0);
      let commonAncestor = range.commonAncestorContainer;
      // IE does not support contains for text nodes
      commonAncestor = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor;
      if (this.get('rootNode').contains(commonAncestor)) {
        if (range.collapsed) {
          this.setCarret(range.startContainer, range.startOffset);
        }
        else {
          let startNode = this.getRichNodeFor(range.startContainer);
          let endNode = this.getRichNodeFor(range.endContainer);
          let start = this.calculatePosition(startNode, range.startOffset);
          let end = this.calculatePosition(endNode, range.endOffset);
          let newSelection  = [start, end];
          this.set('currentNode', null);
          this.set('currentSelection', newSelection);
          forgivingAction('selectionUpdate', this)(this.get('currentSelection'));
        }
      }
    }
    else {
      warn('no selection found on window',{ id: 'content-editable.unsupported-browser'});
    }
  },

  /**
   * calculate the cursor position based on a richNode and an offset from a domRANGE
   * see https://developer.mozilla.org/en-US/docs/Web/API/Range/endOffset and
   * https://developer.mozilla.org/en-US/docs/Web/API/Range/startOffset
   *
   * @method calculatePosition
   * @param {RichNode} node
   * @param {Number} offset
   * @private
   */
  calculatePosition(richNode, offset) {
    let type = richNode.type;
    if (type === 'text')
      return richNode.start + offset;
    else if (type === 'tag') {
      let children = richNode.children;
      if (children && children.length > offset)
        return children[offset].start;
      else if (children && children.length == offset)
        // this happens and in that case we want to be at the end of that node, but not outside
        return children[children.length -1 ].end;
      else {
        warn(`provided offset (${offset}) is invalid for richNode of type tag with ${children.length} children`, {id: 'contenteditable-editor.invalid-range'});
        return children[children.length -1 ].end;
      }
    }
    else {
      throw new Error(`can't calculate position for richNode of type ${type}`);
    }
  },

  /**
   * set the carret position in the editor
   *
   * @method setCurrentPosition
   * @param {number} position of the range
   * @param {boolean} notify observers, default true
   * @public
   */
  setCurrentPosition(position, notify = true) {
    let richNode = this.get('richNode');
    if (get(richNode, 'end') < position || get(richNode, 'start') > position) {
      warn(`received invalid position, resetting to ${get(richNode,'end')} end of document`, {id: 'contenteditable-editor.invalid-position'});
      position = get(richNode, 'end');
    }
    let node = this.findSuitableNodeForPosition(position);
    this.moveCaretInTextNode(get(node,'domNode'), position - node.start);
    this.set('currentNode', node.domNode);
    this.set('currentSelection', [ position, position ]);
    if (notify)
      forgivingAction('selectionUpdate', this)(this.currentSelection);
  },

  getRelativeCursorPosition(){
    let currentRichNode = this.getRichNodeFor(this.currentNode);
    let absolutePos = this.currentSelection[0];
    return absolutePos - currentRichNode.start;
  },

  getRelativeCursorPostion() {
    return this.getRelativeCursorPosition();
  },


  /**
   * set the carret on the desired position. This function ensures a text node is present at the requested position
   *
   * @method setCarret
   * @param {DOMNode} node, a text node or dom element
   * @param {number} offset, for a text node the relative offset within the text node (i.e. number of characters before the carret).
   *                         for a dom element the number of children before the carret.
   * @return {DOMNode} currentNode of the editor after the operation
   * Examples:
   *     to set the carret after 'c' in a textnode with text content 'abcd' use setCarret(textNode,3)
   *     to set the carret after the end of a node with innerHTML `<b>foo</b><span>work</span>` use setCarret(element, 2) (e.g setCarret(element, element.children.length))
   *     to set the carret after the b in a node with innerHTML `<b>foo</b><span>work</span>` use setCarret(element, 1) (e.g setCarret(element, indexOfChild + 1))
   *     to set the carret after the start of a node with innerHTML `<b>foo</b><span>work</span>` use setCarret(element, 0)
   *
   * @public
   */
  setCarret(node, offset, notify = true) {
    const richNode = this.getRichNodeFor(node);
    if (richNode.type === 'tag' && richNode.children) {
      if (richNode.children.length < offset) {
        warn(`invalid offset ${offset} for node ${tagName(richNode.domNode)} with ${richNode.children } provided to setCarret`, {id: 'contenteditable.invalid-start'});
        return;
      }
      const richNodeAfterCarret = richNode.children[offset];
      if (richNodeAfterCarret && richNodeAfterCarret.type === 'text') {
        // the node after the carret is a text node, so we can set the cursor at the start of that node
        this.set('currentNode', richNodeAfterCarret.domNode);
        const absolutePosition = richNodeAfterCarret.start;
        this.set('currentSelection', [absolutePosition, absolutePosition]);
        this.moveCaretInTextNode(richNodeAfterCarret.domNode, 0);
      }
      else if (offset > 0 && richNode.children[offset-1].type === 'text') {
        // the node before the carret is a text node, so we can set the cursor at the end of that node
        const richNodeBeforeCarret = richNode.children[offset-1];
        this.set('currentNode', richNodeBeforeCarret.domNode);
        const absolutePosition = richNodeBeforeCarret.end;
        this.set('currentSelection', [absolutePosition, absolutePosition]);
        this.moveCaretInTextNode(richNodeBeforeCarret.domNode, richNodeBeforeCarret.domNode.textContent.length);
      }
      else {
        // no suitable text node is present, so we create a textnode
        // TODO: handle empty node
        var textNode;
        if (richNodeAfterCarret)
          textNode = insertTextNodeWithSpace(node, richNodeAfterCarret.domNode);
        else
          textNode = insertTextNodeWithSpace(node, richNode.children[offset-1], true);
        this.updateRichNode();
        this.set('currentNode', textNode);
        const absolutePosition = this.getRichNodeFor(textNode).start;
        this.set('currentSelection', [absolutePosition, absolutePosition]);
        this.moveCaretInTextNode(textNode, 0);
      }
    }
    else if (richNode.type === 'text') {
      this.set('currentNode', node);
      const absolutePosition = richNode.start + offset;
      this.set('currentSelection', [absolutePosition, absolutePosition]);
      this.moveCaretInTextNode(node, offset);
    }
    else {
      warn(`invalid node ${tagName(node.domNode)} provided to setCarret`, {id: 'contenteditable.invalid-start'});
    }
    if (notify)
      forgivingAction('selectionUpdate', this)(this.currentSelection);
  },

  /**
   * Called after relevant input. Checks content and calls closureActions when changes detected
   * handleTextInsert, handleTextRemove, handleFullContentUpdate
   * @method generateDiffEvents
   *
   * @param {Array} Optional argument pass info to event consumers.
   * @public !!
   */
  generateDiffEvents: task(function* (extraInfo = []){
    yield timeout(320);

    let newText = getTextContent(this.get('rootNode'));
    let oldText = this.get('currentTextContent');
    const dmp = new DiffMatchPatch();
    let differences = dmp.diff_main(oldText, newText);
    let pos = 0;
    let textHasChanges = false;

    differences.forEach( ([mode, text]) => {
      if (mode === 1) {
        textHasChanges = true;
        this.set('currentTextContent', oldText.slice(0, pos) + text + oldText.slice(pos, oldText.length));
        this.textInsert(pos, text, extraInfo);
        pos = pos + text.length;
      }
      else if (mode === -1) {
        textHasChanges = true;
        this.set('currentTextContent', oldText.slice(0,pos) + oldText.slice(pos + text.length, oldText.length));
        forgivingAction('textRemove', this)(pos, pos + text.length, extraInfo);
      }
      else {
        pos = pos + text.length;
      }
      oldText = this.get('currentTextContent');
    }, this);

    if(textHasChanges){
      if ( ! extraInfo.any( (x) => x.noSnapshot)) {
        this.createSnapshot();
      }
      forgivingAction('handleFullContentUpdate', this)(extraInfo);
    }
  }).restartable(),


  /* Potential methods for the new API */
  getContexts(options) {
    const {region} = options || {};
    if( region )
      return scanContexts( this.rootNode, region );
    else
      return scanContexts( this.rootNode );
  },

  /**
   * SELECTION AND UPDATING API
   *
   * Selection and Update API go hand-in-hand.  First make a
   * selection, then determine the desired changes on the DOM tree.
   * Note that selection and update need to be synchronous.  Do not
   * assume that a selection that is made in one runloop can be used
   * to update the tree in another.
   *
   * Examples:
   *
   * Add context to highlighted range
   *
   *     const selection = editor.selectHighlight( range );
   *     editor.update( selection, {
   *       add: {
   *         property: "http://data.vlaanderen.be/ns/besluit/citeert",
   *         typeof: "http://data.vlaanderen.be/ns/besluit/Besluit",
   *         innerContent: selection.text // this is somewhat redundant, it's roughly the
   *                                      // default case.  in fact, it may drop
   *                                      // knowledge so you shouldn't do it unless you
   *                                      // need to.
   *
   *       } } );
   *
   * Add type to existing type definition:
   *
   *     const sel = editor.selectContext( range, { typeof: "http://data.vlaanderen.be/ns/besluit/Besluit" } );
   *     editor.update( sel, { add: {
   *       typeof: "http://mu.semte.ch/vocabularies/ext/AanstellingsBesluit",
   *       newContext: false } } );
   *
   * Add new context below existing type definition:
   *
   *     const sel = editor.selectContext( range, { typeof: "http://data.vlaanderen.be/ns/besluit/Besluit" } );
   *     editor.update( sel, { add: {
   *       typeof: "http://mu.semte.ch/vocabularies/ext/AanstellingsBesluit",
   *       newContext: true } } );
   *
   * Alter the type of some context:
   *
   *     const sel = editor.selectContext( range, { typeof: "http://tasks-at-hand.com/ns/metaPoint" } );
   *     editor.update( sel, {
   *       remove: { typeof: "http://tasks-at-hand.com/ns/MetaPoint" },
   *       add: { typeof: ["http://tasks-at-hand.com/ns/AgendaPoint", "http://tasks-at-hand.com/ns/Decesion"] }
   *     } );
   *
   */


  /**
   * SELECTION API RESULT
   *
   * This is an internal API.  It is subject to change.
   *
   * The idea of the selection API is that it yields the nodes on
   * which changes need to occur with their respective ranges.  This
   * means that we may return more than one node and that each of the
   * nodes might only have a sub-range selected on them.  We also need
   * to share sufficient information on the intention of the user, so
   * we can manipulate the contents correctly.
   *
   * The resulting entity has a top-level object which describes the
   * intention of the user.  Further elements of the selection contain
   * the effectively selected blobs on which we expect the user to
   * operate.
   *
   * @param {boolean} selectedHighlightRange Truethy iff the plugin
   *   selected a portion of the highlight, rather than a contextual
   *   element.
   * @param {[Selection]} selections A matched selection containing
   *   both the tag to which the change should be applied, as well as
   *   the RichNode of the change.
   * @param {[Number]} selections.range Range which should be
   *   highlighted.  Described by start and end.
   * @param {RichNode} selections.richNode Rich Node to which the
   *   selection applies.
   */

  /**
   * Selects the highlighted range, or part of it, for applying
   * operations to.
   *
   * With no arguments, this method selects the full highlighted range
   * in order to apply operations to it.  The options hash can be used
   * to supply constraints:
   *
   * - { offset } : Array containing the left offset and right offset.
   *   Both need to be positive numbers.  The former is the amount of
   *   characters to strip off the left, the latter the amount of
   *   characters to strip off the right.
   * - TODO { regex } : Regular expression to run against the matching
   *   string.  Full matching string is used for manipulation.
   */
  selectHighlight([start,end], options = {}){

    if( options.offset ) {
      start += options.offset[0] || 0;
      end -= options.offset[1] || 0;
    }
    if( start > end ) {
      throw new Error(`Selection ${start}, ${end} with applied offset of ${options.offset} gives an index in which start of region is not before or at the end of the region`);
    }

    const selections = [];
    let nextWalkedNodes = [this.richNode];

    while( nextWalkedNodes.length ) {
      let currentNodes = nextWalkedNodes;
      nextWalkedNodes = [];

      for( let node of currentNodes ){
        if( !node.children ) {
          // handle lowest level node
          if ( node.isInRegion(start, end) || node.isPartiallyInRegion(start, end) ) {
            selections.push( {
              richNode: node,
              range: [ Math.max( node.start, start ), Math.min( node.end, end ) ] } );
          }
        } else {
          if(this.hasRegionCrossSectionWithRichNode([start, end], node)) {
            node.children.forEach( (child) => nextWalkedNodes.push( child ) );
          }
        }
      }
    }

    return {
      selectedHighlightRange: true,
      selections: selections
    };
  },

  hasRegionCrossSectionWithRichNode([start, end], node){
    return ( node.start <= start && node.end >= start ) // node overlaps on the left
      || ( node.start <= end && node.end >= end ) // node overlaps on the right
      || ( node.start >= start && node.end <= end ); // node is inside
  },

  /**
   * Selects nodes based on an RDFa context that should be applied.
   *
   * Options for scope search default to 'auto'.
   *
   * Options for filtering:
   * - range: The range object describing the highlighted region.
   * - scope:
   *   - 'outer': Search from inner range and search for an item
         spanning the full supplied range or more.
   *   - 'inner': Search from outer range and search for an item which
         is fully contained in the supplied range.
   *   - 'auto': Perform a best effort to find the nodes in which you're
         interested.
   * - property: string of URI or array of URIs containing the
   *   property (or properties) which must apply.
   * - typeof: string of URI or array of URIs containing the property
       (or types) which must apply.
   * - datatype: string of URI or array of URIs containing the
       property (or datatypes) which must apply.
   * - TODO resource: string of URI or array of URIs containing the
       property (or properties) which must apply.
   * - TODO content: string or regular expression of RDFa content.
   * - TODO attribute: string or regular expression of attribute available on the node.
   */
  selectContext([start,end], options = {}){

    if ( !options.scope ) {
      options.scope = 'auto';
    }

    if ( !['outer', 'inner', 'auto'].includes(options.scope) ) {
      throw new Error(`Scope must be one of 'outer', 'inner' or 'auto' but is '${options.scope}'`);
    }

    if ( start > end ) {
      throw new Error(`Selection ${start}, ${end} gives an index in which start of region is not before or at the end of the region`);
    }

    const supportedFilterKeywords = ['typeof', 'property', 'datatype', 'resource']; // TODO support content, attribute

    // Make an array of all filter criteria
    const filter = {};
    supportedFilterKeywords.forEach( key => filter[key] = options[key] ? [ options[key] ].flat() : [] );


    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>HELPERS

    // Validates if the RDFa attributes of a node matches at least 1 filter criteria
    const includesMatchingRdfaAttribute = function(rdfaAttributes, filter) {
      return rdfaAttributes
        //TODO: !!!!!! rdfa attributes are not expanded !!!!!
        && supportedFilterKeywords.find( key => filter[key] ); // && filter[key].includes(rdfaAttributes[key]) );
    };

    // Validates if the RDFa context of a node matches all filter criteria. Order of the criteria are not taken into account.
    const isMatchingContext = function(triples, filter) {
      const includesMatchingTriple = (triples, fragment, value) => triples.find( t => t[fragment] == value);

      //TODO: find out how to differentiate between resource as object and as subject
      return filter.resource.find( resource => !includesMatchingTriple(triples, 'subject', resource) ) == null
        && filter.property.find( prop => !includesMatchingTriple(triples, 'predicate', prop) ) == null
        && filter.typeof.find( type => !includesMatchingTriple(triples, 'object', type) ) == null
        && filter.datatype.find( datatype => !includesMatchingTriple(triples, 'datatype', datatype) ) == null;
       // TODO support content, attribute
    };

    const isRegionContainedIn = ([a, b], [c, d]) => c <= a && b <= d;

    const walkDownAndFilterInner = (startingRichNodes, filter, [ start, end ], strict = false) => {
      if(startingRichNodes.length == 0){
        return [];
      }
      let selections = [];
      let startRichNode = startingRichNodes[0];

      if(strict && !startRichNode.nbOfTriplesOutsideTree){
        startRichNode.nbOfTriplesOutsideTree = startRichNode.rdfaContext.length;
      }

      let triples = strict ? startRichNode.nbOfTriplesOutsideTree.context.slice(startRichNode.nbOfTriplesOutsideTree) : startRichNode.rdfaContext;

      if ( includesMatchingRdfaAttribute(startRichNode.rdfaAttributes, filter)
           && isMatchingContext(triples, filter)
           && isRegionContainedIn([startRichNode.start, startRichNode.end], [start, end])) {

        selections.push( {
              richNode: startRichNode,
              range: [ Math.max( startRichNode.start, start ), Math.min( startRichNode.end, end ) ]
        } );

      }

      if(strict)
        (startRichNode.richNode || []).forEach( n => n.nbOfTriplesOutsideTree = startRichNode.nbOfTriplesOutsideTree);

      //go through children
      selections = [ ...selections, ...walkDownAndFilterInner(startRichNode.richNode || [], filter, [start, end], strict)];

      //walk through the remaining startingstartRichNodes
      selections = [...selections, ...walkDownAndFilterInner(startingRichNodes.slice(1), filter, [start, end], strict)];

      return selections;
    };

    const walkUpAndFilterOuter = (startingRichNodes, filter, [ start, end ]) => {
      if(startingRichNodes.length == 0){
        return [];
      }
      let selections = [];
      let startRichNode = startingRichNodes[0];

      if (!isMatchingContext(startRichNode.triples, filter)){
        // No need to walk up the tree since the context towards top doesn't match
        return walkUpAndFilterOuter(startingRichNodes.slice(1), filter, [start, end]);
      }

      if(includesMatchingRdfaAttribute(startRichNode.rdfaAttributes, filter)
         && isRegionContainedIn([start, end], [startRichNode.start, startRichNode.end])){

        selections.push( {
              richNode: startRichNode,
              range: [ Math.max( startRichNode.start, start ), Math.min( startRichNode.end, end ) ]
        });

      }

      //move up the parents if nothing has been found
      if(selections.length == 0)
        selections = walkUpAndFilterOuter(startRichNode.parent ? [ startRichNode.parent ] : [], filter, [start, end]);

     //walk through the remaining startRichNodes
      selections = [...selections, ...walkUpAndFilterOuter(startingRichNodes.slice(1), filter, [start, end])];

      return selections;
    };

    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> END HELPERS

    let startingBlocks = scanContexts( this.rootNode, [start, end] );
    let foundInnerMatch = false;

    let selections = [];

    if ( options.scope == 'auto' ) {
      selections = walkDownAndFilterInner(startingBlocks.map(b => b.semanticNode), filter, [start, end]);
      foundInnerMatch = selections.length > 0;
    }

    if ( options.scope == 'outer' || ( options.scope == 'auto' && !foundInnerMatch ) ) {
      selections = walkUpAndFilterOuter(startingBlocks.map(b => b.semanticNode), filter, [start, end]);

    } else if ( options.scope == 'inner' ) {
      selections = walkDownAndFilterInner(startingBlocks.map(b => b.semanticNode), filter, [start, end], true);
    }

    return { selections };
  },


  /**
   * OPERATION API
   */

  /**
   * Replaces a DOM node
   *
   * This raw method replaces a DOM node in a callback.  This allows
   * the raw editor to prepare for the brute change and to alter the
   * contents.  It should be used as a last resort.
   *
   * Callback is used if the editor can prepare itself for the change.
   * failedCallback is called when the editor cannot execute the
   * change.
   *
   * - domNode: Node which will be altered
   * - callback: Function which should execute the dom node
   *   alteration.  This function receives the DOM node which was
   *   supplied earlier as a first argument.
   * - failedCallback: Function which will be executed if the callback
   *   could not be executed.  It receives the dom Node and an
   *   explanation as to why the execution could not happen
   * - motivation: Obligatory statement explaining why you need
   *   replaceDomNode and cannot use one of the other methods.
   */
  replaceDomNode( domNode, { callback, failedCallback, motivation, desc } ){

  },

  /**
   * Alters a selection from the API described above.
   *
   * Any selected range can be manipulated.  This method allows such
   * changes to happen on following key terms: property, typeof,
   * dataType, resource, content, (TODO: attribute), innerContent,
   * innerHtml
   *
   * - selection: Object retrieved from #selectContext or
   *   #selectHighlight.
   * - options: Object specifying desired behaviour.
   * - options.remove: Removes RDFa content that was already there.
   *     Allows removing any of property, typeof, datatype, resource,
   *     content, (TODO: attribute), innerContent, innerHtml
   * - options.add: Adds specific content to the selection, pushing
   *     nvalues on top of already existing values.  Allows adding any
   *     of property, typeof, datatype, resource.  Set the
   *     forceNewContext property to true to force a new context if a
   *     full tag is selected.
   * - options.set: Allows setting any of property, typeof, datatype,
   *     resource content attribute innerContent innerHtml.  Set the
   *     newContext property to true to force a new context if a full
   *     tag is selected.
   * - options.desc: You are oncouraged to write a brief description
   *     of the desired manipulation here for debugging needs.
   *
   * The syntax for specifying items to remove works as follows:
   * - true: Removes any value to be removed.
   * - string: Removes the specific value as supplied.  If no value
   *   matches, nothing is removed.  For semantic content, translation
   *   is done based on the current context, eg: if there is a
   *   foaf:name in the document, then suppling the string
   *   "http://xmlns.com/foaf/0.1/name" will usually mean foaf:name is
   *   matched.
   * - [string]: An array of strings means all the matches will be
   *   removed.  Matching works the same way as string.
   * - regex: Considers the present value and executes a regular
   *   expression on said value.  If the regular expression matches,
   *   the value is removed.
   * - [regex]: An array of regular experssions.  If any matches, the
   *   value itself is matched.
   *
   * The syntax for specifying items to add works for all properties
   * which can be set using "add".  Specification works as follows:
   * - string: Specifies a single value to set or add.
   * - [string]: Specifies a series of values to set or add.
   *
   * NOTE: The system is free to set or add
   * properties based on a short form (derived from the prefixes
   * available in the context) if it is possible and if it desires to
   * do so.
   *
   * NOTE: newContext is set to undefined by default and behaves
   * similar to false.  This is because we assume that when you don't
   * care about the context there's a fair chance that we can merge
   * the contexts.  In specific cases you may desire to have things
   * merge (or not) explicitly.  You should set eithre true or false
   * in that case.
   *
   * NOTE/TODO: In order to make plugins simpler, we should look into
   * specifying namespaces in the plugin.  By sharing these namespaces
   * with these setter methods, it becomes shorter te specify the URLs
   * to match on.
   *
   * NOTE/TODO: It is our intention to allow for multiple operations
   * to occur in series.  Altering the range in multiple steps.  This
   * can currently be done by executing the alterSelection multiple
   * times.  Connecting the changes this way does require you to make
   * a new selection each time you want to execute a new change.  If
   * this case occurs often *and* we can find sensible defaults on
   * updating the selection, we could make this case simpler.  The
   * options hash would also allow an array in that case.
   */
  update( selection, { remove, add, set, desc } ) {
    const newContextHeuristic = newContextHeuristic( selection, { remove, add, set, desc } );

    // This function needs to figure out how to best manipulate the
    // DOM tree, and execute that manipulation.  This is complex.  We
    // need to further reason on the received information, possibly
    // walk back up the tree and possibly discard zero-width nodes.
    // This requires knowledge of annotated context and of transient
    // properties which can be split or merged.

    // Indicates whether or not the tree can be manipulated in such a
    // way that a single node is left.  Has an understanding of
    // transient marks.  This should return two values: whether or not
    // this is possible completely, and the set of predicted resulting
    // nodes.  These mockNodes can be used to check whether or not we
    // could 'fix' the mark manually or do a best-effort approach.

    const [ canJoinSelection, mockNodes ] = canJoinSelection( selection );


  }
});

/**
 * Heuristically choose whether we should be creating a new context or
 * not.
 *
 * @method newContextHeuristic Object Returns whether or not we should
 * create a new context or not.  It is a heuristic and yields an
 * object containing force, yes, and no.  Force means we must make a
 * new context.  Yes means we should try to make a new context, and no
 * means we should try not to make a new context.
 */
function newContextHeuristic( selection, { remove, add, set } ) {
  // prefer overriding choice
  if( add.newContext === true )
    return { force: true, yes: true, no: false, forceNo: false };
  else if( add.newContext === false )
    return { force: false, yes: false, no: true, forceNo: true };

  // no overriding choice, let's guess

  // if we remove stuff, we probably want to overwrite stuff,
  if( remove )
    return { force: false, yes: false, no: true, forceNo: false };

  // if we're selecting a slab of text, we probably want to create a
  // new context
  if( selection.selectedHighlightRange )
    return { force: false, yes: true, no: false, forceNo: false };

  // no other selection happened, we should try to merge the contexts
  // if possible.
  return { force: false, yes: false, no: true, forceNo: false };
}

/**
 * Indicates whether or not we should annotate a single node or if the
 * annotation can span multiple nodes.
 */
function shouldJoinNodes( selection, { remove, add, set } ) {
  if( add.typeof ) {
    return { mustjoin: true, shouldjoin: true };
  }

  if( remove.typeof || add.property || add.content ) {

  }
}

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => {
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
  });
}
export default RawEditor;
