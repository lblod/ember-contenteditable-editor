import RichNode from '@lblod/marawa/rich-node';
import { isAdjacentRange, isEmptyRange } from '@lblod/marawa/range-helpers';
import wrapRichNode from '../rich-node-tree-modification';
import { runInDebug } from '@ember/debug';

/**
 * Alters a selection from the API described above.
 *
 * Any selected range can be manipulated.  This method allows such
 * changes to happen on following key terms: property, typeof,
 * dataType, resource, content, (TODO: attribute), innerContent,
 * innerHtml
 *
 * - selection: Object retrieved from #selectContext or
 *   #selectHighlight.
 * - options: Object specifying desired behaviour.
 * - options.remove: Removes RDFa content that was already there.
 *     Allows removing any of property, typeof, datatype, resource,
 *     content, (TODO: attribute), innerContent, innerHtml
 * - options.add: Adds specific content to the selection, pushing
 *     nvalues on top of already existing values.  Allows adding any
 *     of property, typeof, datatype, resource.  Set the
 *     forceNewContext property to true to force a new context if a
 *     full tag is selected.
 * - options.set: Allows setting any of property, typeof, datatype,
 *     resource content attribute innerContent innerHtml.  Set the
 *     newContext property to true to force a new context if a full
 *     tag is selected.
 * - options.desc: You are oncouraged to write a brief description
 *     of the desired manipulation here for debugging needs.
 *
 * The syntax for specifying items to remove works as follows:
 * - true: Removes any value to be removed.
 * - string: Removes the specific value as supplied.  If no value
 *   matches, nothing is removed.  For semantic content, translation
 *   is done based on the current context, eg: if there is a
 *   foaf:name in the document, then suppling the string
 *   "http://xmlns.com/foaf/0.1/name" will usually mean foaf:name is
 *   matched.
 * - [string]: An array of strings means all the matches will be
 *   removed.  Matching works the same way as string.
 * - regex: Considers the present value and executes a regular
 *   expression on said value.  If the regular expression matches,
 *   the value is removed.
 * - [regex]: An array of regular experssions.  If any matches, the
 *   value itself is matched.
 *
 * The syntax for specifying items to add works for all properties
 * which can be set using "add".  Specification works as follows:
 * - string: Specifies a single value to set or add.
 * - [string]: Specifies a series of values to set or add.
 *
 * NOTE: The system is free to set or add
 * properties based on a short form (derived from the prefixes
 * available in the context) if it is possible and if it desires to
 * do so.
 *
 * NOTE: newContext is set to undefined by default and behaves
 * similar to false.  This is because we assume that when you don't
 * care about the context there's a fair chance that we can merge
 * the contexts.  In specific cases you may desire to have things
 * merge (or not) explicitly.  You should set eithre true or false
 * in that case.
 *
 * NOTE/TODO: In order to make plugins simpler, we should look into
 * specifying namespaces in the plugin.  By sharing these namespaces
 * with these setter methods, it becomes shorter te specify the URLs
 * to match on.
 *
 * NOTE/TODO: It is our intention to allow for multiple operations
 * to occur in series.  Altering the range in multiple steps.  This
 * can currently be done by executing the alterSelection multiple
 * times.  Connecting the changes this way does require you to make
 * a new selection each time you want to execute a new change.  If
 * this case occurs often *and* we can find sensible defaults on
 * updating the selection, we could make this case simpler.  The
 * options hash would also allow an array in that case.
 */
function update(selection, { remove, add, set, desc }) {
  updateDomNodes(selection, {remove, add, set ,desc});
  const start = Math.min(...selection.selections.map((element) => element.richNode.start));
  const end = Math.max(...selection.selections.map((element) => element.richNode.end));
  // TODO: cursor handling is suboptimal, should be incorporated in update itself.
  // eg if we're clearing the node that contains our cursor, what would be a good strategy?
  this.updateRichNode();
  if (this.currentPosition >= start && this.currentPosition <= end) {
    // cursor was in selection, reset cursor
    const richNode = this.getRichNodeFor(this.currentNode);
    if (richNode) {
      this.setCarret(richNode.domNode, Math.max(0,this.currentPosition - richNode.start));
    }
    else {
      this.set('currentNode', null);
      this.setCurrentPosition(this.currentPosition);
    }
  }
  // TODO: should send out diff events when just the html has changed.
  // TODO: should probably only trigger diff events if all updates have been executed
  this.generateDiffEvents.perform([{source: "pernet"}]);
}

// HELPERS

function updateDomNodes( selection, { remove, add, set, desc } ) {
  if (selection.selections.length == 0)
    console.warn(`Received empty selection set on update. Nothing will be updated.`); // eslint-disable-line no-console

  verifySpecification({remove, add, set, desc});
  if ( selection.selectedHighlightRange && isComplexSelection(selection)) {
    // TODO: find a sensible region to apply the update to
    console.warn('Handling of complex selection not yet implemented. Nothing will be updated at the moment.', selection); // eslint-disable-line no-console
  }
  else {
    const bestApproach = newContextHeuristic( selection, {remove, add, set, desc});
    let nodes = [];
    if (bestApproach === WRAP) {
      nodes = wrapSelection(selection);
    }
    else if (bestApproach === WRAPALL) {
      console.warn(`New context approach ${WRAPALL} is currently not supported.`); // eslint-disable-line no-console
    }
    else if (bestApproach === NEST) {
      nodes = nestSelection(selection);
    }
    else {
      nodes = selection.selections.map((sel) => sel.richNode.domNode );
    }
    if (isRDFAUpdate({remove,add,set})) {
      updateRDFA(nodes, {remove, add, set});
    }
    if (isInnerContentUpdate({remove,add,set})) {
      updateInnerContent(nodes, {remove, add, set});
    }
  }
}


// rdfa attributes we understand, currently ignoring src and href
const RDFAKeys = ['about', 'property','datatype','typeof','resource', 'rel', 'rev', 'content'];
const WRAP = "wrap";
const UPDATE = "update";
const NEST = "nest";
const WRAPALL = "wrap-all"; // only sensible for contextSelection

/*** private HELPERS ***/

/**
 * verifies if the inner content should be updated according to the provided specification
 * @method isInnerContentUpdate
 */
function isInnerContentUpdate({remove, set}) {
  // TODO: figure out what aad means with innerContent :)
  return ((remove && remove.innerHTML) || (set && set.innerHTML));
}

/**
 * updates the inner content of the provided nodes according to the specification
 * @method updateInnerContent
 */
function updateInnerContent(domNodes, {remove, set}) {
  for (let domNode of domNodes) {
    if (remove && remove.innerHTML) {
      domNode.innerHTML = '';
    }
    if (set && set.innerHTML) {
      domNode.innerHTML = set.innerHTML;
    }
  }
}

/**
 * heuristic to determine whether we should wrap, nest or update the current selection
 * @method newContextHeuristic
 * @private
 */
function newContextHeuristic( selection, {remove, add, set}) {
  if (selection.selectedHighlightRange) {
    // always wrap a text selection for now
    // this could be overwritten in a smarter nodesToWrap method
    return WRAP;
  }
  else {
    // it's a context selection take into account existing RDFA if possible
    if (remove) {
      return UPDATE;
    }
    else if (add) {
      if (selection.selections.length > 1) {
        if (add.forceNewContext && (add.forceNewContext === WRAP || add.forceNewContext === NEST)) {
          return add.forceNewContext;
        }
        else {
          // assume nesting for context selections with more than 1 element if unspecified
          return NEST;
        }
      }
      else if (selection.selections.length === 1) {
        if (add.forceNewContext) {
          if ([WRAP,WRAPALL, NEST].includes(add.forceNewContext)) {
            return add.forceNewContext;
          }
          else {
            return wrapOrNest(selection.selections.richNodes[0], add);
          }
        }
        else {
          // check if set has a specification
          if (set && (set.resource)) {
            return UPDATE;
          }
          else {
            // wrap or nest
            return wrapOrNest(selection.selection.richNodes[0], add);
          }
        }
      }
      else {
        return null; // don't do anything on empty selections?
      }
    }
    else if (set) {
      return UPDATE;
    }
    else {
      console.warn("You must specify either 'add', 'remove' or 'set' on an update operation"); // eslint-disable-line no-console
      return null;
    }
  }
}

function wrapOrNest(node, specification) {
  /*
   * - about – a URI or CURIE specifying the resource the metadata is about
   * - rel and rev – specifying a relationship and reverse-relationship with another resource, respectively
   * - resource – specifying the partner resource (currently ignoring src and href)
   * - property – specifying a property for the content of an element or the partner resource
   * - content – optional attribute that overrides the content of the element when using the property attribute
   * - datatype – optional attribute that specifies the datatype of text specified for use with the property attribute
   * - typeof – optional attribute that specifies the RDF type(s) of the subject or the partner resource (the resource that the metadata is about).
   */

  const domNode = node.domNode;
  if (domNode.hasAttribute('property') && !(domNode.hasAttribute('content') || domNode.hasAttribute('datatype')) ) {
    // current domnode specifies a property
    if (specification.about) {
      // describing a new resource, likely nesting below a property?
      return NEST;
    }
    else // TODO define extra rules
      return WRAP;
  }
  else if (domNode.hasAttribute('content') || domNode.hasAttribute('datatype')) {
    return null; // current domnode specifies a triple with a literal
  }
  else {
    // fallback to WRAP
    return WRAP;
  }
}

/**
 *
 * @method nestSelection
 * @private
 */
function nestSelection( selection ) {
  const nodes = [];
  for (let node of selection.selections.map((el) => el.richNode)) {
    if (node.type !== 'tag') {
      console.warn('Cannot nest under node of type ' + node.type); // eslint-disable-line no-console
    }
    else {
      const newElement = document.createElement('span'); // prefer spans for nesting TODO: configurable
      node.domNode.prepend(newElement);
      while(newElement.nextSibling) {
        let sibling = newElement.nextSibling;
        newElement.append(sibling);
      }
      nodes.push(newElement);
    }
  }
  return nodes;
}
/**
 * returns intersection of 2 arrays.
 * @method intersection
 * @private
 */
function intersection(arr1, arr2) {
  return arr1.filter(function(value) {
    return arr2.indexOf(value) > -1;
  });
}

/**
 * verifies if rdfa keys are set on the provided object
 * @method hasRDFAKeys
 * @private
 */
function hasRDFAKeys(object) {
  if (object) {
    const inter =  intersection(RDFAKeys, Object.keys(object));
    return inter.length > 0;
  }
  else
    return false;
}

/**
 * verifies if the provided update tries to update RDFA attributes
 * @method isRDFAUpdate
 * @private
 */
function isRDFAUpdate({remove, add, set}) {
  return hasRDFAKeys(remove) || hasRDFAKeys(add) || hasRDFAKeys(set);
}

/**
 *  will update a dom attribute, either removing a value from the space separated list or unsetting it
 * @method removeDOMAttributeValue
 * @private
 */
function removeDOMAttributeValue(domNode, attribute, value) {
  if (domNode.hasAttribute(attribute)) {
    const previousValue = domNode.getAttribute(attribute);
    const updatedValue = previousValue.replace(value, '').split(" ").reject((s) => s.length === 0).join(" ");
    if (updatedValue.length === 0)
      domNode.removeAttribute(attribute);
    else
      domNode.setAttribute(attribute, updatedValue);
  }
}

/**
 * updates a dom attribute either adding a value to the space separated list or setting it, avoids doubles
 * @method addDomAttributeValue
 * @private
 */
function addDomAttributeValue(domNode, attribute, value) {
  if (domNode.hasAttribute(attribute)) {
    const previousValue = domNode.getAttribute(attribute);
    if (!previousValue.includes(value)); {
      const updatedValue = previousValue.split(" ").reject((s) => s.length === 0).concat([value]).join(" ");
      domNode.setAttribute(attribute, updatedValue);
    }
  }
  else {
    domNode.setAttribute(attribute, value);
  }
}

/**
 * creates a wrapper element around the selection, currently always a div (newContext)
 * @method wrapSelection
 * @private
 */
function wrapSelection(selection) {
  if (selection.selectedHighlightRange) {
    // this is a non complex text selection so a useful common parent exists/can be created
    // we assume all selections are text nodes (current implementation of selectHighlightRange)
    // the text nodes should form a consecutive range, but do not have to be in order
    const selections = selection.selections.sort((a,b) => {
      if (a.range[0] <= b.range[0] && a.range[1] <= b.range[0]) {
        return -1;
      }
      else if (a.range[0] === b.range[0] && a.range[1] === b.range[1]) {
        return 0; // TODO: not really correct, use DOM to define actual position?
      }
      else {
        return 1;
      }
    });
    // selections are now ordered
    const firstSelection = selections[0];
    const lastSelection = selections[selections.length - 1];
    const newContext = document.createElement('div');

    if (firstSelection.richNode.start < firstSelection.range[0]) {
      // not the entire node was selected, will need to split
      const richNode = firstSelection.richNode;
      const relativeStart = Math.min( firstSelection.range[0] - richNode.start, richNode.text.length);
      const [preText, infixText] = [ richNode.text.slice( 0, relativeStart ),
                                     richNode.text.slice( relativeStart ) ];
      const prefixNode = document.createTextNode(preText);
      richNode.domNode.before(prefixNode);
      const preRichNode = new RichNode({
        domNode: prefixNode,
        parent: richNode.parent,
        start: richNode.start,
        end: richNode.start + relativeStart,
        text: preText,
        type: "text"
      });
      const parent = richNode.parent;
      const index = parent.children.indexOf(richNode);
      parent.children.splice(index, 0, preRichNode);
      richNode.start = richNode.start + relativeStart;
      richNode.text = infixText;
    }
    if (lastSelection.richNode.end > lastSelection.range[1]) {
      // not the entire node was selected, will need to split
      const richNode = lastSelection.richNode;
      const relativeEnd = Math.min( lastSelection.range[1] - richNode.start, richNode.text.length);
      const [infixText, postText] = [ richNode.text.slice( 0, relativeEnd ),
                                      richNode.text.slice( relativeEnd ) ];
      const postfixNode = document.createTextNode(postText);
      richNode.domNode.after(postfixNode);
      const postfixRichNode = new RichNode({
        domNode: postfixNode,
        parent: richNode.parent,
        start: richNode.start + relativeEnd,
        end: richNode.end,
        text: postText,
        type: "text"
      });
      const parent = richNode.parent;
      const index = parent.children.indexOf(richNode);
      parent.children.splice(index+1, 0, postfixRichNode);
      richNode.end = richNode.start + relativeEnd;
      richNode.text = infixText;
    }
    // find the actual nodes to move, these might be higher up in the tree.
    // can assume the nodes in selections can be completely wrapped
    // (prefix and postfix is taken care of above this comment)
    const nodesToWrap = findNodesToWrap(selections.map((sel) => sel.richNode));
    nodesToWrap[0].domNode.before(newContext);
    // move selected nodes to new context
    for (const node of nodesToWrap) {
      newContext.appendChild(node.domNode);
    }
    // TODO: should also update rich node correctly, brain currently broken on what nodes to wrap returns, but they should all have the same parent right? if not the above move is not correct :D
    return [newContext];
  }
  else {
    // it's a contextSelection
    const nodes = selection.selections.map((element) => element.richNode);
    const newContexts = [];
    // currently just wrapping each element separately, context selections don't have to be consecutive
    for (let richNode of nodes) {
      const newContext = document.createElement('div');
      const domNode = richNode.domNode;
      domNode.replace(newContext);
      newContext.appendChild(domNode);
      wrapRichNode(richNode, newContext);
      newContexts.push(newContext);
    }
    return newContexts;
  }
}

/**
 * walks up the tree to include parents if possible
 * assumes all provided nodes can be wrapped completely
 * assumes a consecutive selection, no gaps
 * returns a list of richnodes matching the range
 * @method findNodesToWrap
 * @private
 */
function findNodesToWrap(richNodes) {
  const start = Math.min(...richNodes.map((node) => node.start));
  const end = Math.max(...richNodes.map((node) => node.end));
  const nodesToWrap = [];
  for (let node of richNodes) {
    let current = node;
    // walk up the three as long as we fit within the range
    while (current.parent && current.parent.start >= start && current.parent.end <= end) {
      // this assumes the richnode tree never includes the editor element itself!
      current = current.parent;
    }
    if (!nodesToWrap.includes(current)) {
      nodesToWrap.push(current);
    }
  }
  return nodesToWrap;
}


// function parentContains(parent, richNodes) {
//   return richNodes.some((richNode) => !parent.domNode.contains(richNode.domNode));
// }

// function findNodesToWrap(richNodes) {
//   var rootParent = richNodes[0].parent;
//   while (!parentContains(rootParent,richNodes) && rootParent) {
//     rootParent = rootParent.parent;
//   }
//   return richNodes.map( (richNode) => {
//     var nodeToWrap = richNode;
//     while(nodeToWrap.parent !== rootParent) {
//       nodeToWrap = nodeToWrap.parent;
//     }
//   });
// }

/**
 * verifies if the provided selection is a selection we support
 * @method isComplexSelection
 * @private
 */
function isComplexSelection(selection) {
  // an unsupported complex selection is a selection that spans multiple nodes
  // the nodes don't all have the same parent
  // and not all children of the different parents are selected
  // but does not cover them completely
  // e.g     a
  //      /     \
  //     b       c
  //   /  \     / \
  // t1   t2   t3  t4
  // where t2, t3 and t4 are selected

  if (selection.selections.length == 1)
    return false;
  else {
    const verifyParents = function(parents, children) {
      const cleanedParents = (Array.from(parents)).filter((element) => element);
      if (cleanedParents.length === 1)
        return false;
      else if (cleanedParents.length === 0) {
        return true;
      }
      else {
        for (let parent of cleanedParents) {
          for (let child of parent.children) {
            if (! children.map( (sel) => sel.richNode).includes(child)) {
              console.warn('Complex selection (spanning multiple nodes with different parents)', selection); // eslint-disable-line no-console
              return true;
            }
          }
        }
        const newParents = cleanedParents.map((element) => element.parent);
        return verifyParents(newParents, cleanedParents);
      }
    };

    // don't take empty boundary selections into account to determine complexity of the selection
    let selections = [];
    if (selection.selectedHighlightRange) {
      selections = selection.selections.filter( function(sel) {
        return !isEmptyRange(sel.range) || !isAdjacentRange(sel.range, selection.selectedHighlightRange);
      });
    } else {
      selections = selection.selections;
    }

    const directParents = new Set();
    for (let sel of selections) {
      directParents.add(sel.richNode.parent);
    }
    const children = selections.map( (sel) => sel.richNode);
    return verifyParents(directParents, children);
  }
}

/**
 * converts an update specification to an array of values that can be removed/added
 * @method selectedAttributeValues
 * @private
 */
function selectedAttributeValues(domNode, attribute, specification) {
  if (specification instanceof String || typeof(specification) == "string") {
    return [specification];
  }
  else if (specification instanceof RegExp) {
    return [...domNode.getAttribute(attribute).matchAll(specification)];
  }
  else if (specification instanceof Array) {
    const matches = specification.map((spec) => {
      if (spec instanceof RegExp)
        return [...domNode.getAttribute(attribute).matchAll(spec)];
      else if (spec instanceof String || typeof(spec) == "string")
        return [spec];
      else
        return [];
    });
    return Array.prototype.concat.apply([], matches); // flattens array
  }
  else {
    throw new Error(`Unsupported specification for attribute ${attribute} with value ${specification}.`);
  }
}

/**
 * Alters the RDFA properties of a selection
 * Currently supports the following RDFA properties/combinations
 * - about – a URI or CURIE specifying the resource the metadata is about
 * - rel and rev – specifying a relationship and reverse-relationship with another resource, respectively
 * - resource – specifying the partner resource (currently ignoring src and href)
 * - property – specifying a property for the content of an element or the partner resource
 * - content – optional attribute that overrides the content of the element when using the property attribute
 * - datatype – optional attribute that specifies the datatype of text specified for use with the property attribute
 * - typeof – optional attribute that specifies the RDF type(s) of the subject or the partner resource (the resource that the metadata is about).
 * @method updateRDFA
 * @private
 */
function updateRDFA(domNodes, {remove, add, set } ) {
  for (let domNode of domNodes) {
    for (let attribute of RDFAKeys) {
      if (remove && remove[attribute]) {
        if (remove[attribute] === true) {
          domNode.removeAttribute(attribute);
        }
        else {
          for (let value of selectedAttributeValues(domNode, attribute, remove[attribute])) {
            removeDOMAttributeValue(domNode, attribute, value);
          }
        }
      }
      if (add && add[attribute]) {
        const values = add[attribute] instanceof Array ? add[attribute] : [add[attribute]];
        for (let value of values) {
          addDomAttributeValue(domNode, attribute, value);
        }
      }
      if (set && set[attribute]) {
        domNode.setAttribute(attribute, set[attribute]);
      }
    }
  }
}

function verifySpecification({ add, desc }) {
  runInDebug( () => {
    if (desc)
      console.info(`running update: ${desc}`); // eslint-disable-line no-console
    if (add) {
      if (add.content)
        console.warn('adding content is not supported, use set'); // eslint-disable-line no-console
      if (add.datatype)
        console.warn('adding datatype is not supported, use set'); // eslint-disable-line no-console
      if (add.innerHTML)
        console.warn('adding innerHTML is not supported, use set'); // eslint-disable-line no-console
    }
  });
}

export { update };
