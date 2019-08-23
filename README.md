# @lblod/ember-contenteditable-editor
Emberjs addon that provides a content editable component. This component is the core of [ember-rdfa-editor](https://github.com/lblod/ember-rdfa-editor), a more feature complete component providing a toolbar and support for plugins.

ember-contenteditable-editor features:
 - it's fast
 - custom input handling through handlers
 - provides an interface to make selections and describe updates that can be used to interact with the content
 - sends out diff events (text removals and additions) through actions
 - sends out selection updates through actions

Supported browsers:
 - Chrome (latest 3)
 - Firefox (latest 3)
 - Edge (limited support)

## Installation
```
ember install @lblod/ember-contenteditable-editor
```

## Compatibility

* Ember.js v3.4 or above
* Ember CLI v2.13 or above
* Node.js v8 or above

## Contributing
See the [Contributing](CONTRIBUTING.md) guide for details.

## Usage
This addon provides a component `content-editable` that can be included in your application.

```
          {{#content-editable
             textInsert=(action 'handleTextInsert')
             textRemove=(action 'handleTextRemove')
             handleFullContentUpdate=(action 'handleFullContentUpdate')
             selectionUpdate=(action 'selectionUpdate')
             rawEditorInit=(action 'handleRawEditorInit')
             externalHandlers=handlers
             editable=true
             focused=true
             yieldHTML=true
          }}
          <p>initial content</p>
{{/content-editable}}
```

### integrating the contenteditable component
The contenteditable component provides a number of actions and an api to interact with it's content and input. After the component is rendered it will call the `rawEditorInit` action with an object `rawEditor` that contains attributes and apis to interact with the editor. These are detailed further down

When the editor detects a change in its text content a diff is calculated and the `textInsert` and `textRemove` actions are called for each insert and removal that was detected. (*note*: they are not called for html updates that do not change the text content).
The `handleFullContentUpdate` action is called when the entire diff was processed. These actions can be used to trigger your own logic on content updates.

The action `selectionUpdate` is called when the cursor position was changed or a selection was made.

Whether or not the content is editable can be set using the `editable` property, if `focused` is set the editor tries to autofocus itself. `yieldHTML` determines whether the editor should consider the yielded content as html or text (respectively a `{{{content}}}` or `{{content}}` render of the provided content).

### rawEditor interface
A short summary of the object is listed here:
 * `rawEditor.textContent` `string` current text content of the editor
 * `rawEditor.currentSelection` `array` the current selection
 * `rawEditor.richNode` `Object` internal representation of the editor content
 * `rawEditor.rootNode` `DOMElement` the dom element that contains the editor content
 * `rawEditor.selectCurrentSelection()` `function` returns a `Selection` for the current selected range that can be used in an update operation
 * `rawEditor.selectHighlight([start,end], options)` `function` returns a `Selection` for the specified range, this selection can be used in an update operation
 * `rawEditor.selectContent([start, end], options)` `function` returns a `Selection` based on an RDFa context that was specified in the options. This selection can be used in an update operation
 * `rawEditor.update(selection, { remove, add, set, desc})` `function`  Alters a selection from the API described above
 * `rawEditor.replaceDomNode(domNode, { callback, failedCallback, motivation})` `function` verifies the dom node is present in the internal representation and executes callback if succesfull, calls failedCallback if not.
 * `rawEditor.applyProperty(selection, property)`  `function` applies an `EditorProperty` to the selection
 * `rawEditor.cancelProperty(selection, property)` `function` cancels an `EditorProperty` on the selection
 * `rawEditor.toggleProperty(selection, property)` `function` toggles an `EditorProperty` on the selection
 * `rawEditor.togglePropertyAtCurrentPosition(property)` `function` toggles an `EditorProperty` on the current position, assumes a collapsed selection.

Other methods and attributes are available but should be considered internal or deprecated. A more complete description of this object is available in the (documented) code: [raw-editor.js](https://github.com/lblod/ember-contenteditable-editor/blob/master/addon/utils/raw-editor.js).

### Responding to input using handlers
All keyboard and mouse input is captured in the content-editable component. These events are then passed on to inputHandlers.

An input handler should implement at least the following methods:

* `isHandlerFor(event)`, which tests if the handler can/will handle the provided event
* `handleEvent(event)`, which handles the event

For example
```
import EmberObject from '@ember/object';
import { reads, alias } from '@ember/object/computed';
import HandlerResponse from '@lblod/ember-contenteditable-editor/utils/handler-response';
import { get } from '@ember/object';


/**
 * Event Handler, a event handler to handle everything
 *
 * @module contenteditable-editor
 * @class EventHandler
 * @constructor
 * @extends EmberObject
 */
export default EmberObject.extend({
  currentNode: alias('rawEditor.currentNode'),
  currentSelection: reads('rawEditor.currentSelection'),
  richNode: reads('rawEditor.richNode'),
  rootNode: reads('rawEditor.rootNode'),
  /**
   * tests this handler can handle the specified event
   * @method isHandlerFor
   * @param {DOMEvent} event
   * @return boolean
   * @public
   */
  isHandlerFor(event) {
    return true
  },

  /**
   * handle the event
   * @method handleEvent
   * @param {DOMEvent} event
   * @return {HandlerResponse} response
   */
  handleEvent() {
    return HandlerResponse.create({});
  }
}
```

You can provide externalHandlers by providing them in a sorted array to the component.

```
#js
    handleRawEditorInit(editor) {
      this.set('editor', editor);
      this.set('handlers', [MyHandler.create({rawEditor: editor })]);
    }
# hbs
{{content-editable externalHandlers=handlers}}
```

### editor properties
ember-contenteditable-editor provides `editor properties` to handle things like bold, italic and more complex cases. An editor property is considered to be active in a position in the tree based on any of its parent nodes, and which can be split/merged at will. This allows the ditor to optimize the html tree when required. 

For example "bold" could be represented by the following:

```
import EditorProperty from '@lblod/ember-contenteditable-editor/utils/editor-property';

class BoldProperty extends EditorProperty {
  constructor({tagName = 'strong', newContext = true}) {
    super({tagName, newContext});
  }
  enabledAt(richNode) {
    if (!richNode)
      return false;
    if (richNode.type === 'text') {
      return window.getComputedStyle(richNode.parent.domNode).fontWeight > 400;
    }
    else if (richNode.type === 'tag') {
      return window.getComputedStyle(richNode.domNode).fontWeight > 400;
    }
    else
      return false;
  }
}
const boldProperty = new BoldProperty({});
export default boldProperty;
```

`boldProperty` could then be used to mark a selection as bold using `rawEditor.toggleProperty([start,end], boldProperty)`

