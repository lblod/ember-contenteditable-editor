import RichNode from '@lblod/marawa/rich-node';

function replaceRichNodeWith(richNode, richNodes) {
  const parent = richNode.parent;
  const indexOfRichNode = parent.children.indexOf(richNode);
  for (let node of richNodes) {
    node.parent = parent;
  }
  parent.children.splice(indexOfRichNode, 1, ...richNodes);
}

function wrapRichNode(richNode, wrappingdomNode) {
  const wrappingRichNode = new RichNode({
    domNode: wrappingdomNode,
    parent: richNode.parent,
    children: [richNode],
    start: richNode.start,
    end: richNode.end,
    type: "tag"
  });
  richNode.parent = wrappingRichNode;
}


function unwrapRichNode(richNode) {
  replaceRichNodeWith(richNode, richNode.children);
}

export { replaceRichNodeWith, wrapRichNode, unwrapRichNode };
