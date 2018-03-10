import flatMap from './flat-map';
import { warn } from '@ember/debug';
import { get } from '@ember/object';

export default function getRichNodeMatchingDomNode(domNode, tree) {
  if (!tree)
    throw new Error('invalid argument');
  if (!domNode) {
    warn("getRichNodeMatchingDomNode: no domNode provided", { id: "utils.no-matching-node-in-tree" });
    return null;
  }
  let nodeList = flatMap(tree, function(richNode) { return get(richNode, 'domNode').isSameNode(domNode);});
  if (nodeList.length == 1) {
    return nodeList[0];
  }
  else {
    warn("getRichNodeMatchingDomNode: no matching node found in tree", { id: "utils.no-matching-node-in-tree" });
    return null;
  }
}
