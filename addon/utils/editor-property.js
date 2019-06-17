import { tagName }  from './dom-helpers';
/**
 * default tag name for creating a property
 */
const DEFAULT_TAG_NAME = Object.freeze('span');

/**
 * This is an class providing the interface and basic implementation of a "transient property".
 * Transient properties introduce the concept of a property that is
 * considered to be active in a position in the tree based on any of its
 * parent nodes, and which can be split/merged at will.  The transient
 * property solution contains both logical way of working, as well as the
 * tooling around it to make it feasible to use.
 * Create an instance of this class to define simple properties or extend it for more advanced ones.
 *
 * @class EditorProperty
 *
 */
export default class EditorProperty {
  /**
   * the preferred tagName of this property, the tagname is not guarantueed to be used unless mustWrap is truthy
   * @property tagName
   * @type String
   * @default 'span'
   */
  tagName;
  /**
   * indicates whether creation of a new node should be enforced when applying the property
   * @property newContext
   * @type boolean
   * @default false
   */
  newContext;

  /**
   * Array of dom attributes to add to a domnode when applying the property
   * @property attributes
   * @type Object
   */
  attributes;

  constructor({tagName = DEFAULT_TAG_NAME, newContext = false, attributes = {}}){
    this.tagName = tagName;
    this.newContext = newContext;
    this.attributes = attributes;
  }

  /**
   * verify if the provided node is has this property enabled
   * @method enabledAt
   * @param DomNode richNode
   * @return Boolean
   */
  enabledAt(richNode) {
    if (!richNode)
      return false;
    if (richNode.type === 'tag') {
      if (this.newContext && tagName(richNode.domNode) !== this.tagName) {
        return false;
      }
      else {
        for (let key of Object.keys(this.attributes)) {
          const domNode = richNode.domNode;
          if (!domNode.hasAttribute(key))
            return false;
          if (! domNode.getAttribute(key).includes(this.attributes[key]))
            return false;
        }
        return true;
      }
      return true;
    }
    return this.enabledAt(richNode.parent);
  }
}

export { DEFAULT_TAG_NAME };
