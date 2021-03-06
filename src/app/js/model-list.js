/**
Provides an API for managing an ordered list of Model instances.

In addition to providing convenient `add`, `create`, `refresh`, and `remove`
methods for managing the models in the list, ModelLists are also bubble targets
for events on the model instances they contain. This means, for example, that
you can add several models to a list, and then subscribe to the `*:change` event
on the list to be notified whenever any model in the list changes.

ModelLists also maintain sort order efficiently as models are added and removed,
based on a custom `comparator` function you may define (if no comparator is
defined, models are sorted in insertion order).

@module model-list
@class ModelList
@constructor
@uses ArrayList
@uses Base
**/

var Lang   = Y.Lang,
    YArray = Y.Array,

    /**
    Fired when a model is added to the list.

    Listen to the `on` phase of this event to be notified before a model is
    added to the list. Calling `e.preventDefault()` during the `on` phase will
    prevent the model from being added.

    Listen to the `after` phase of this event to be notified after a model has
    been added to the list.

    @event add
    @param {Model} model The model being added.
    @param {int} index The index at which the model will be added.
    @preventable _defAddFn
    **/
    EVT_ADD = 'add',

    /**
    Fired when the list is completely refreshed via the `refresh()` method or
    sorted via the `sort()` method.

    Listen to the `on` phase of this event to be notified before the list is
    refreshed. Calling `e.preventDefault()` during the `on` phase will prevent
    the list from being refreshed.

    Listen to the `after` phase of this event to be notified after the list has
    been refreshed.

    @event refresh
    @param {Model[]} models Array of the list's new models after the refresh.
    @param {String} src Source of the event. May be either `'refresh'` or
      `'sort'`.
    @preventable _defRefreshFn
    **/
    EVT_REFRESH = 'refresh',

    /**
    Fired when a model is removed from the list.

    Listen to the `on` phase of this event to be notified before a model is
    removed from the list. Calling `e.preventDefault()` during the `on` phase
    will prevent the model from being removed.

    Listen to the `after` phase of this event to be notified after a model has
    been removed from the list.

    @event remove
    @param {Model} model The model being removed.
    @param {int} index The index of the model being removed.
    @preventable _defRemoveFn
    **/
    EVT_REMOVE = 'remove';

function ModelList() {
    ModelList.superclass.constructor.apply(this, arguments);
}

Y.ModelList = Y.extend(ModelList, Y.Base, {
    // -- Public Properties ----------------------------------------------------

    /**
    The `Model` class or subclass of the models in this list.

    This property is `null` by default, and is intended to be overridden in a
    subclass or specified as a config property at instantiation time. It will be
    used to create model instances automatically based on attribute hashes
    passed to the `add()`, `create()`, and `remove()` methods.

    @property model
    @type Model
    @default `null`
    **/
    model: null,

    // -- Lifecycle Methods ----------------------------------------------------
    initializer: function (config) {
        config || (config = {});

        var model = this.model = config.model || this.model;

        this.publish(EVT_ADD,     {defaultFn: this._defAddFn});
        this.publish(EVT_REFRESH, {defaultFn: this._defRefreshFn});
        this.publish(EVT_REMOVE,  {defaultFn: this._defRemoveFn});

        if (model) {
            this.after('*:idChange', this._afterIdChange);
        } else {
            Y.log('No model class specified.', 'warn', 'model-list');
        }

        this._clear();
    },

    destructor: function () {
        YArray.each(this._items, this._detachList, this);
    },

    // -- Public Methods -------------------------------------------------------

    /**
    Adds the specified model or array of models to this list.

    @example
        // Add a single model instance.
        list.add(new Model({foo: 'bar'}));

        // Add a single model, creating a new instance automatically.
        list.add({foo: 'bar'});

        // Add multiple models, creating new instances automatically.
        list.add([
            {foo: 'bar'},
            {baz: 'quux'}
        ]);

    @method add
    @param {Model|Model[]|Object|Object[]} models Models to add. May be existing
      model instances or hashes of model attributes, in which case new model
      instances will be created from the hashes.
    @param {Object} [options] Data to be mixed into the event facade of the
        `add` event(s) for the added models.
      @param {Boolean} [options.silent=false] If `true`, no `add` event(s) will
          be fired.
    @return {Model|Model[]} Added model or array of added models.
    **/
    add: function (models, options) {
        if (Lang.isArray(models)) {
            return YArray.map(models, function (model) {
                return this._add(model, options);
            }, this);
        } else {
            return this._add(models, options);
        }
    },

    /**
    Define this method to provide a function that takes a model as a parameter
    and returns a value by which that model should be sorted relative to other
    models in this list.

    By default, no comparator is defined, meaning that models will not be sorted
    (they'll be stored in the order they're added).

    @example
        var list = new Y.ModelList;

        list.comparator = function (model) {
            return model.get('id'); // Sort models by id.
        };

    @method comparator
    @param {Model} model Model being sorted.
    @return {Number|String} Value by which the model should be sorted relative
      to other models in this list.
    **/

    // comparator is not defined by default

    /**
    Creates or updates the specified model on the server, then adds it to this
    list if the server indicates success.

    @method create
    @param {Model|Object} model Model to create. May be an existing model
      instance or a hash of model attributes, in which case a new model instance
      will be created from the hash.
    @param {Object} [options] Options to be passed to the model's `sync()` and
        `set()` methods and mixed into the `add` event when the model is added
        to the list.
      @param {Boolean} [options.silent=false] If `true`, no `add` event(s) will
          be fired.
    @param {callback} [callback] Called when the sync operation finishes.
      @param {Error} callback.err If an error occurred, this parameter will
        contain the error. If the sync operation succeeded, _err_ will be
        falsy.
      @param {mixed} callback.response The server's response.
    @return {Model} Created model.
    **/
    create: function (model, options, callback) {
        var self = this;

        // Allow callback as second arg.
        if (typeof options === 'function') {
            callback = options;
            options  = {};
        }

        if (!(model instanceof Y.Model)) {
            model = new this.model(model);
        }

        return model.save(options, function (err) {
            if (!err) {
                self.add(model, options);
            }

            callback && callback.apply(null, arguments);
        });
    },

    /**
    Returns the model with the specified _clientId_, or `null` if not found.

    @method getByClientId
    @param {String} clientId Client id.
    @return {Model} Model, or `null` if not found.
    **/
    getByClientId: function (clientId) {
        return this._clientIdMap[clientId] || null;
    },

    /**
    Returns the model with the specified _id_, or `null` if not found.

    Note that models aren't expected to have an id until they're saved, so if
    you're working with unsaved models, it may be safer to call
    `getByClientId()`.

    @method getById
    @param {String} id Model id.
    @return {Model} Model, or `null` if not found.
    **/
    getById: function (id) {
        return this._idMap[id] || null;
    },

    /**
    Calls the named method on every model in the list. Any arguments provided
    after _name_ will be passed on to the invoked method.

    @method invoke
    @param {String} name Name of the method to call on each model.
    @param {any} *args Zero or more arguments to pass to the invoked method.
    @return {Array} Array of return values, indexed according to the index of
      the model on which the method was called.
    **/
    invoke: function (name /*, *args */) {
        var args = [this._items, name].concat(YArray(arguments, 1, true));
        return YArray.invoke.apply(YArray, args);
    },

    /**
    Returns the model at the specified _index_.

    @method item
    @param {int} index Index of the model to fetch.
    @return {Model} The model at the specified index, or `undefined` if there
      isn't a model there.
    **/

    // item() is inherited from ArrayList.

    /**
    Loads this list of models from the server.

    This method delegates to the `sync()` method to perform the actual load
    operation, which is an asynchronous action. Specify a _callback_ function to
    be notified of success or failure.

    If the load operation succeeds, a `refresh` event will be fired.

    @method load
    @param {Object} [options] Options to be passed to `sync()` and to
      `refresh()` when adding the loaded models. It's up to the custom sync
      implementation to determine what options it supports or requires, if any.
    @param {callback} [callback] Called when the sync operation finishes.
      @param {Error} callback.err If an error occurred, this parameter will
        contain the error. If the sync operation succeeded, _err_ will be
        falsy.
      @param {mixed} callback.response The server's response. This value will
        be passed to the `parse()` method, which is expected to parse it and
        return an array of model attribute hashes.
    @chainable
    **/
    load: function (options, callback) {
        var self = this;

        // Allow callback as only arg.
        if (typeof options === 'function') {
            callback = options;
            options  = {};
        }

        this.sync('read', options, function (err, response) {
            if (!err) {
                self.refresh(self.parse(response), options);
            }

            callback && callback.apply(null, arguments);
        });

        return this;
    },

    /**
    Executes the specified function on each model in this list and returns an
    array of the function's collected return values.

    @method map
    @param {Function} fn Function to execute on each model.
      @param {Model} fn.model Current model being iterated.
      @param {int} fn.index Index of the current model in the list.
      @param {Model[]} fn.models Array of models being iterated.
    @param {Object} [thisObj] `this` object to use when calling _fn_.
    @return {Array} Array of return values from _fn_.
    **/
    map: function (fn, thisObj) {
        return YArray.map(this._items, fn, thisObj);
    },

    /**
    Called to parse the _response_ when the list is loaded from the server.
    This method receives a server _response_ and is expected to return an array
    of model attribute hashes.

    The default implementation assumes that _response_ is either an array of
    attribute hashes or a JSON string that can be parsed into an array of
    attribute hashes. If _response_ is a JSON string and either `Y.JSON` or the
    native `JSON` object are available, it will be parsed automatically. If a
    parse error occurs, an `error` event will be fired and the model will not be
    updated.

    You may override this method to implement custom parsing logic if necessary.

    @method parse
    @param {mixed} response Server response.
    @return {Object[]} Array of model attribute hashes.
    **/
    parse: function (response) {
        if (typeof response === 'string') {
            try {
                return Y.JSON.parse(response) || [];
            } catch (ex) {
                Y.error('Failed to parse JSON response.');
                return null;
            }
        }

        return response || [];
    },

    /**
    Completely replaces all models in the list with those specified, and fires a
    single `refresh` event.

    Use `refresh` when you want to add or remove a large number of items at once
    without firing `add` or `remove` events for each one.

    @method refresh
    @param {Model[]|Object[]} models Models to add. May be existing model
      instances or hashes of model attributes, in which case new model instances
      will be created from the hashes.
    @param {Object} [options] Data to be mixed into the event facade of the
        `refresh` event.
      @param {Boolean} [options.silent=false] If `true`, no `refresh` event will
          be fired.
    @chainable
    **/
    refresh: function (models, options) {
        options || (options = {});

        var facade = Y.merge(options, {
                src   : 'refresh',
                models: YArray.map(models, function (model) {
                    return model instanceof Y.Model ? model :
                            new this.model(model);
                }, this)
            });

        options.silent ? this._defRefreshFn(facade) :
                this.fire(EVT_REFRESH, facade);

        return this;
    },

    /**
    Removes the specified model or array of models from this list.

    @method remove
    @param {Model|Model[]} models Models to remove.
    @param {Object} [options] Data to be mixed into the event facade of the
        `remove` event(s) for the removed models.
      @param {Boolean} [options.silent=false] If `true`, no `remove` event(s)
          will be fired.
    @return {Model|Model[]} Removed model or array of removed models.
    **/
    remove: function (models, options) {
        if (Lang.isArray(models)) {
            return YArray.map(models, function (model) {
                return this._remove(model, options);
            }, this);
        } else {
            return this._remove(models, options);
        }
    },

    /**
    Forcibly re-sorts the list.

    Usually it shouldn't be necessary to call this method since the list
    maintains its sort order when items are added and removed, but if you change
    the `comparator` function after items are already in the list, you'll need
    to re-sort.

    @method sort
    @param {Object} [options] Data to be mixed into the event facade of the
        `refresh` event.
      @param {Boolean} [options.silent=false] If `true`, no `refresh` event will
          be fired.
    @chainable
    **/
    sort: function (options) {
        var comparator = this.comparator,
            models     = this._items.concat(),
            facade;

        if (!comparator) {
            return this;
        }

        options || (options = {});

        models.sort(function (a, b) {
            var aValue = comparator(a),
                bValue = comparator(b);

            return aValue < bValue ? -1 : (aValue > bValue ? 1 : 0);
        });

        facade = Y.merge(options, {
            models: models,
            src   : 'sort'
        });

        options.silent ? this._defRefreshFn(facade) :
                this.fire(EVT_REFRESH, facade);

        return this;
    },

    /**
    Override this method to provide a custom persistence implementation for this
    list. The default method just calls the callback without actually doing
    anything.

    This method is called internally by `load()`.

    @method sync
    @param {String} action Sync action to perform. May be one of the following:

      * `create`: Store a list of newly-created models for the first time.
      * `delete`: Delete a list of existing models.
      * 'read'  : Load a list of existing models.
      * `update`: Update a list of existing models.

      Currently, model lists only make use of the `read` action, but other
      actions may be used in future versions.

    @param {Object} [options] Sync options. It's up to the custom sync
      implementation to determine what options it supports or requires, if any.
    @param {callback} [callback] Called when the sync operation finishes.
      @param {Error} callback.err If an error occurred, this parameter will
        contain the error. If the sync operation succeeded, _err_ will be
        falsy.
      @param {mixed} [callback.response] The server's response. This value will
        be passed to the `parse()` method, which is expected to parse it and
        return an array of model attribute hashes.
    **/
    sync: function (/* action, options, callback */) {
        var callback = YArray(arguments, 0, true).pop();

        if (typeof callback === 'function') {
            callback();
        }
    },

    /**
    Returns an array containing the models in this list.

    @method toArray
    @return {Array} Array containing the models in this list.
    **/
    toArray: function () {
        return this._items.concat();
    },

    /**
    Returns an array containing attribute hashes for each model in this list,
    suitable for being passed to `Y.JSON.stringify()`.

    Under the hood, this method calls `toJSON()` on each model in the list and
    pushes the results into an array.

    @method toJSON
    @return {Object[]} Array of model attribute hashes.
    @see Model.toJSON()
    **/
    toJSON: function () {
        return this.map(function (model) {
            return model.toJSON();
        });
    },

    // -- Protected Methods ----------------------------------------------------

    /**
    Adds the specified _model_ if it isn't already in this list.

    @method _add
    @param {Model|Object} model Model or object to add.
    @param {Object} [options] Data to be mixed into the event facade of the
        `add` event for the added model.
      @param {Boolean} [options.silent=false] If `true`, no `add` event will be
          fired.
    @return {Model} The added model.
    @protected
    **/
    _add: function (model, options) {
        var facade;

        options || (options = {});

        if (!(model instanceof Y.Model)) {
            model = new this.model(model);
        }

        if (this._clientIdMap[model.get('clientId')]) {
            Y.error('Model already in list.');
            return;
        }

        facade = Y.merge(options, {
            index: this._findIndex(model),
            model: model
        });

        options.silent ? this._defAddFn(facade) : this.fire(EVT_ADD, facade);

        return model;
    },

    /**
    Sets the specified model's `list` attribute to point to this list and adds
    this list as a bubble target for the model's events. Also removes the model
    from any other list it's currently in.

    @method _attachList
    @param {Model} model Model to attach to this list.
    @protected
    **/
    _attachList: function (model) {
        // If the model is already attached to a list, remove it from that list.
        if (model.list) {
            model.list.remove(model);
        }

        // Attach this list and make it a bubble target for the model.
        model.list = this;
        model.addTarget(this);
    },

    /**
    Clears all internal state and the internal list of models, returning this
    list to an empty state. Automatically detaches all models in the list.

    @method _clear
    @protected
    **/
    _clear: function () {
        YArray.each(this._items, this._detachList, this);

        this._clientIdMap = {};
        this._idMap       = {};
        this._items       = [];
    },

    /**
    Unsets the specified model's `list` attribute and removes this list as a
    bubble target for the model's events.

    @method _detachList
    @param {Model} model Model to detach.
    @protected
    **/
    _detachList: function (model) {
        delete model.list;
        model.removeTarget(this);
    },

    /**
    Returns the index at which the given _model_ should be inserted to maintain
    the sort order of the list.

    @method _findIndex
    @param {Model} model The model being inserted.
    @return {int} Index at which the model should be inserted.
    @protected
    **/
    _findIndex: function (model) {
        var comparator = this.comparator,
            items      = this._items,
            max        = items.length - 1,
            min        = 0,
            item, middle, needle;

        if (!comparator || !items.length) { return items.length; }

        needle = comparator(model);

        // Perform an iterative binary search to determine the correct position
        // based on the return value of the `comparator` function.
        while (min < max) {
            middle = (min + max) / 2;
            item   = items[middle];

            if (item && comparator(item) < needle) {
                min = middle + 1;
            } else {
                max = middle;
            }
        }

        return min;
    },

    /**
    Removes the specified _model_ if it's in this list.

    @method _remove
    @param {Model} model Model to remove.
    @param {Object} [options] Data to be mixed into the event facade of the
        `remove` event for the removed model.
      @param {Boolean} [options.silent=false] If `true`, no `remove` event will
          be fired.
    @return {Model} Removed model.
    @protected
    **/
    _remove: function (model, options) {
        var index = this.indexOf(model),
            facade;

        options || (options = {});

        if (index === -1) {
            Y.error('Model not in list.');
            return;
        }
    
        facade = Y.merge(options, {
            index: index,
            model: model
        });
    
        options.silent ? this._defRemoveFn(facade) :
                this.fire(EVT_REMOVE, facade);

        return model;
    },

    // -- Event Handlers -------------------------------------------------------

    /**
    Updates the model maps when a model's `id` attribute changes.

    @method _afterIdChange
    @param {EventFacade} e
    @protected
    **/
    _afterIdChange: function (e) {
        e.prevVal && delete this._idMap[e.prevVal];
        e.newVal && (this._idMap[e.newVal] = e.target);
    },

    // -- Default Event Handlers -----------------------------------------------

    /**
    Default event handler for `add` events.

    @method _defAddFn
    @param {EventFacade} e
    @protected
    **/
    _defAddFn: function (e) {
        var model = e.model,
            id    = model.get('id');

        this._clientIdMap[model.get('clientId')] = model;

        if (id) {
            this._idMap[id] = model;
        }

        this._attachList(model);
        this._items.splice(e.index, 0, model);
    },

    /**
    Default event handler for `refresh` events.

    @method _defRefreshFn
    @param {EventFacade} e
    @protected
    **/
    _defRefreshFn: function (e) {
        // When fired from the `sort` method, we don't need to clear the list or
        // add any models, since the existing models are sorted in place.
        if (e.src === 'sort') {
            this._items = e.models.concat();
            return;
        }

        this._clear();

        if (e.models.length) {
            this.add(e.models, {silent: true});
        }
    },

    /**
    Default event handler for `remove` events.

    @method _defRemoveFn
    @param {EventFacade} e
    @protected
    **/
    _defRemoveFn: function (e) {
        var model = e.model,
            id    = model.get('id');

        this._detachList(model);
        delete this._clientIdMap[model.get('clientId')];

        if (id) {
            delete this._idMap[id];
        }

        this._items.splice(e.index, 1);
    }
}, {
    NAME: 'modelList'
});

Y.augment(ModelList, Y.ArrayList);

/**
Returns an array containing the values of the specified attribute from each
model in this list.

@method get
@param {String} name Attribute name or object property path.
@return {Array} Array of attribute values.
@see Model.get()
**/

/**
Returns an array containing the HTML-escaped versions of the values of the
specified string attributes from each model in this list. The values are escaped
using `Y.Escape.html()`.

@method getAsHTML
@param {String} name Attribute name or object property path.
@return {String[]} Array of HTML-escaped attribute values.
@see Model.getAsHTML()
**/

/**
Returns an array containing the URL-encoded versions of the values of the
specified string attributes from each model in this list. The values are encoded
using the native `encodeURIComponent()` function.

@method getAsURL
@param {String} name Attribute name or object property path.
@return {String[]} Array of URL-encoded attribute values.
@see Model.getAsURL()
**/

Y.ArrayList.addMethod(ModelList.prototype, [
    'get', 'getAsHTML', 'getAsURL'
]);
