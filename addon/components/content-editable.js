import Component from '@ember/component';
import { computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { isEmpty } from '@ember/utils';
import layout from '../templates/components/content-editable';
import forgivingAction from '../utils/forgiving-action';
import RawEditor from '../utils/raw-editor';
import EnterHandler from '../utils/enter-handler';
import BackspaceHandler from '../utils/backspace-handler';
import TextInputHandler from '../utils/text-input-handler';
import TextInputDataFlaggedRemoveHandler from '../utils/text-input-data-flagged-remove-handler';

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
   * ordered set of input handlers
   * @property eventHandlers
   * @type Array
   * @public
   */
  inputHandlers: null,

  /**
   * @constructor
   */
  init() {
    this._super(...arguments);
    this.set('rawEditor', RawEditor.create({
      handleFullContentUpdate: this.get('handleFullContentUpdate'),
      textInsert: this.get('textInsert'),
      textRemove: this.get('textRemove'),
      selectionUpdate: this.get('selectionUpdate'),
      elementUpdate: this.get('elementUpdate')
    }));
    this.set('currentTextContent', '');
    this.set('currentSelection', [0,0]);
    const enterHandler = EnterHandler.create({rawEditor: this.get('rawEditor')});
    const backspaceHandler = BackspaceHandler.create({rawEditor: this.get('rawEditor')});
    const textInputHandler = TextInputHandler.create(({rawEditor: this.get('rawEditor')}));
    const textInputDataFlaggedRemoveHandler = TextInputDataFlaggedRemoveHandler.create(({rawEditor: this.get('rawEditor')}));
    const handlers = [enterHandler, backspaceHandler, textInputDataFlaggedRemoveHandler, textInputHandler];
    if (! isEmpty(this.get('inputHandlers'))) {
      this.set('inputHandlers', this.get('inputHandlers').concat(handlers));
    }
    else {
      this.set('inputHandlers', handlers);
    }
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
    if (this.get('focused'))
      el.focus();
    this.get('rawEditor').updateRichNode();
    forgivingAction('rawEditorInit', this)(this.get('rawEditor'));
    forgivingAction('elementUpdate', this)();
    this.get('rawEditor').generateDiffEvents();
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
   * keyDown events are handled for simple input we take over from browser input
   */
  keyDown(event) {
    event = event.originalEvent ? event.originalEvent : event;
    if (this.isHandledInputEvent(event)) {
      if (this.isCtrlZ(event)) {
        event.preventDefault();
        this.get('rawEditor').undo();
      }
      else {
        this.get('rawEditor').createSnapshot();
        let handlers = this.get('inputHandlers').filter(h => h.isHandlerFor(event));
        handlers.some( handler => {
          let response = handler.handleEvent(event);
          if (!response.get('allowBrowserDefault'))
            event.preventDefault();
          if (!response.get('allowPropagation'))
            return;
        });
      }
      this.get('rawEditor').updateRichNode();
      this.get('rawEditor').generateDiffEvents();
      this.set('isCaptured', true);
    }
    else {
      this.get('rawEditor').createSnapshot();
    }
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
    this.get('rawEditor').generateDiffEvents();
  },

  handleUncapturedEvent() {
    if (!this.get('isCaptured')) {
      this.get('rawEditor').externalDomUpdate('uncaptured event', () => {});
    }
    this.set('isCaptured', false);
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
    event = (event.originalEvent) ? event.originalEvent : event ;
    return this.isCtrlZ(event) || this.get('inputHandlers').filter(h => h.isHandlerFor(event)).length > 0;
  },

  isCtrlZ(event) {
    return event.ctrlKey && event.key === 'z';
  }
});
