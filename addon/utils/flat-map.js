/**
 * takes a tree and returns a list of nodes that match the given predicate
 *
 * @method flatMap
 *
 * @param {RichNode} RichNode
 * @param {Function} predicate
 * @param {Boolean} stopOnFirstMatch
 *
 * @return [Array] list of nodes matching the predicate function
 */
export default function flatMap(node, predicate) {
  let matches = [];

  let currentScan;
  let nextScan = [node];

  while( nextScan.length ){
    currentScan = nextScan;
    nextScan = [];

    currentScan.forEach( (node) => {
      if (predicate(node))
        matches.push(node);

      if (node.children)
        nextScan.push( ...node.children );
    } );
  }

  return matches;
}
