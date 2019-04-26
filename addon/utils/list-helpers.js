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
 *  - some times empty textnodes are not included in logicalBlock. Probably an issue with the conditoin isDisplayedAsBlock
 *
 * IMPLEMENTED BEHAVIOUR
 * ---------------------
 *   The '|' represents the cursor and gives an idea about the currentNode.
 *
 *  Some examples
 *
 *   case 1
 *   ------
 *   Call unorderedListAction x 1
 *   ```
 *   | a some text
 *   ```
 *   ```
 *   <ul>
 *     <li>| a some text</li>
 *   </ul>
 *   ```
 *
 *   case 2
 *   ------
 *   Call unorderedListAction x 1
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
 *   Call indent x 1
 *   ```
 *    <ul>
 *     <li> a some <div> block element text | </div>  other text </li>
 *    </ul>
 *   ```
 *   ```
 *    <ul>
 *      <li> a some
 *        <ul>
 *          <li><div> block element text | </div></li>
 *        </ul>
 *        other text
 *      </li>
 *    </ul>
 *   ```
 *
 *   case 4
 *   ------
 *   Call unorderedListAction x 1
 *    ```
 *    A case |- with br-tag <br> new line. <br> we Will need to refine this.
 *    ```
 *
 *    ```
 *    <ul>
 *      <li>A case |- with br-tag <br> new line. <br> we Will need to refine this.</li>
 *    </ul>
 *    ```
 *
 *   case 6
 *   ------
 *   Call unorderedListAction or unindent x 1
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
 *
 *   case 7
 *   ------
 *   Call unorderedListAction or unindent x 1
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
 *   case 8
 *   ------
 *   Call unorderedListAction or unindent x 1
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
 *   case 9
 *   ------
 *   Call unorderedListAction or unindent x 1
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
 *
 *   case 10
 *   ------
 *   Call unorderedListAction or unindent x 1
 *
 *   ```
 *    <ul>
 *      <li> item 1</li>
 *     <li>
 *       <ul>
 *          <li> subitem 1</li>
 *          <li><div> subitem | 2 </div></li>
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
 *     <li><div> subitem | 2 </div></li>
 *     <li>
 *       <ul>
 *          <li> subitem 3</li>
 *       </ul>
 *     </li>
 *     <li> item 2</li>
 *    </ul>
 *   ```
 *
 *   case 11
 *   ------
 *   Call unorderedListAction x 1
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
 */

/**
 * handles unordered list
 */
const unorderedListAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isEligibleForListAction(currentNode)) return;

  rawEditor.externalDomUpdate('handle unorderedListAction',
                              handleListAction(rawEditor, currentNode, unorderedListAction, 'ul'));
};

/**
 * handles ordered list
 */
const orderedListAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isEligibleForListAction(currentNode)) return;

  rawEditor.externalDomUpdate('handle orderedListAction',
                              handleListAction(rawEditor, currentNode, orderedListAction, 'ol'));
};

/**
 * handles indent Action
 */
const indentAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isEligibleForListAction(currentNode)) return;

  let handleAction = () => {
    if(!isEligibleForIndentAction(currentNode)) return;

    let currLI = getParentLI(currentNode);
    let currlistE = currLI.parentNode;
    let currlistType = getListTagName(currlistE);
    let logicalBlockContents = getLogicalBlockContentsForIndentationAction(currentNode);
    insertNewList(rawEditor, logicalBlockContents, currlistType);
  };

  rawEditor.externalDomUpdate('handle indentAction', handleAction);
};

/**
 * handles unindent Action
 */
const unindentAction = function ( rawEditor ) {
  const currentNode = rawEditor.currentNode;

  if(!isEligibleForListAction(currentNode)) return;

  let handleAction = () => {
    if(!isEligibleForIndentAction(currentNode)) return;

    let logicalBlockContents = getLogicalBlockContentsForIndentationAction(currentNode);
    unindentLogicalBlockContents(rawEditor, logicalBlockContents);
  };

  rawEditor.externalDomUpdate('handle unindentAction', handleAction);
};


/***************************************************
 * HELPERS
 ***************************************************/

/**
 * Boilerplate to handle List action
 * Both for UL and OL
 */
const handleListAction = ( rawEditor, currentNode, actionType, listType) => {
  return () => {
    if(!isInList(currentNode)){
      let logicalBlockContents = getLogicalBlockContentsForNewList(currentNode);
      insertNewList(rawEditor, logicalBlockContents, listType);
      return;
    }

    if(doesActionSwitchListType(currentNode, actionType)){
      let logicalBlockContents = getLogicalBlockContentsSwitchListType(currentNode);
      shuffleListType(rawEditor, logicalBlockContents);
      return;
    }

    let logicalBlockContents = getLogicalBlockContentsForIndentationAction(currentNode);
    unindentLogicalBlockContents(rawEditor, logicalBlockContents);
  };
};

/**
 * Checks whether node is in a list
 *
 *   EXAMPLES NOT IN A LIST
 *   ----------------------
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
 *    Note here: when in a nested list context even if cursors is in block element,
 *    we return true
 *    ```
 *    <ul>
 *     <li> a some <div> block element text | </div>  other text </li>
 *    </ul>
 *    ```
 *
 *   ```
 *   <ul>
 *     <li> some text
 *         <a href="#">an <i> italic | </i> link</a>
 *     </li>
 *   </ul>
 *   ```
 */
const isInList = ( node ) => {
  let currNode = node.parentNode;
  while(currNode){

    if(isLI(currNode)) return true;

    currNode = currNode.parentNode;
  }

  return false;
};

/**
 * Inserts a new list.
 *
 */
const insertNewList = ( rawEditor, logicalListBlocks, listType = 'ul' ) => {
  let listELocationRef = logicalListBlocks[0];

  let listE = document.createElement(listType);
  let li = document.createElement('li');
  listE.append(li);

  let parent = listELocationRef.parentNode;

  if(!parent){
    warn('Lists assume a parent node', {id: 'list-helpers:insertNewList'});
    return;
  }

  parent.insertBefore(listE, listELocationRef);
  logicalListBlocks.forEach(n => li.appendChild(n));

  if(!isInList(listE)) //let's assume if you nest a list, you don't want to wrap text around it
    makeLogicalBlockCursorSafe([listE]);

};

/**
 * Unindents logical block contents from context it resides in.
 */
const unindentLogicalBlockContents = ( rawEditor, logicalBlockContents, moveOneListUpwards= false ) => {
  let currLI = getParentLI(logicalBlockContents[0]);
  let listE = currLI.parentNode;
  let listType = getListTagName(listE);
  let parentE = listE.parentNode;
  let allLIs = [...listE.children];

  if(!currLI || !listE || !parentE){
    warn('No wrapping LI/List/Parent of list found!', {id: 'list-helpers:unindentLIAndSplitList'});
    return;
  }

  let [LIsBefore, LIsAfter] = siblingsBeforeAndAfterLogicalBlockContents(allLIs, [currLI]);
  let [siblingsBefore, siblingsAfter] = siblingsBeforeAndAfterLogicalBlockContents([...currLI.childNodes], logicalBlockContents);

  logicalBlockContents = makeLogicalBlockCursorSafe(logicalBlockContents);
  [siblingsBefore, siblingsAfter] = [ makeLogicalBlockCursorSafe(siblingsBefore), makeLogicalBlockCursorSafe(siblingsAfter)];

  if(siblingsBefore.length > 0){
    let li = createParentWithLogicalBlockContents(siblingsBefore, 'li');
    LIsBefore.push(li);
  }

  if(siblingsAfter.length > 0){
    let li = createParentWithLogicalBlockContents(siblingsAfter, 'li');
    LIsAfter = [li, ...LIsAfter];
  }

  //If we don't need to move our logical block on list up,
  //we will split the list in two and make sure the logicalBlock
  //resides in between
  if(!moveOneListUpwards){

    if(LIsBefore.length > 0){
      let listBefore = createParentWithLogicalBlockContents(LIsBefore, listType);
      parentE.insertBefore(listBefore, listE);
    }

    logicalBlockContents.forEach(n => parentE.insertBefore(n, listE));

    if(LIsAfter.length > 0){
      let listAfter = createParentWithLogicalBlockContents(LIsAfter, listType);
      parentE.insertBefore(listAfter, listE);
    }
  }

  //We are in highest list in context, and we didn't start from nested context
  if(!isInList(listE) && !moveOneListUpwards){
    makeLogicalBlockCursorSafe([listE]);
    //parentE.insertBefore(document.createTextNode(invisibleSpace), listE);
    listE.removeChild(currLI);
    parentE.removeChild(listE); //we don't need the original list
    return;
  }

  //Current list is a nested list, and the block needs to move one LI up
  if(isInList(listE) && !moveOneListUpwards){
    listE.removeChild(currLI);
    parentE.removeChild(listE); //we don't need the original list
    unindentLogicalBlockContents(rawEditor, logicalBlockContents, true);
    return;
  }

  //We don't care wether our current list is nested. We just need to add the new LI's
  if(moveOneListUpwards){
    let li = createParentWithLogicalBlockContents(logicalBlockContents, 'li');
    let newLIs = [...LIsBefore, li, ...LIsAfter];
    newLIs.forEach(n => listE.appendChild(n));
    listE.removeChild(currLI);
  }
};

/**
 * Switches list type where currentNode is situated in.
 */
const shuffleListType = ( rawEditor, logicalBlockContents) => {
  let currlistE = logicalBlockContents[0];
  let currlistType = getListTagName(currlistE);
  let targetListType = currlistType == 'ul'?'ol':'ul';
  let parentE = currlistE.parentNode;
  let allLIs = [...currlistE.children];

  let listE = document.createElement(targetListType);
  allLIs.forEach(li => listE.append(li));

  parentE.insertBefore(listE, currlistE);
  parentE.removeChild(currlistE);
};

const doesActionSwitchListType = ( node, listAction ) => {
  let li = getParentLI(node);
  let listE = li.parentElement;
  let listType = getListTagName(listE);
  if(listType == 'ul' && listAction == unorderedListAction){
    return false;
  }
  if(listType == 'ol' && listAction == orderedListAction){
    return false;
  }
  return true;
};

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

/**
 * Given a node, we want to grow a region (a list of nodes)
 * we consider sensible for inserting a new list
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
 * @method getLogicalBlockContentsForNewList
 *
 * @param {Object} domNode where cursor is
 *
 * @return [Array] [domNode1, ..., domNodeN]
 *
 * @public
 */
const getLogicalBlockContentsForNewList = ( node ) => {
  let baseNode = returnParentNodeBeforeBlockElement(node);
  //left and right adjacent siblings should be added until we hit a block node.
  return growNeighbouringSiblingsUntil(isDisplayedAsBlock, baseNode);
};

/**
 * Given a node in a list, we want to grow a region (a list of nodes)
 * we consider sensible to for switching the type of list.
 * In this case, we return the parent list dom element where current
 * domNode is in.
 *
 * @method getLogicalBlockContentsSwitchListType
 *
 * @param {Object} domNode where cursor is
 *
 * @return [Array] [domNode1, ..., domNodeN]
 *
 * @public
 */
const getLogicalBlockContentsSwitchListType = ( node ) => {
  let currLI = getParentLI(node);
  return [ currLI.parentNode ];
};

/**
 * Given a node in a nested list context, build the logicalBlock contents to perform
 * an unindent (i.e. unindent) action upon.
 *
 * CURRENT IMPLEMENTATION
 * ----------------------
 *
 * Best to use an example. "|" is cursor.
 *
 * Type case 1
 * -----------
 *
 * ```
 * <ol>
 *   <li>
 *     <ul>
 *       some text |
 *     </ul>
 *   </li>
 *</ol>
 * ```
 *
 *  The region we return.
 *
 *  ```
 *  some text |
 *  ```
 *
 * Type case 2
 * -----------
 *
 * ```
 * <ol>
 *   <li>
 *     <ul>
 *       some text <div> text in a block | </div>
 *     </ul>
 *   </li>
 *</ol>
 * ```
 *
 *  The region we return.
 *
 *  ```
 *  <div> text in a block | </div>
 *  ```
 * @method getLogicalBlockContentsForIndentationAction
 *
 * @param {Object} domNode where cursor is
 *
 * @return [Array] [domNode1, ..., domNodeN]
 *
 * @public
 */
const getLogicalBlockContentsForIndentationAction = ( node ) => {
  let currLI = getParentLI(node);
  let currLiNodes = [...currLI.childNodes];
  let potentialBlockParentCurrentNode = currLiNodes.find(n => isDisplayedAsBlock(n) && n.contains(node));

  if(potentialBlockParentCurrentNode)
    return [ potentialBlockParentCurrentNode ];

  let baseNode = returnParentNodeBeforeBlockElement(node);
  return growNeighbouringSiblingsUntil(isDisplayedAsBlock, baseNode);
};

/**
 * Walk up the parents until a blockElement is matched.
 * return the node of wich the parent is the matching
 * block element
 * This is useful for fetching the span element in following example:
 *   ```
 *    <p>
 *      text <span> foo <a href="#"> current node | </a></span>
 *    </p>
 *   ```
 *  The node we return.
 *
 *  ```
 *  <span> foo <a href="#"> current node | </a></span>
 *  ```
 */
const returnParentNodeBeforeBlockElement = ( node ) => {
  if(!node.parentNode) return node;

  if(isDisplayedAsBlock(node.parentNode)) {
    return node;
  }

  return returnParentNodeBeforeBlockElement(node.parentNode);
};

/**
 * Given a node, we want to grow a region (a list of sibling nodes)
 * until we match a condition
 */
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

const isEligibleForListAction = ( node ) => {
  if(!isTextNode(node)){
    warn('Current action only supported for textNodes', {id: 'list-helpers:isEligibleForListAction'});
    return false;;
  }
  return true;
};

const isEligibleForIndentAction = ( node ) => {
  if(!isInList(node)){
      warn('Indent only supported in context of list', {id: 'list-helpers:isEligibleForIndentAction'});
      return false;
  }
  return true;
};

const siblingsBeforeAndAfterLogicalBlockContents = ( allSiblings, logicalBlockContents ) => {
  let siblingsBefore = [];
  let siblingsAfter = [];
  let nodeListToUpdate = siblingsBefore;

  for(var node of allSiblings){
    if(logicalBlockContents.some(n => n.isSameNode(node))){
      nodeListToUpdate = siblingsAfter;
      continue;
    }
    nodeListToUpdate.push(node);
  }

  return [ siblingsBefore, siblingsAfter ];
};

const createParentWithLogicalBlockContents = ( logicalBlockContents, type ) => {
  let element = document.createElement(type);
  logicalBlockContents.forEach(n => element.appendChild(n));
  return element;
};

/**
 * Checks wether node is safe to put a cursor in. Checks either left or right from the node.
 */
const isNodeCursorSafe = ( node, before = true ) => {
  if(node.nodeType == Node.TEXT_NODE)
    return true;

  if(isLI(node))
    return true;

  let parent = node.parentNode;

  if(!parent)
    return true;

  if(before){
    let prevSibling = node.previousSibling;
    if(!prevSibling || prevSibling.nodeType!= Node.TEXT_NODE) return false;
  }

  else {
    let nextSibling = node.nextSibling;
    if(!nextSibling || nextSibling.nodeType!= Node.TEXT_NODE) return false;
  }

  return true;
};

/**
 * Makes sure logicalBlock is cursor safe.
 * By checking the first BlockContentNode as being safe at its left.
 * The last node is checked at its right.
 * Adds invisibleWhitespace
 * The inbetween elements are ignored.
 * (This function is basically something which should be executed at anthoer level)
 */
const makeLogicalBlockCursorSafe = ( logicalBlockContents ) => {
  if(logicalBlockContents.length == 0) return logicalBlockContents;

  let firstNode = logicalBlockContents[0];

  if(!isNodeCursorSafe(firstNode)){
    let textNode = document.createTextNode(invisibleSpace);
    firstNode.parentNode.insertBefore(textNode, firstNode);
    logicalBlockContents = [textNode, ...logicalBlockContents];
  }

  let lastNode = logicalBlockContents.slice(-1)[0];

  if(isNodeCursorSafe(lastNode, false))
    return logicalBlockContents;

  let textNode = document.createTextNode(invisibleSpace);
  let nextSibling = lastNode.nextSibling;

  if(!nextSibling){
    lastNode.parentNode.append(textNode);
  }
  else{
    lastNode.parentNode.insertBefore(textNode, nextSibling);
  }

  logicalBlockContents.push(textNode);

  return logicalBlockContents;
};

export { unorderedListAction, orderedListAction, indentAction, unindentAction }
