import Component from '@ember/component';
import { computed } from '@ember/object';
import { alias, union } from '@ember/object/computed';
import layout from '../templates/components/content-editable';
import forgivingAction from '../utils/forgiving-action';
import RawEditor from '../utils/raw-editor';
import EnterHandler from '../utils/enter-handler';
import IgnoreModifiersHandler from '../utils/ignore-modifiers-handler';
import BackspaceHandler from '../utils/backspace-handler';
import TextInputHandler from '../utils/text-input-handler';
import HeaderMarkdownHandler from '../utils/header-markdown-handler';
// import EmphasisMarkdownHandler from '../utils/emphasis-markdown-handler';
// import ListInsertionMarkdownHandler from '../utils/list-insertion-markdown-handler';
import ArrowHandler from '../utils/arrow-handler';
import TabHandler from '../utils/tab-handler';
import { normalizeEvent } from 'ember-jquery-legacy';
import { warn, runInDebug } from '@ember/debug';
import { A } from '@ember/array';
import { isEmpty } from '@ember/utils';
import { next } from '@ember/runloop';

/**
 * Content editable editor component
 * @module contenteditable-editor
 * @class ContentEditableComponent
 * @extends Component
 */
export default Component.extend({
  layout,
  attributeBindings: ['isEditable:contenteditable'],

  /**
   * latest cursor position in the contenteditable, it is aliased to the rawEditor.currentSelection
   *
   * @property currentSelection
   * @type Array
   *
   * @private
   */
  currentSelection: alias('rawEditor.currentSelection'),

  /**
   * latest text content in the contenteditable, it is aliased to the rawEditor.currentTextContent
   *
   *
   * @property currentTextContent
   * @type String
   *
   * @private
   */
  currentTextContent: alias('rawEditor.currentTextContent'),

  /**
   * element of the component, it is aliased to the rawEditor.rootNode
   *
   * @property element
   * @type DOMElement
   *
   * @private
   */
  rootNode: null,

  /**
   * string representation of editable
   *
   * @property isEditable
   * @type string
   * @private
   */
  isEditable: computed('editable', function() {
    return this.get('editable').toString();
  }),

  /**
   * richNode is the rich representation of the component element,
   * it is aliased to the rawEditor.richNode
   *
   * @property richNode
   * @type RichNode
   * @private
   */
  richNode: alias('rawEditor.richNode'),

  /**
   *
   * @property rawEditor
   * @type RawEditor
   */
  rawEditor: null,

  /**
   * components present in the editor
   * @property components
   * @type {Object}
   * @public
   */
  components: alias('rawEditor.components'),

  /**
   * ordered set of input handlers
   * @property eventHandlers
   * @type Array
   * @public
   */
  inputHandlers: union('externalHandlers', 'defaultHandlers'),

  /**
   * default input handlers
   * @property defaultHandlers
   * @type Array
   * @private
   */
  defaultHandlers: null,

  /**
   * external input handlersg
   * @property externalHandlers
   * @type Array
   * @private
   */
  externalHandlers: null,
  /**
   * @constructor
   */
  init() {
    this._super(...arguments);
    const rawEditor = RawEditor.create({
      handleFullContentUpdate: this.get('handleFullContentUpdate'),
      textInsert: this.get('textInsert'),
      textRemove: this.get('textRemove'),
      selectionUpdate: this.get('selectionUpdate'),
      elementUpdate: this.get('elementUpdate')
    });
    this.set('rawEditor', rawEditor);

    const defaultInputHandlers = [ ArrowHandler.create({rawEditor}),
                                   HeaderMarkdownHandler.create({rawEditor}),
                                   // EmphasisMarkdownHandler.create({rawEditor}),
                                   // ListInsertionMarkdownHandler.create({rawEditor}),
                                   EnterHandler.create({rawEditor}),
                                   BackspaceHandler.create({rawEditor}),
                                   TextInputHandler.create({rawEditor}),
                                   TabHandler.create({rawEditor}),
                                   IgnoreModifiersHandler.create({rawEditor})];

    this.set('currentTextContent', '');
    this.set('currentSelection', [0,0]);
    this.set('defaultHandlers', defaultInputHandlers);
    this.set('capturedEvents', A());
    if( ! this.externalHandlers ) {
      this.set('externalHandlers', []);
    }
  },

  didUpdateAttrs(){
    this.rawEditor.set('textInsert',this.textInsert);
    this.rawEditor.set('textRemove',this.textRemove);
    this.rawEditor.set('handleFullContentUpdate',this.handleFullContentUpdate);
    this.rawEditor.set('selectionUpdate',this.selectionUpdate);
    this.rawEditor.set('elementUpdate',this.elementUpdate);
		this.rawEditor.set('handleFullContentUpdate',this.handleFullContentUpdate);
  },

  /**
   * specify whether the editor should autofocus the contenteditable field
   *
   * @property focused
   * @type boolean
   * @default false
   *
   * @public
   */
  focused: false,

  /**
   * specify whether the editor should be contenteditable
   *
   * @property editable
   * @type boolean
   * @default true
   *
   * @public
   */
  editable: true,

  /**
   * specify whether yielded value should escape html syntax
   *
   * @property yieldHTML
   * @type boolean
   * @default true
   *
   * @public
   */
  yieldHTML: true,

  /**
   * didRender hook, makes sure the element is focused
   * and calls the rootNodeUpdated action
   *
   * @method didRender
   */
  didInsertElement(){
    this._super(...arguments);
    this.set('rawEditor.rootNode', this.get('element'));
    let el = this.get('element');
    // TODO: mapping using customEvents currently doesn't work, remove when it does
    el.onpaste = (event) => this.paste(event);
    if (this.get('focused'))
      el.focus();
    this.set('rawEditor.currentNode', this.rawEditor.rootNode);
    forgivingAction('rawEditorInit', this)(this.get('rawEditor'));
    next( () => {
      forgivingAction('elementUpdate', this)();
      this.get('rawEditor').generateDiffEvents.perform();
      this.extractAndInsertComponents();
      this.get('rawEditor').updateRichNode();
    });
  },

  /**
   * willDestroyElement, calls the rootNodeUpdated action
   *
   * @method willDestroyElement
   *
   */
  willDestroyElement() {
    this.set('richNode', null);
    this.set('rawEditor.rootNode', null);
    forgivingAction('elementUpdate', this)();
  },

  /**
   * keyDown events are handled for simple input we take over from
   * browser input.
   */
  keyDown(event) {
    event = normalizeEvent(event);
    if (this.isHandledInputEvent(event)) {
      if (this.isCtrlZ(event)) {
        event.preventDefault();
        this.get('rawEditor').undo();
      }
      else {
        let handlers = this.get('inputHandlers').filter(h => h.isHandlerFor(event));
        try {
          handlers.some( handler => {
            let response = handler.handleEvent(event);
            if (!response.get('allowBrowserDefault'))
              event.preventDefault();
            if (!response.get('allowPropagation'))
              return true;
            return false;
          });
        }
        catch(e) {
          warn(`handler failure`, {id: 'contenteditable.keydown.handler'});
          warn(e, {id: 'contenteditable.keydown.handler'});
        }
      }
      this.get('rawEditor').updateRichNode();
      this.get('rawEditor').generateDiffEvents.perform();
      this.capturedEvents.pushObject(event);
    }
    else {
      runInDebug( () => {
        console.warn('unhandled keydown', event); //eslint-disable-line no-console
      });
    }
  },

  /**
   * currently we disable paste
   */
  paste(event) {
    // TODO support clipboardData, we want to filter on type text/plain and use that
    // see https://www.w3.org/TR/clipboard-apis/#paste-action
    const paste = (event.clipboardData || window.clipboardData).getData('text'); // use 'text/html' later on for parseable content
    const [ start , end ] = this.rawEditor.currentSelection;
    if ( start === end ) {
      // it's a regular cursor, not a selection
      this.rawEditor.insertText(paste, this.rawEditor.currentPosition);
      this.rawEditor.setCurrentPosition(start + paste.length);
    }
    else {
      alert('plakken over selecties wordt niet ondersteund');
    }
    event.preventDefault();
    return false;
  },
  /**
   * keyUp events are parsed for complex input, for uncaptured events we update
   * the internal state to be inline with reality
   */
  keyUp(event) {
    this.handleUncapturedEvent(event);
  },

  /**
   * compositionEnd events are parsed for complex input, for uncaptured events we update
   * the internal state to be inline with reality
   */
  compositionEnd(event) {
    this.handleUncapturedEvent(event);
  },

  mouseUp(event) {
    this.get('rawEditor').updateRichNode();
    this.get('rawEditor').updateSelectionAfterComplexInput(event);
    this.get('rawEditor').generateDiffEvents.perform();
  },

  handleUncapturedEvent(event) {
    event = normalizeEvent(event);
    if (isEmpty(this.capturedEvents) || this.capturedEvents[0].key !== event.key || this.capturedEvents[0].target !== event.target) {
      this.set('capturedEvents', A()); // TODO: added this because tracking of captured events is broken, fix it
      this.get('rawEditor').externalDomUpdate('uncaptured input event', () => {});
    }
    else
      this.capturedEvents.shiftObject();
  },

  /**
   * find defined components, and recreate them
   */
  extractAndInsertComponents() {
    for (let element of this.get('element').querySelectorAll('[data-contenteditable-cw-id]')) {
      let name = element.getAttribute('data-contenteditable-cw-name');
      let content = JSON.parse(element.getAttribute('data-contenteditable-cw-content'));
      let id = element.getAttribute('data-contenteditable-cw-id');
      let parent = element.parentNode;
      parent.innerHTML = '';
      this.rawEditor.insertComponent(parent, name, content, id);
    }
  },

  /**
   * specifies whether an input event is "simple" or not
   * simple events can be translated to a increment of the cursor position
   *
   * @method isSimpleTextInputEvent
   * @param {DOMEvent} event
   *
   * @return {Boolean}
   * @private
   */
  isHandledInputEvent(event) {
    event = normalizeEvent(event);
    return this.isCtrlZ(event) || this.get('inputHandlers').filter(h => h.isHandlerFor(event)).length > 0;
  },

  isCtrlZ(event) {
    return event.ctrlKey && event.key === 'z';
  },
  actions: {
    removeComponent(id) {
      this.rawEditor.removeComponent(id);
    }
  }
});
