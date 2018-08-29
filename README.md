# @lblod/ember-contenteditable-editor

Addon providing a content editable component

## Installation
```
ember install @lblod/ember-contenteditable-editor
```

## Usage
This addon provides a component `content-editable` and a object `raw-editor` that are best used together. By binding the `currentSelectionUpdated` and `rootNodeUpdated` actions to the `updateCurrentSelection` and `updateRootNode` methods on an instance of raw-editor you can use the raw-editor interface to interact with the content of the content-editable.


For example:

template `application.hbs`
```
{{#content-editable editable=true focused=true yieldHTML=true 
                    textInsert=(action 'handleTextInsert') 
                    textRemove=(action 'handleTextRemove') 
                    selectionUpdate=(action 'selectionUpdate')
                    elementUpdate=(action 'elementUpdate')
                    rawEditorInit=(action 'rawEditorInit')}}
<p>my test html</p>
{{/content-editable }}
```

controller `application.js`
```
import Controller from '@ember/controller';
import { debug } from '@ember/debug';
export default Controller.extend({
  rawEditor: null,
  actions:{
    rawEditorInit(editor) { 
      this.set('rawEditor', editor);
    },
    selectionUpdate() {
      debug(this.get('rawEditor.currentSelection'));
    },
    handleTextInsert(start, content) {
      debug(start, content);
    },
    handleTextRemove(start,end) {
      debug(start,end);
    },
    elementUpdate() {
      debug(this.get('rawEditor.rootNode'));
    }
  }
});
```

See dummy app for a working example.

## Actions
### textInsert
This function is called after text is inserted. 

Params:
  * [int] position 
  * [string] text the inserted text
### textRemove
This function is called after text is removed

Params:
  * [int] range start
  * [int] range end
  
### selectionUpdate
This function is called after the cursor position or selection was updated. The current selection is available in rawEditor.currentSelection

It has no params

### elementUpdate
This function is called after the root element was updated. The element is available in rawEditor.rootNode

### rawEditorInit
This function is called on component init and provides the rawEditor interface to the consumer.

Paras:
* [RawEditor] raw editor, the interfacec to the editor

## Properties

* focused [boolean]
* yieldHTML [boolean]
* editable [boolean]

## Extending the editor

### Responding to input
All keyboard and mouse input is captured in the content-editable component. These events are then passed on to inputHandlers.

An input handler should implement at least the following methods:

* `isHandlerFor(event)`, which tests if the handler can/will handle the provided event
* `handleEvent(event)`, which handles the event

For example
```
import EmberObject from '@ember/object';
import { reads, alias } from '@ember/object/computed';
import HandlerResponse from './handler-response';
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

### Providing extra APIs
These should be defined on the raw-editor interface.

### Build-in styling through markdown
Some basic styling is provided.
```
## Header "<h2>"  (after pressing enter)

** bold text ** (after pressing space)

* em text * (after pressing space)

_ underline _ (after pressing space)

1.[SPACE] (after pressing enter will result in <ol>)
*.[SPACE] (after pressing enter will result in <ul>)
```
