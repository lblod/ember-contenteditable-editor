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
  let list = [];
  if (predicate(node))
    list.push(node);
  if (node.children)
    node.children.forEach((child) => list = list.concat(flatMap(child, predicate)));
  return list;
}
