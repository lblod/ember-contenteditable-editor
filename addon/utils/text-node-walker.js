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
