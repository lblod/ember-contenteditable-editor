import {
  isDisplayedAsBlock,
  invisibleSpace,
  insertTextNodeWithSpace,
  insertNodeBAfterNodeA,
  sliceTextIntoTextNode,
  removeNodeFromTree,
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
import NodeWalker from './node-walker';
import TextNodeWalker from './text-node-walker';
import previousTextNode from './previous-text-node';
import { getTextContent } from './text-node-walker';
import { debug, warn } from '@ember/debug';
import { get, computed } from '@ember/object';
import { A } from '@ember/array';
import DiffMatchPatch from 'diff-match-patch';
import { task, timeout } from 'ember-concurrency';
const HIGHLIGHT_DATA_ATTRIBUTE = 'data-editor-highlight';
const NON_BREAKING_SPACE = '\u00A0';

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
   */
  currentSelection: null,


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
    let getCurrentCarretPosition = this.getRelativeCursorPostion();
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

    this.updateRichNode();

    if(keepCurrentPosition)
      this.setCarret(currentNode, getCurrentCarretPosition);
    else {
      //update editor state
      this.setCarret(lastInsertedRichElement.domNode, lastInsertedRichElement.end);
    }

    this.generateDiffEvents.perform(extraInfo);
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
    let carretPositionToEndIn = this.getRelativeCursorPostion();
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
    let getCurrentCarretPosition = this.getRelativeCursorPostion();
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

    this.updateRichNode();
    this.generateDiffEvents.perform(extraInfo);

    //update editor state
    this.set('currentNode', lastInsertedRichElement.domNode);
    this.setCurrentPosition(lastInsertedRichElement.end);

    if(keepCurrentPosition)
      this.setCarret(currentNode, getCurrentCarretPosition);

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
    return TextNodeWalker.create().processDomNode(richNode.domNode.nextSibling, richParent.domNode, richNode.end);
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

    let newFirstRichChild = TextNodeWalker.create().processDomNode(newFirstChild, richParent.domNode, richParent.start);
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

    let richNodeToInsert = TextNodeWalker.create().processDomNode(nodeToInsert, richParent.domNode, richNode.end);

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
    let match = this.findHighlights(node => node.end === end && node.start === start);
    if (match.length === 0) {
      let text = this.currentTextContent.slice(start, end);
      let elements = replaceTextWithHtml(this.richNode, start, end, `<mark>${text}</mark>`);
      let element = elements[0];
      for (const prop in data) {
        element.setAttribute(prop,data[prop]);
      }
      element.setAttribute(HIGHLIGHT_DATA_ATTRIBUTE, 'true');
      let currentNode = this.getRichNodeFor(this.get('currentNode'));

      //if current node is expected to be in new highlighted range
      if (currentNode && currentNode.start <= start && currentNode.end >= end) {
        let textNode = element.childNodes[0]; //for highlight we always expect a textnode as first child
        this.set('currentNode', textNode);
        if (!element.nextSibling) {
          insertTextNodeWithSpace(element.parentElement);
        }
      }
      this.updateRichNode();
      this.setCurrentPosition(this.get('currentSelection')[0], false); //ensure caret is still correct
    }
    else {
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

    let nodeForLocation = node => {
      return locations.find(location => {
        return node.start === location[0] && node.end === location[1];
      });
    };

    let highlights = this.findHighlights(nodeForLocation);

    if(get(highlights, 'length') > 0){
      this.clearHighlights(highlights);
    }
  },

  /**
   *
   * @method removeHighlight
   * @param {RichNode} highlight
   * @private
   */
  removeHighlight(highlight) {
    let node = get(highlight, 'domNode');
    removeNodeFromTree(node);
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
    let highlights = this.findHighlights(() =>true);
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
    highlights.forEach(
      highlight => {
        this.removeHighlight(highlight);
      }
    );
    this.setCurrentPosition(this.get('currentSelection')[0], false); //ensure caret is still correct
    this.updateRichNode();
  },

  /**
   * retun all elements with tag name 'mark' that match provided predicate
   * @method findHighlights
   * @param {Function} predicate
   * @private
   */
  findHighlights(predicate) {
    let filter = node => { return predicate(node) && node.type == 'tag' && tagName(node.domNode) === 'mark'; };
    return flatMap(this.get('richNode'), filter);
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
    debug(`inserting ${text} at ${position}`);
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
      debug(get(textNode,'domNode'));
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
    this.generateDiffEvents.perform();
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
        let filter = node => node.start <= position && node.end >= position && ! isVoidElement(node.domNode) && ! isIgnorableElement(node.domNode && node.type !== 'other');
        let nodesContainingPosition = flatMap(node, filter);
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
    let richNode = NodeWalker
        .create({
          createRichNode( content ) {
            const newObject = Object.assign( {}, content );
            newObject.get = ( name ) => newObject[name];
            return newObject;
          },
          set( object, key, value ) {
            object[key] = value;
          }
        })
        .processDomNode(this.get('rootNode'));
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
    debug(`trying to set current selection to ${position} ${position}`);
    let richNode = this.get('richNode');
    if (get(richNode, 'end') < position || get(richNode, 'start') > position) {
      warn(`received invalid position, resetting to ${get(richNode,'end')} end of document`, {id: 'contenteditable-editor.invalid-position'});
      position = get(richNode, 'end');
    }
    let node = this.findSuitableNodeForPosition(position);
    debug(`selection in node of type ${node.type} [${node.start}, ${node.end}]`);
    this.moveCaretInTextNode(get(node,'domNode'), position - node.start);
    this.set('currentNode', node.domNode);
    this.set('currentSelection', [ position, position ]);
    if (notify)
      forgivingAction('selectionUpdate', this)(this.currentSelection);
  },

  getRelativeCursorPostion(){
    let currentRichNode = this.getRichNodeFor(this.currentNode);
    let absolutePos = this.currentSelection[0];
    return absolutePos -currentRichNode.start;
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
  setCarret(node, offset) {
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
        this.set('currentNode', node);
        const richNodeBeforeCarret = richNode.children[offset-1];
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
        const absolutePosition = richNodeAfterCarret.start;
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
    yield timeout(100);
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
      forgivingAction('handleFullContentUpdate', this)(extraInfo);
    }
  }).keepLatest()
});

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                                              (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                                             );
}
export default RawEditor;
