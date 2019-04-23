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

  if(!isEligibleForListAction(currentNode)) return;

  let handleAction = () => {
    if(!isInList(currentNode)){
      warn('Indent only supported in context of list', {id: 'list-helpers:unindentAction'});
    }
    unindentLIAndSplitList(rawEditor, currentNode);
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

    let logicalBlockContents = getLogicalBlockContentsForUnindent(currentNode);
    unindentLogicalBlockContents(rawEditor, logicalBlockContents);
  };
};


/**
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
 *   case 5
 *   ------
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
  let currLiNodes = [...currLI.childNodes];

  //It might be the case that currentNode is part of block.
  //Then we choose to split LI around that block
  let potentialBlockParentCurrentNode = currLiNodes.find(n => isDisplayedAsBlock(n) && n.contains(currentNode));
  let LINodesToUnwrap = potentialBlockParentCurrentNode ? [ potentialBlockParentCurrentNode ] : growLIContentFromNode(currentNode);
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
 * Switches list type where currentNode is situated in.
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
 * @method getLogicalBlockContentsForUnindent
 *
 * @param {Object} domNode where cursor is
 *
 * @return [Array] [domNode1, ..., domNodeN]
 *
 * @public
 */
const getLogicalBlockContentsForUnindent = ( node ) => {
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
 *      text <span> foo <a href="#"> current node </a></span>
 *    </p>
 *   ```
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

const isEligibleForListAction = ( node ) => {

  if(!isTextNode(node)){
    warn('Current action only supported for textNodes', {id: 'list-helpers:isEligibleForListAction'});
    return false;;
  }
  return true;

};

export { unorderedListAction, orderedListAction, indentAction, unindentAction }
