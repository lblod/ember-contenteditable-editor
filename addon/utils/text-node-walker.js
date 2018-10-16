import { get, set } from '@ember/object';
import NodeWalker from './node-walker';
import { typeOf } from '@ember/utils';

/**
 * Node walker producing the text content of the nodes
 *
 * @module contenteditable-editor
 * @class TextNodeWalker
 * @constructor
 * @extends NodeWalker
 */
const TextNodeWalker = NodeWalker.extend( {
  finishChildSteps( richNode ) {
    let myText = "";
    richNode.children.map( (child) => {
      if (typeOf(get(child, 'text')) === "string")
        myText += get(child, 'text');
    } );
    set( richNode, 'text', myText );
  },
  // Use simple nodes
  createRichNode( content ) {
    const newObject = Object.assign( {}, content );
    newObject.get = ( name ) => newObject[name];
    return newObject;
  },
  set( object, key, value ) {
    object[key] = value;
  }
} );

function getTextContent( node ) {
  return get(
    TextNodeWalker.create({}).processDomNode( node ),
    'text'
  );
}

export { getTextContent };

export default TextNodeWalker;
