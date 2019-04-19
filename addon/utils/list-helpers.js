import { invisibleSpace, isDisplayedAsBlock, isList } from './dom-helpers';
import { warn } from '@ember/debug';

/**
 * Handlers for list action.
 *
 * - It works only when current node is a textNode
 * - The general flow is dependent on two situation types:
 *     a. Either the current node is already in al list when this action is fired.
 *         (see further notes for wat it basically means 'being in a list')
 *     b. Not in a list, create a new list
 *
 * TODO
 * ----
 *  - cursor positonining is uncontrolled right now, after action handled.
 *  - Decent insertTextNode for cursor: find best guess on when to this.
 *  - block decent support unindent.
 *  - clean up
 *  - case 20 in dummy app does not work
 *  - indenting
 *      <li> felix <div> this | node </div> </li> should be
 *      <li> felix <ul><li><div> this | node </div></li></ul></li> should be
 */

/**
 * handles unordered list
 */
const unorderedListAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isTextNode(currentNode)){
    warn('Lists only supported for textNodes', {id: 'list-helpers:unorderedListAction'});
    return;
  }

  let handleAction = () => {
    if(isInList(currentNode)){
      let nestedContextHandler = getNestedContextHandler(currentNode, unorderedListAction);
      nestedContextHandler(rawEditor, currentNode);
      return;
    }
    insertNewList(rawEditor, currentNode);
  };

  rawEditor.externalDomUpdate('handle unorderedListAction', handleAction);
};

/**
 * handles ordered list
 */
const orderedListAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isTextNode(currentNode)){
    warn('Lists only supported for textNodes', {id: 'list-helpers:orderedListAction'});
    return;
  }

  let handleAction = () => {
    if(isInList(currentNode)){
      let nestedContextHandler = getNestedContextHandler(currentNode, orderedListAction);
      nestedContextHandler(rawEditor, currentNode);
      return;
    }
    insertNewList(rawEditor, currentNode, 'ol');
  };

  rawEditor.externalDomUpdate('handle orderedListAction', handleAction);
};


/**
 * handles indent Action
 */
const indentAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isTextNode(currentNode)){
    warn('Indent only supported for textNodes', {id: 'list-helpers:indentAction'});
    return;
  }

  let handleAction = () => {
    if(!isInList(currentNode)){
      warn('Indent only supported in context of list', {id: 'list-helpers:indentAction'});
      return;
    }
    let currLI = getParentLI(currentNode);
    let currlistE = currLI.parentNode;
    let currlistType = getListTagName(currlistE);
    insertNewList(rawEditor, currentNode, currlistType);
  };

  rawEditor.externalDomUpdate('handle indentAction', handleAction);
};


/**
 * handles unindent Action
 */
const unindentAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isTextNode(currentNode)){
    warn('UnindentAction only supported for textNodes', {id: 'list-helpers:unindentAction'});
    return;
  }

  let handleAction = () => {
    if(!isInList(currentNode)){
      warn('Indent only supported in context of list', {id: 'list-helpers:unindentAction'});
    }
    unwrapLIAndSplitList(rawEditor, currentNode);
  };

  rawEditor.externalDomUpdate('handle unindentAction', handleAction);
};

/***************************************************
 * HELPERS
 ***************************************************/


/***************************************************
 * Checks whether node is in a list
 *
 *   EXAMPLES NOT IN A LIST
 *   ----------------------
 *   The '|' represents the cursor and gives an idea about the currentNode.
 *
 *   ```
 *   | a some text
 *   ```
 *
 *    ```
 *    a some <span> t | ext </span>
 *    ```
 *
 *   EXAMPLES IN A LIST
 *   ------------------
 *
 *    ```
 *    <ul>
 *     <li> a some <div> block element text | </div>  other text </li>
 *    </ul>
 *    ```
 *
 *   ```
 *   <ul>
 *    <li> a some <div> text </div>  other text </li>
 *    <li>  other text | </li>
 *   </ul>
 *
 *   ```
 *
 *   ```
 *   <ul>
 *     <li> a some <div> text </div>  other text other text |</li>
 *   </ul>
 *   ```
 *
 *   ```
 *   <ul>
 *     <li> some text
 *         <a href="#">an <i> italic | </i> link</a>
 *     </li>
 *   </ul>
 *   ```
 ***************************************************/
const isInList = ( node ) => {
  let currNode = node.parentNode;
  while(currNode){

    if(isLI(currNode)) return true;

    currNode = currNode.parentNode;
  }

  return false;
};


/***************************************************
 * Inserts a new list.
 *
 *  TODOS
 *  -----
 *    - handle line breaks as proper separator of LI content (see case 4)
 *    - Cursor positioning is weird
 *    - The ending textNode issue is not properly tackeled
 *
 *   EXAMPLES
 *   --------
 *   The '|' represents the cursor and gives an idea about the currentNode.
 *
 *   case 1
 *   ------
 *
 *   ```
 *   | a some text
 *   ```
 *   ```
 *   <ul>
 *     <li>| a some text</li>
 *   </ul>
 *   ```
 *
 *    ```
 *    a some <span> t | ext </span>
 *    ```
 *
 *   case 2
 *   ------
 *
 *   ```
 *   a some <span> t | ext </span>
 *   ```
 *   ```
 *   <ul>
 *     <li>a some <span> t | ext </span></li>
 *   </ul>
 *   ```
 *
 *   case 3
 *   ------
 *
 *   ```
 *    <ul>
 *     <li> a some <div> block element text | </div>  other text </li>
 *    </ul>
 *   ```
 *   ```
 *    <ul>
 *      <li> a some
 *        <div>
 *          <ul>
 *            <li> block element text | </li>
 *          </ul>
 *        </div>
 *        other text
 *      </li>
 *    </ul>
 *   ```
 *
 *    case 4
 *    ------
 *    ```
 *    A case |- with br-tag <br> new line. <br> we Will need to refine this.
 *    ```
 *
 *    ```
 *    <ul>
 *      <li>A case |- with br-tag <br> new line. <br> we Will need to refine this.</li>
 *    </ul>
 *    ```
 ***************************************************/
const insertNewList = ( rawEditor, currentNode, listType = 'ul' ) => {
  let liContentNodes = growLIContentFromNode(currentNode);
  let listELocationRef = liContentNodes[0];

  let listE = document.createElement(listType);
  let li = document.createElement('li');
  listE.append(li);

  let parent = listELocationRef.parentNode;

  if(!parent){
    warn('Lists assume a parent node', {id: 'list-helpers:insertNewList'});
    return;
  }

  parent.insertBefore(listE, listELocationRef);
  // provide a text node after the list
  //TODO: do we really need to do this here? Can it be more sublte?
  parent.insertBefore(document.createTextNode(invisibleSpace), listELocationRef);
  liContentNodes.forEach(n => li.appendChild(n));

  //Editor state update
  rawEditor.updateRichNode();
};

/***************************************************
 * Unwraps list content from an LI from a list wiht multiple LI's and splits the list.
 *
 *  TODOS
 *  -----
 *    - Cursors positioning is weird
 *    - The ending textNode issue is not properly tackeled
 *
 *   EXAMPLES
 *   --------
 *   The '|' represents the cursor and gives an idea about the currentNode.
 *
 *   case 1
 *   ------
 *
 *   ```
 *   <ul>
 *     <li> The first </li>
 *     <li>| a some text</li>
 *     <li> the last </li>
 *   </ul>
 *   ```
 *
 *    ```
 *   <ul>
 *    <li> The first </li>
 *   </ul>
 *   | a some text
 *   <ul>
 *     <li> the last </li>
 *   </ul>
 *    ```
 *   case 2
 *   ------
 *
 *   ```
 *   <ul>
 *     <li>| a some text</li>
 *   </ul>
 *   ```
 *
 *    ```
 *    a some <span> t | ext </span>
 *    ```
 *
 *   case 3
 *   ------
 *
 *   ```
 *    <ul>
 *     <li> a | some <div> block element text </div>  other text </li>
 *    </ul>
 *   ```
 *   ```
 *    <ul>
 *     <li> <div> block element text </div>  other text </li>
 *    </ul>
 *    a | some
 *   ```
*
 *   case 4
 *   ------
 *
 *   ```
 *    <ul>
 *      <li> item 1</li>
 *     <li>
 *       <ul>
 *          <li> subitem 1</li>
 *          <li> subitem | 2 </li>
 *          <li> subitem 3</li>
 *       </ul>
 *     </li>
 *     <li> item 2</li>
 *    </ul>
 *   ```
 *   ```
 *    <ul>
 *      <li> item 1</li>
 *     <li>
 *       <ul>
 *          <li> subitem 1</li>
 *       </ul>
 *     </li>
 *     <li> subitem | 2 </li>
 *     <li>
 *       <ul>
 *          <li> subitem 3</li>
 *       </ul>
 *     </li>
 *     <li> item 2</li>
 *    </ul>
 *   ```
 ***************************************************/
const unwrapLIAndSplitList = ( rawEditor, currentNode ) => {

  let currLI = getParentLI(currentNode);
  let listE = currLI.parentNode;
  let listType = getListTagName(listE);
  let parentE = listE.parentNode;
  let allLIs = [...listE.children];

  if(!currLI || !listE || !parentE){
    warn('No wrapping LI/List/Parent of list found!', {id: 'list-helpers:unwrapLIAndSplitList'});
    return;
  }

  let LIsBefore =  [];
  let LIsAfter = [];
  let listToUpdate = LIsBefore;
  for(var e of allLIs){
    if(e.isSameNode(currLI)){
      listToUpdate = LIsAfter;
      continue;
    }
    listToUpdate.push(e);
  };


  //SPLIT LI: Make sure this happens:
  //    ```
  //     <ul><li> felix <div>foo</div> ruiz | <div>other div text </div></li></ul>
  //     ```
  // to
  //     ```
  //       <ul><li> felix <div>foo</div></li></ul>
  //         ruiz |
  //       <ul><div>other div text </div></li></ul>
  //     ```
  let LINodesToUnwrap = growLIContentFromNode(currentNode);
  let currLiNodes = [...currLI.childNodes];
  let LINodesBefore = [];
  let LINodesAfter = [];
  let nodeListToUpdate = LINodesBefore;

  for(var liN of currLiNodes){
    if(LINodesToUnwrap.some(n => n.isSameNode(liN))){
      currLI.removeChild(liN);
      nodeListToUpdate = LINodesAfter;
      continue;
    }
    nodeListToUpdate.push(liN);
  }

  if(LINodesBefore.length > 0){
    let li = document.createElement('li');
    LINodesBefore.forEach(n => li.appendChild(n));
    LIsBefore.push(li);
  }

  if(LINodesAfter.length > 0){
    let li = document.createElement('li');
    LINodesAfter.forEach(n => li.appendChild(n));
    LIsAfter.push(li);
  }

  //END SPLIT LI

  if(!isInList(listE)){
    unwrapLI(listType, LIsBefore, LINodesToUnwrap, LIsAfter, parentE, listE);
  }
  else{
    unwrapNestedLI(listType, LIsBefore, LINodesToUnwrap, LIsAfter, parentE, listE);
  }
  rawEditor.updateRichNode();
};


/***************************************************
 * Switches list type where currentNode is situatued in.
 *
 *  TODOS
 *  -----
 *    - Cursors positioning is weird
 *    - The ending textNode issue is not properly tackeled
 *
 *   EXAMPLES
 *   --------
 *   The '|' represents the cursor and gives an idea about the currentNode.
 *
 *   case 1
 *   ------
 *
 *   ```
 *   <ul>
 *     <li> The first </li>
 *     <li>| a some text</li>
 *     <li> the last </li>
 *   </ul>
 *   ```
 *
 *   ```
 *   <ol>
 *     <li> The first </li>
 *     <li>| a some text</li>
 *     <li> the last </li>
 *   </ol>
 *   ```
 ****************************************************/
const shuffleListType = ( rawEditor, currentNode) => {
  let currLI = getParentLI(currentNode);
  let currlistE = currLI.parentNode;
  let currlistType = getListTagName(currlistE);
  let targetListType = currlistType == 'ul'?'ol':'ul';
  let parentE = currlistE.parentNode;
  let allLIs = [...currlistE.children];

  let listE = document.createElement(targetListType);
  allLIs.forEach(li => listE.append(li));

  parentE.insertBefore(listE, currlistE);
  // provide a text node after the list
  //TODO: do we really need to do this here? Can it be more sublte?
  parentE.insertBefore(document.createTextNode(invisibleSpace), currlistE);
  parentE.removeChild(currlistE);

  //Editor state update
  rawEditor.updateRichNode();
};

/***************************************************
 * UTILS
 ***************************************************/


/***************************************************
 * dispatch function to get the proper nested
 * context handler,
 * depending on what the context looks like
 ***************************************************/
const getNestedContextHandler = ( node, listAction ) => {
  let li = getParentLI(node);
  let listE = li.parentElement;

  if(!listE){
    return () => { warn('unsupported nested context.', {id: 'list-helpers:getNestedContextHandler'});};
  }

  if(!isListActionConsistentWithCurrentList(listE, listAction)){
    return shuffleListType;
  }

  return unwrapLIAndSplitList;
};

const isListActionConsistentWithCurrentList = ( listE, listAction ) => {
  let listType = getListTagName(listE);
  if(listType == 'ul' && listAction == unorderedListAction){
    return true;
  }
  if(listType == 'ol' && listAction == orderedListAction){
    return true;
  }
  return false;
};

/***************************************************
 * Gets first Parent LI or none
 ***************************************************/
const getParentLI = (node) => {
  if(!node.parentNode) return null;
  if(isLI(node.parentNode)) return node.parentNode;
  return getParentLI(node.parentNode);
};

const isLI = ( node ) => {
    return node.nodeType === node.ELEMENT_NODE && ['li'].includes(node.tagName.toLowerCase());
};

const isTextNode = ( node ) => {
  return node.nodeType === Node.TEXT_NODE;
};

const getListTagName = ( listElement ) => {
  return ['ul'].includes(listElement.tagName.toLowerCase()) ? 'ul' : 'ol';
};

/***********************************************
 * Give a node, we want to grow a region (a list of nodes)
 * we consider sensible to insert as content for an LI.
 *
 * CURRENT IMPLEMENTATION
 * ----------------------
 *
 * Best to use an example. "|" is cursor.
 * ```
 * <p>
 *  bla bal <span><a href="#"> foo | <br></a> test <div> a block </div>
 * </p>
 * ```
 *
 *  The region we return.
 *
 *  ```
 *  bla bal <span><a href="#"> foo | <br></a> test
 *  ```
 */
const growLIContentFromNode = ( node ) => {

  let baseNode = returnParentNodeBeforeBlockElement(node);

  //left and right adjacent siblings should be added until we hit a block node.
  return growNeighbouringSiblingsUntil(isDisplayedAsBlock, baseNode);
};

/***********************************************
 * Walk up the parents until a blockElement is matched.
 * return the node of wich the parent is the matching
 * block element
 ************************************************/
const returnParentNodeBeforeBlockElement = ( node ) => {
  if(!node.parentNode) return node;

  if(isDisplayedAsBlock(node.parentNode)) {
    return node;
  }

  return returnParentNodeBeforeBlockElement(node.parentNode);
};

/***********************************************
 * Give a node, we want to grow a region (a list of sibling nodes)
 * until we match a condition
 ************************************************/
const growNeighbouringSiblingsUntil = ( condition, node ) => {
  let nodes = [];
  let currNode = node;

  //lefties
  while(currNode){
    if(condition(currNode)){
      break;
    }
    nodes.push(currNode);
    currNode = currNode.previousSibling ;
  }

  nodes.reverse();

  //righties
  currNode = node.nextSibling;
  while(currNode){
    if(condition(currNode)){
      break;
    }
    nodes.push(currNode);
    currNode = currNode.nextSibling;
  }
  return nodes;
};

const unwrapNestedLI = ( listType, LIsBefore, unwrappedLINodes, LIsAfter, parentE, listE ) => {
  let listInLIBefore = null;

  if(LIsBefore.length > 0){
    let listBefore =  document.createElement(listType);
    LIsBefore.forEach(li => listBefore.append(li));
    listInLIBefore = document.createElement('li');
    listInLIBefore.appendChild(listBefore);
  }

  let newLIContent = null;

  if(unwrappedLINodes.length > 0){
    newLIContent = document.createElement('li');
    unwrappedLINodes.forEach(n => newLIContent.appendChild(n));
  }

  let listInLIAfter = null;

  if(LIsAfter.length > 0){
    let listAfter =  document.createElement(listType);
    LIsAfter.forEach(li => listAfter.append(li));
    listInLIAfter = document.createElement('li');
    listInLIAfter.appendChild(listAfter);
  }

  let parentList = parentE.parentNode; //TODO check if there
  if(listInLIBefore){
    parentList.insertBefore(listInLIBefore, parentE);
  }

  if(newLIContent){
    parentList.insertBefore(newLIContent, parentE);
  }

  if(listInLIAfter){
    parentList.insertBefore(listInLIAfter, parentE);
  }

  // provide a text node after the list
  //TODO: do we really need to do this here?
  parentList.removeChild(parentE);

};

const unwrapLI = ( listType, LIsBefore, unwrappedLINodes, LIsAfter, parentE, listE ) => {
  let listBefore = null;

  if(LIsBefore.length > 0){
    listBefore =  document.createElement(listType);
    LIsBefore.forEach(li => listBefore.append(li));
  }

  //unwrap
  //TODO: check if content!!!
  let allNodesInLI = unwrappedLINodes;

  let listAfter = null;

  if(LIsAfter.length > 0){
    listAfter = document.createElement(listType);
    LIsAfter.forEach(li => listAfter.append(li));
  }

  if(listBefore){
    parentE.insertBefore(listBefore, listE);
  }

  allNodesInLI.forEach(n => parentE.insertBefore(n, listE));

  if(listAfter){
    parentE.insertBefore(listAfter, listE);
  }

  // provide a text node after the list
  //TODO: do we really need to do this here?
  parentE.insertBefore(document.createTextNode(invisibleSpace), listE);
  parentE.removeChild(listE);
};

export { unorderedListAction, orderedListAction, indentAction, unindentAction }
