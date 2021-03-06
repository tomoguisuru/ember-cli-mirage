import { singularize, pluralize } from '../utils/inflector';
import Collection from './collection';
import Association from './associations/association';

export default function(db) {

  if (!db) {
    throw 'Mirage: A schema requires a db';
  }

  this.db = db;
  this._registry = {};

  this.registerModels = function(hash) {
    var _this = this;

    Object.keys(hash).forEach(function(type) {
      _this.registerModel(type, hash[type]);
    });
  };

  this.registerModel = function(type, ModelClass) {
    var _this = this;

    // Store model & fks in registry
    this._registry[type] = this._registry[type] || {class: null, foreignKeys: []}; // we may have created this key before, if another model added fks to it
    this._registry[type].class = ModelClass;

    Object.keys(ModelClass).forEach(function(key) {
      if (ModelClass[key] instanceof Association) {
        var association = ModelClass[key];
        var associatedType = association.type || singularize(key);
        association.owner = type;
        association.target = associatedType;

        // Update the registry with this association's foreign keys
        var result = association.getForeignKeyArray();
        var fkHolder = result[0];
        var fk = result[1];
        _this._addForeignKeyToRegistry(fkHolder, fk);
      }
    });

    // Add association methods (until we can figure out how to add them as static class methods upon definition)
    ModelClass.prototype.addAssociationMethods(this);

    // Create db, if doesn't exist
    var collection = pluralize(type);
    if (!this.db[collection]) {
      this.db.createCollection(collection);
    }

    // Create the entity methods
    this[type] = {
      new: this.new.bind(this, type),
      create: this.create.bind(this, type),
      all: this.all.bind(this, type),
      find: this.find.bind(this, type),
      where: this.where.bind(this, type)
    };

    return this;
  };

  this.new = function(type, attrs) {
    return this._instantiateModel(type, attrs);
  };

  this.create = function(type, attrs) {
    var collection = this._collectionForType(type);
    var augmentedAttrs = collection.insert(attrs);

    return this._instantiateModel(type, augmentedAttrs);
  };

  this.all = function(type) {
    var collection = this._collectionForType(type);

    return this._hydrate(collection, type);
  };

  this.find = function(type, ids) {
    var collection = this._collectionForType(type);
    var records = collection.find(ids);

    if (_.isArray(ids)) {
      if (records.length !== ids.length) {
        throw 'Couldn\'t find all ' + pluralize(type) + ' with ids: (' + ids.join(',') + ') (found ' + records.length + ' results, but was looking for ' + ids.length + ')';
      }
    }

    return this._hydrate(records, type);
  };

  this.where = function(type, query) {
    var collection = this._collectionForType(type);
    var records = collection.where(query);

    return this._hydrate(records, type);
  };

  /*
    Private methods
  */
  this._collectionForType = function(type) {
    var collection = pluralize(type);
    if (!this.db[collection]) {
      throw 'Mirage: You\'re trying to find model(s) of type ' + type + ' but this collection doesn\'t exist in the database.';
    }

    return this.db[collection];
  };

  this._addForeignKeyToRegistry = function(type, fk) {
    this._registry[type] = this._registry[type] || {class: null, foreignKeys: []};
    this._registry[type].foreignKeys.push(fk);
  };

  this._instantiateModel = function(type, attrs) {
    var ModelClass = this._modelFor(type);
    var fks = this._foreignKeysFor(type);

    return new ModelClass(this, type, attrs, fks);
  };

  this._modelFor = function(type) {
    return this._registry[type].class;
  };

  this._foreignKeysFor = function(type) {
    return this._registry[type].foreignKeys;
  };

  /*
    Takes a record and returns a model, or an array of records
    and returns a collection.
  */
  this._hydrate = function(records, type) {
    var _this = this;

    if (_.isArray(records)) {
      var models = records.map(function(record) {
        return _this._instantiateModel(type, record);
      });

      return new Collection(models);

    } else {
      var record = records;
      return !record ? null : this._instantiateModel(type, record);
    }
  };
}
