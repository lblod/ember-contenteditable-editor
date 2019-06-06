import RichNode from '@lblod/marawa/rich-node';

function replaceRichNodeWith(richNode, richNodes) {
  console.log('replacing richnode');
  const parent = richNode.parent;
  const indexOfRichNode = parent.children.indexOf(richNode);
  for (let node of richNodes) {
    node.parent = parent;
  }
  parent.children.splice(indexOfRichNode, 1, ...richNodes);
}

function wrapRichNode(richNode, wrappingdomNode) {
  console.log('wrapping rich node');
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
  console.log('unwrapping rich node');
  replaceRichNodeWith(richNode, richNode.children);
}

export { replaceRichNodeWith, wrapRichNode, unwrapRichNode };
