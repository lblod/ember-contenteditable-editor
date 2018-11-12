import { A } from '@ember/array';
/**
 * @module contenteditable-editor/dom
 */

/**
 * @property invisibleSpace
 * @type string
 * @for contenteditable-editor/dom
 * @static
 * @final
 */
const invisibleSpace = '\u200B';

/**
 * dom helper to insert extra text into a text node at the provided position
 *
 * @method sliceTextIntoTextNode
 * @static
 * @for contenteditable-editor/dom
 * @param {TextNode} textNode
 * @param {String} text
 * @param {number} start
 * @public
 */
const sliceTextIntoTextNode =  function sliceTextIntoTextNode(textNode, text, start) {
  let textContent = textNode.textContent;
  let content = [];
  content.push(textContent.slice(0, start));
  content.push(text);
  content.push(textContent.slice(start));
  textNode.textContent = content.join('');
};

const insertTextNodeWithSpace = function(parentDomNode, relativeToSibling = null, after = false) {
  let textNode = document.createTextNode(invisibleSpace);
  if (relativeToSibling) {
    if (after) {
      insertNodeBAfterNodeA(parentDomNode, relativeToSibling, textNode);
    }
    else {
      parentDomNode.insertBefore(textNode, relativeToSibling);
    }
  }
  else {
    parentDomNode.appendChild(textNode);
  }
  return textNode;
};
/**
 * dom helper to remove a node from the dom tree
 * this inserts replaces the node with its child nodes
 *
 * @method removeNodeFromTree
 * @static
 * @param {DOMNode} node
 * @public
 */
const removeNodeFromTree = function removeNodeFromTree(node) {
  let parent = node.parentNode;
  let baseNode = node;
  while (node.childNodes && node.childNodes.length > 0) {
    let nodeToInsert = node.childNodes[node.childNodes.length - 1];
    parent.insertBefore(nodeToInsert, baseNode);
    baseNode = nodeToInsert;
  }
  parent.removeChild(node);
};

/**
 * polyfill for ChildNode.remove. Removes node and children from tree.
 *
 * @method removeNodeFrom
 * @static
 * @param {DOMNode} node
 * @public
 */
const removeNode = function removeNode(node){
  let parent = node.parentNode;
  if(parent)
    parent.removeChild(node);
};

/**
 * dom helper to check whether a node is a "void element"
 * https://www.w3.org/TR/html/syntax.html#void-elements
 *
 * @method isVoidElement
 * @static
 * @param {DOMNode} node
 * @return {boolean}
 * @public
 */
const isVoidElement = function isVoidElement(node) {
  return node.nodeType === Node.ELEMENT_NODE && /^(AREA|BASE|BR|COL|COMMAND|EMBED|HR|IMG|INPUT|KEYGEN|LINK|META|PARAM|SOURCE|TRACK|WBR)$/i.test(node.tagName);
};

const isDisplayedAsBlock = function(domNode) {
  if (domNode.nodeType !== Node.ELEMENT_NODE)
    return false;
  const displayStyle = window.getComputedStyle(domNode)['display'];
  return displayStyle == 'block' || displayStyle == 'list-item';
}

/**
 * agressive splitting specifically for content in an li
 * @method smartSplitTextNode
 * @static
 * @public
 */
const smartSplitTextNode = function(textNode, splitAt) {
  let parent = textNode.parentNode;
  let grandParent = parent.parentNode;
  let firstTextNode = document.createTextNode(textNode.textContent.slice(0, splitAt));
  let lastTextNode = document.createTextNode(textNode.textContent.slice(splitAt));
  let extraParent = parent.cloneNode(false);
  parent.replaceChild(firstTextNode, textNode);
  insertNodeBAfterNodeA(grandParent, parent, extraParent);
  extraParent.appendChild(lastTextNode);
  return [parent, extraParent];
};

/** list helpers **/
function isList(node) {
  return node.nodeType === node.ELEMENT_NODE && ['ul','ol'].includes(node.tagName.toLowerCase());
}

function siblingLis(node) {
  const lis = A();
  if (node.parentNode) {
    node.parentNode.childNodes.forEach( (el) => {
      if (tagName(el) === 'li')
        lis.pushObject(el);
    });
  }
  return lis;
}

function isEmptyList(node) {
  if( ! isList ) {
    return false;
  }
  //sometimes lists may contain other stuff then li, if so we ignore this because illegal
  for(var x = 1; x < node.children.length; x++) {
      if (tagName(node.children[x]) === 'li') {
        return false;
      }
  }
  return true;
}

const isIgnorableElement = function isIgnorableElement(node) {
  return node.nodeType === Node.TEXT_NODE && node.parentNode && tagName(node.parentNode) === "ul";
};

const insertNodeBAfterNodeA = function(parent, nodeA, nodeB) {
  parent.replaceChild(nodeB, nodeA);
  parent.insertBefore(nodeA, nodeB);
};

const tagName = function(node) {
  if(!node) return '';
  return node.nodeType === node.ELEMENT_NODE ? node.tagName.toLowerCase() : '';
};

/**
 * given html string, convert it into DomElements
 * @function createElementsFromHtml
 * @param {String} string containing html
 * @static
 * @public
 */
const createElementsFromHTML = function(htmlString){
  let div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return Array.from(div.childNodes);
};

export {
  tagName,
  isDisplayedAsBlock,
  smartSplitTextNode,
  invisibleSpace,
  insertTextNodeWithSpace,
  isList,
  isEmptyList,
  insertNodeBAfterNodeA,
  sliceTextIntoTextNode,
  removeNodeFromTree,
  removeNode,
  isVoidElement,
  isIgnorableElement,
  createElementsFromHTML,
  siblingLis
};
