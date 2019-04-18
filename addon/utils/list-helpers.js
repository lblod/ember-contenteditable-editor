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
 * - cursor positonining is uncontrolled right now, after action handled.
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
      let nestedContextHandler = getNestedContextHandler(currentNode);
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
      let nestedContextHandler = getNestedContextHandler(currentNode);
      nestedContextHandler(rawEditor, currentNode);
      return;
    }
    insertNewList(rawEditor, currentNode, 'ol');
  };

  rawEditor.externalDomUpdate('handle orderedListAction', handleAction);
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
 *    (less trivial)
 *
 *    ```
 *    <ul>
 *     <li> a some <div> block element text | </div>  other text </li>
 *    </ul>
 *    ```
 *
 *   EXAMPLES IN A LIST
 *   ------------------
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

    if(isDisplayedAsBlock(currNode)) return false;

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
 * Unwraps list content from an LI from a list with one single element.
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
 *    <ul>
 *     <li> a | some <div> block element text, this might seem weird, TBD </div>  other text </li>
 *    </ul>
 *   ```
 *   ```
 *    a | some <div> block element text, this might seem weird, TBD </div>  other text
 *   ```
 *
 ***************************************************/
const unwrapListFromSingleLI = ( rawEditor, currentNode ) => {
  let currLI = getParentLI(currentNode);
  let listE = currLI.parentNode;
  let parentE = listE.parentNode;
  if(!currLI || !listE || !parentE){
    warn('No wrapping LI/List/Parent of list found!', {id: 'list-helpers:unwrapListFromSingleLI'});
    return;
  }

  let allNodesInLI = [...currLI.childNodes]; //make sure you have a copy of array
  allNodesInLI.forEach(n => parentE.insertBefore(n, listE));

  // provide a text node after the list
  //TODO: do we really need to do this here?
  parentE.insertBefore(document.createTextNode(invisibleSpace), listE);
  parentE.removeChild(listE);

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

  let ulBefore = null;

  if(LIsBefore.length > 0){
    ulBefore =  document.createElement(listType);
    LIsBefore.forEach(li => ulBefore.append(li));
  }

 //unwrap
 let allNodesInLI = [...currLI.childNodes]; //make sure you have a copy of array

  let ulAfter = null;
  if(LIsAfter.length > 0){
    ulAfter = document.createElement(listType);
    LIsAfter.forEach(li => ulAfter.append(li));
  }

  if(ulBefore){
    parentE.insertBefore(ulBefore, listE);
  }

  allNodesInLI.forEach(n => parentE.insertBefore(n, listE));

  if(ulAfter){
    parentE.insertBefore(ulAfter, listE);
  }
  // provide a text node after the list
  //TODO: do we really need to do this here?
  parentE.insertBefore(document.createTextNode(invisibleSpace), listE);
  parentE.removeChild(listE);

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
const getNestedContextHandler = (node) => {
  if(isOnlyLI(getParentLI(node))) return unwrapListFromSingleLI;
  if(!isOnlyLI(getParentLI(node))) return unwrapLIAndSplitList;
  return () => { warn('unsupported nested context.', {id: 'list-helpers:getNestedContextHandler'});};
};

/***************************************************
 * Gets first Parent LI or none
 ***************************************************/
const getParentLI = (node) => {
  if(!node.parentNode) return null;
  if(isLI(node.parentNode)) return node.parentNode;
  return getParentLI(node.parentNode);
};


/***************************************************
 * For an LI checks if this is the only one in List
 ***************************************************/
const isOnlyLI = (node) => {
  return isLI(node) && node.parentElement && isList(node.parentElement) && node.parentElement.childElementCount == 1;
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

export { unorderedListAction, orderedListAction }
