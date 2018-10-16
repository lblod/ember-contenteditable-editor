import { get } from '@ember/object';
import { set } from '@ember/object';
import { computed } from '@ember/object';
import EmberObject from '@ember/object';
import { isVoidElement, tagName } from './dom-helpers';


/**
 * DOM tree walker producing RichNodes
 *
 * @module editor-core
 * @class NodeWalker
 * @constructor
 * @extends EmberObject
 */
const NodeWalker = EmberObject.extend({
  /**
   * Processes a single dom node.
   */
  processDomNode( domNode, parentNode, start = 0 ) {
    const myStart = (parentNode && parentNode.end) || start;
    const richNode = this.createRichNode({
      domNode: domNode,
      parent: parentNode,
      start: myStart,
      end: myStart,
      type: this.detectDomNodeType( domNode )
    });

    // For tags, recursively analyse the children
    if (richNode.type === 'tag') {
      return this.processTagNode( richNode );
    }
    // For text nodes, add the content and update the index
    else if (richNode.type === 'text') {
      return this.processTextNode( richNode );
    }
    // For comment nodes, set update the index
    else { // if (get( 'type') == 'other')
      return this.processOtherNode( richNode );
    }
  },

  /**
   * Called when stepping into a child Dom node
   */
  stepInDomNode( richNode, childDomNode ) {
    return this.processDomNode( childDomNode, richNode );
  },

  /**
   * Steps from one (or no) child node to the next.
   */
  stepNextDomNode( richNode , nextDomChildren ) {
    const [ firstChild, ...nextChildren ] = nextDomChildren;
    if (firstChild) {
      const richChildNode = this.stepInDomNode( richNode, firstChild );
      this.set( richNode, 'end', richChildNode.end );
      if ( nextChildren.length )
        return [ richChildNode, ...this.stepNextDomNode( richNode, nextChildren ) ];
      else
        return [ richChildNode ];
    }
    else return [];
  },

  /**
   * Called when finishing the processing of all the child nodes.
   */
  /*eslint no-unused-vars: ["error", { "args": "none" }]*/
  finishChildSteps( richNode ) {
    return;
  },

  /**
   * Processes a single rich text node
   */
  processTextNode( richNode ) {
    const domNode = richNode.domNode;
    const start = richNode.start;
    let text = domNode.textContent;
    this.set(richNode, 'text', text);
    this.set(richNode, 'end', start + text.length);
    return richNode;
  },

  /**
   * Processes a single rich tag
   */
  processTagNode( richNode ) {
    if( !isVoidElement( richNode.domNode ) ) {
      // Void elements are elements which cannot contain any contents.
      // They don't have an internal text, but may have other meaning.
      return this.processRegularTagNode( richNode );
    } else {
      // Regular tags are all common tags.  This is the standard case
      // where we can consider the item's content.
      return this.processVoidTagNode( richNode );
    }
  },

  processRegularTagNode( richNode ) {
    this.set(richNode, 'end', richNode.start); // end will be updated during run
    const domNode = richNode.domNode;
    const childDomNodes = domNode.childNodes ? domNode.childNodes : [];
    this.set(richNode, 'children',
        this.stepNextDomNode( richNode, childDomNodes ));
    this.finishChildSteps( richNode );
    return richNode;
  },

  /**
   * Processes a void tag node.
   *
   * Currently has support for two common types of nodes: IMG and BR.
   * The BR is replaced by a "\n" symbol.  Other tags are currently
   * replaced by a space.
   *
   * TODO: This code path is experimental.  We know this may cause
   * various problems and intend to remove it.
   */
  processVoidTagNode( richNode ) {
    const start = richNode.start;
    let text;
    if( tagName( richNode.domNode ) == "br" ) {
      text = "\n";
    } else {
      text = " ";
    }
    this.set(richNode, 'text', text);
    this.set(richNode, 'end', start + text.length);
    return richNode;
  },

  /**
   * Processes a single comment node
   */
  processOtherNode( richNode ) {
    const start = richNode.start;
    this.set(richNode, 'end', start);
    return richNode;
  },

  /**
   * Detects the type of a DOM node
   */
  detectDomNodeType( domNode ) {
    if (domNode.nodeType === Node.ELEMENT_NODE)
      return 'tag';
    else if (domNode.nodeType !== Node.COMMENT_NODE)
      return 'text';
    else
      return 'other';
  },

  /**
   * Creates a rich node.
   *
   * You can override this method in order to add content to
   * the rich text nodes.
   */
  createRichNode( content ) {
    return RichNode.create(content);

    // const newObject = Object.assign( {}, content );
    // newObject.get = ( name ) => newObject[name];
    // return newObject;
  },

  set( object, key, value ) {
    set( object, key, value );
    // object[key] = value;
  }
});


/**
 * Represents an enriched DOM node.
 *
 * The DOM node is available in the 'domNode' property.
 *
 * @module editor-core
 * @class RichNode
 * @constructor
 * @extends EmberObject
 */
const RichNode = EmberObject.extend({
  domNode: undefined,
  start: undefined,
  end: undefined,
  children: undefined,
  parent: undefined,
  type: undefined,
  text: undefined,
  region: computed('start', 'end', function(){
    const start = this.start;
    const end = this.end;

    return [ start, end || start ];
  }),
  length: computed('start', 'end', function(){
    const end = this.end || 0;
    const start = this.start || 0;
    const diff = Math.max( 0, end - start );
    return diff;
  }),
  isInRegion(start, end) {
    return this.start >= start && this.end <= end;
  },
  isPartiallyInRegion(start, end) {
    return ( this.start >= start && this.start < end )
      || ( this.end > start && this.end <= end );
  }
});

export default NodeWalker;
export { RichNode };
