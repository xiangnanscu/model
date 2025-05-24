/* eslint-disable max-len */
/* eslint-disable no-constant-condition */
import * as Fields from "./field.mjs";
import {
  IS_PG_KEYWORDS,
  clone,
  assert,
  capitalize,
  NULL,
  DEFAULT,
  as_token,
  as_literal,
  as_literal_without_brackets,
  unique,
  make_token,
  smart_quote,
  to_camel_case,
  request,
} from "./utils.mjs";
import Sql from "./sql.mjs";
import F from "./F.mjs";

// @ts-check

class Func {
  static __IS_FUNCTION__ = true;

  /**
   * @param {Object} [args]
   */
  constructor(args) {
    Object.assign(this, args || {});
  }

  /**
   * @param {Object} args
   */
  static class(args) {
    const SubClass = class extends this {};

    // 分别处理 name 属性和其他属性
    const { name, ...otherArgs } = args || {};

    // 设置其他属性
    Object.assign(SubClass, otherArgs);

    // 如果有 name 属性，使用 defineProperty 设置
    if (name) {
      Object.defineProperty(SubClass, "name", {
        value: name,
        configurable: true,
      });
    }

    SubClass.prototype.__index = SubClass;
    return SubClass;
  }

  /**
   * @param {Object} [args]
   */
  new(args) {
    return new this.constructor(args);
  }

  /**
   * @param {string | { 0: string, filter?: any }} column
   */
  __call(column) {
    if (typeof column === "string") {
      return this.new({ column });
    } else {
      return this.new({
        column: column[0],
        filter: column.filter,
      });
    }
  }
}

// Derived classes
const Count = Func.class({ name: "COUNT", suffix: "_count" });
const Sum = Func.class({ name: "SUM", suffix: "_sum" });
const Avg = Func.class({ name: "AVG", suffix: "_avg" });
const Max = Func.class({ name: "MAX", suffix: "_max" });
const Min = Func.class({ name: "MIN", suffix: "_min" });

const Q = new Proxy(
  class Q {
    /**
     * @param {Object} params
     */
    constructor(params) {
      Object.assign(this, params);
    }
  },
  {
    /** @type {ProxyHandler<any>} */
    apply: (target, _, [cond]) => {
      return new target({ cond, logic: "AND" });
    },
  },
);

Q.__IS_LOGICAL_BUILDER__ = true;

// Logical operations
Q.prototype.and = function (other) {
  return new Q({ left: this, right: other, logic: "AND" });
};

Q.prototype.or = function (other) {
  return new Q({ left: this, right: other, logic: "OR" });
};

Q.prototype.not = function () {
  return new Q({ left: this, logic: "NOT" });
};

const normalize_field_shortcuts = Fields.basefield.normalize_field_shortcuts;
const DEFAULT_PRIMARY_KEY = "id";
const DEFAULT_CTIME_KEY = "ctime";
const DEFAULT_UTIME_KEY = "utime";
const DEFAULT_STRING_MAXLENGTH = 256;
const MODEL_MERGE_NAMES = {
  admin: true,
  table_name: true,
  class_name: true,
  label: true,
  db_options: true,
  abstract: true,
  auto_primary_key: true,
  primary_key: true,
  unique_together: true,
  referenced_label_column: true,
  preload: true,
};
const BaseModel = {
  abstract: true,
  field_names: Array([DEFAULT_PRIMARY_KEY, DEFAULT_CTIME_KEY, DEFAULT_UTIME_KEY]),
  fields: {
    [DEFAULT_PRIMARY_KEY]: { type: "integer", primary_key: true, serial: true },
    [DEFAULT_CTIME_KEY]: {
      label: "创建时间",
      type: "datetime",
      auto_now_add: true,
    },
    [DEFAULT_UTIME_KEY]: {
      label: "更新时间",
      type: "datetime",
      auto_now: true,
    },
  },
};
const API_TABLE_NAMES = {
  T: true,
  D: true,
  U: true,
  V: true,
  W: true,
  NEW_RECORDS: true,
};
function check_conflicts(name) {
  assert(typeof name === "string", `name must be string, not ${typeof name} (${name})`);
  assert(!name.find("__", 1, true), "don't use __ in a table or column name");
  assert(!API_TABLE_NAMES[name], "don't use " + (name + " as a table or column name"));
}
function ensure_field_as_options(field, name) {
  if (field instanceof Fields.basefield) {
    field = field.get_options();
  } else {
    field = normalize_field_shortcuts(field);
  }
  if (name) {
    field.name = name;
  }
  assert(field.name, "you must define a name for a field");
  return field;
}
function normalize_field_names(field_names) {
  assert(typeof field_names === "object", "you must provide field_names for a model");
  for (const name of field_names) {
    assert(typeof name === "string", `field_names must be string, not ${typeof name}`);
  }
  return Array(field_names);
}
function make_record_meta(ModelClass) {
  class RecordClass extends Object {
    constructor(data) {
      super(data);
      for (const [k, v] of Object.entries(data)) {
        this[k] = v;
      }
      return this;
    }
    async delete(key) {
      key = ModelClass.check_unique_key(key || ModelClass.primary_key);
      if (this[key] === undefined) {
        throw new Error("empty value for delete key:" + key);
      }
      return await ModelClass.create_sql()
        .delete({ [key]: this[key] })
        .returning(key)
        .exec();
    }
    async save(names, key) {
      return await ModelClass.save(this, names, key);
    }
    async save_create(names, key) {
      return await ModelClass.save_create(this, names, key);
    }
    async save_update(names, key) {
      return await ModelClass.save_update(this, names, key);
    }
    async validate(names, key) {
      return await ModelClass.validate(this, names, key);
    }
    async validate_update(names) {
      return await ModelClass.validate_update(this, names);
    }
    async validate_create(names) {
      return await ModelClass.validate_create(this, names);
    }
  }
  Object.defineProperty(RecordClass, "name", {
    value: `${ModelClass.name}Record`,
  });
  return RecordClass;
}

const EXTEND_ATTRS = ["table_name", "label", "referenced_label_column", "preload"];
const compound_types = {
  array: true,
  json: true,
  table: true,
  password: true,
  text: true,
  alioss_list: true,
  alioss_image_list: true,
};

function throw_field_error(name, table_name) {
  throw new Error(`invalid field name '${name}' for model '${table_name}'`);
}
const select_args = [
  "select",
  "select_related",
  "select_related_labels",
  "where",
  "order",
  "group",
  "having",
  "limit",
  "offset",
  "distinct",
  "raw",
  "compact",
  "flat",
  "get",
  "try_get",
  "exists",
];
function ensure_array(o) {
  if (!Array.isArray(o)) {
    return [o];
  }
  return o;
}
class ValidateError extends Error {
  constructor({ name, message, label, index, value }) {
    super(message);
    Object.assign(this, { name, label, index, value });
  }
  toString() {
    return `MODEL FIELD ERROR: ${this.name}(${this.label})+${this.message}`;
  }
}
class ValidateBatchError extends ValidateError {
  constructor({ name, message, label, index, batch_index, value }) {
    super({ name, message, label, index, value });
    Object.assign(this, { batch_index });
  }
}
class Xodel {
  constructor(options) {
    return this.constructor.create_model(options);
  }
  static ValidateError = ValidateError;
  static ValidateBatchError = ValidateBatchError;
  static BaseModel = BaseModel;
  static DEFAULT_PRIMARY_KEY = DEFAULT_PRIMARY_KEY;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static token = make_token;
  static as_token = as_token;
  static as_literal = as_literal;
  static http_model_cache = {};
  static request = request;
  static __SQL_BUILDER__ = true;
  static smart_quote = smart_quote;
  static Q = Q;
  static F = F;
  static Count = Count;
  static Sum = Sum;
  static Avg = Avg;
  static Max = Max;
  static Min = Min;

  static _create_model_proxy(ModelClass) {
    const proxy = new Proxy(ModelClass, {
      get(obj, k) {
        const sql_k = Sql.prototype[k];
        if (typeof sql_k === "function") {
          return function (...varargs) {
            return sql_k.call(ModelClass.create_sql(), ...varargs);
          };
        }
        return ModelClass[k];
      },
      set(obj, prop, value) {
        obj[prop] = value;
        return true;
      },
    });
    Object.setPrototypeOf(proxy, this);
    return proxy;
  }

  static create_model(options) {
    return this._make_model_class(this.normalize(options));
  }
  static transaction(callback) {
    return this.query.transaction(callback);
  }
  static atomic(func) {
    return (request) => Xodel.transaction(() => func(request));
  }
  static make_field_from_json(options) {
    assert(!options[0]);
    assert(options.name, "no name provided");
    if (!options.type) {
      if (options.reference) {
        options.type = "foreignkey";
      } else if (options.model) {
        options.type = "table";
      } else {
        options.type = "string";
      }
    }
    if ((options.type === "string" || options.type === "alioss") && !options.maxlength) {
      options.maxlength = DEFAULT_STRING_MAXLENGTH;
    }
    const fcls = Fields[options.type];
    if (!fcls) {
      throw new Error("invalid field type:" + String(options.type));
    }
    const res = fcls.create_field(options);
    return res;
  }
  static create_sql() {
    return Sql.new({
      model: this,
      table_name: this._table_name_token || smart_quote(this.table_name),
      _as: "T",
    });
  }
  static is_model_class(model) {
    return typeof model === "object" && model.__IS_MODEL_CLASS__;
  }
  static check_field_name(name) {
    check_conflicts(name);
    if (
      name !== "name" &&
      name !== "apply" &&
      name !== "call" &&
      (Object.prototype.hasOwnProperty.call(this, name) ||
        Object.prototype.hasOwnProperty.call(this.prototype, name))
    ) {
      throw new Error(`field name '${name}' conflicts with model class attributes`);
    }
    // TODO: 留到sqlModel实现
    assert(
      !IS_PG_KEYWORDS[name.upper()],
      `${name} is a postgresql reserved word, can't be used as a table or column name`,
    );
  }
  static _make_model_class(opts) {
    let auto_primary_key;
    if (opts.auto_primary_key === undefined) {
      auto_primary_key = Xodel.auto_primary_key;
    } else {
      auto_primary_key = opts.auto_primary_key;
    }
    class ModelClass extends this {
      static table_name = opts.table_name;
      static class_name = opts.class_name;
      static admin = opts.admin || {};
      static label = opts.label || opts.table_name;
      static fields = opts.fields;
      static field_names = opts.field_names;
      static mixins = opts.mixins;
      static extends = opts.extends;
      static abstract = opts.abstract;
      static primary_key = opts.primary_key;
      static unique_together = opts.unique_together;
      static auto_primary_key = auto_primary_key;
      static referenced_label_column = opts.referenced_label_column;
      static preload = opts.preload;
      static names = [];
      static detail_names = [];
      static foreignkey_fields = {};
      static reversed_fields = {};
      constructor(data) {
        super(data);
        return ModelClass.create_record(data);
      }
    }

    if (ModelClass.preload === undefined) {
      ModelClass.preload = true;
    }
    if (Xodel.Query) {
      if (opts.db_options) {
        ModelClass.query = Xodel.Query(opts.db_options);
      } else if (this.db_options) {
        ModelClass.query = Xodel.Query(this.db_options);
      } else {
        // https://www.npmjs.com/package/postgres#connection-details
        ModelClass.query = Xodel.Query({
          host: process.env.PGHOST || "127.0.0.1",
          port: process.env.PGPORT || 5432,
          database: process.env.PGDATABASE || "test",
          user: process.env.PGUSER || "postgres",
          password: process.env.PGPASSWORD || "postgres",
          idle_timeout: process.env.PG_IDLE_TIMEOUT || 20,
          connect_timeout: process.env.PG_CONNECT_TIMEOUT || 2,
        });
      }
    }
    let pk_defined = false;
    for (const name of ModelClass.field_names) {
      const field = ModelClass.fields[name];
      field.get_model = () => ModelClass;
      if (field.primary_key) {
        const pk_name = field.name;
        assert(!pk_defined, `duplicated primary key: "${pk_name}" and "${pk_defined}"`);
        pk_defined = pk_name;
        ModelClass.primary_key = pk_name;
        if (!field.serial) {
          ModelClass.names.push(pk_name);
        }
      } else {
        ModelClass.detail_names.push(name);
        if (field.auto_now) {
          ModelClass.auto_now_name = field.name;
        } else if (field.auto_now_add) {
          ModelClass.auto_now_add_name = field.name;
        } else {
          ModelClass.names.push(name);
        }
      }
    }
    const uniques = [];
    for (const unique_group of ModelClass.unique_together || []) {
      for (const name of unique_group) {
        if (!ModelClass.fields[name]) {
          throw new Error(
            `invalid unique_together name ${name} for model ${ModelClass.table_name}`,
          );
        }
      }
      uniques.push(clone(unique_group));
    }
    ModelClass.unique_together = uniques;
    ModelClass.__IS_MODEL_CLASS__ = true;
    if (ModelClass.table_name) {
      ModelClass.materialize_with_table_name({
        table_name: ModelClass.table_name,
      });
    } else {
      ModelClass.set_class_name("Abstract");
    }
    ModelClass.set_label_name_dict();
    ModelClass.ensure_admin_list_names();
    if (ModelClass.auto_now_add_name) {
      ModelClass.ensure_ctime_list_names(ModelClass.auto_now_add_name);
    }
    ModelClass.resolve_foreignkey_self();
    if (!opts.abstract) {
      ModelClass.resolve_foreignkey_related();
    }
    const proxy = this._create_model_proxy(ModelClass);
    return proxy;
  }
  static normalize(options) {
    const _extends = options.extends;
    let abstract;
    if (options.abstract !== undefined) {
      abstract = !!options.abstract;
    } else {
      abstract = options.table_name === undefined;
    }
    const model = {
      table_name: options.table_name,
      admin: clone(options.admin || {}),
    };
    for (const extend_attr of EXTEND_ATTRS) {
      if (options[extend_attr] === undefined && _extends && _extends[extend_attr]) {
        model[extend_attr] = _extends[extend_attr];
      } else {
        model[extend_attr] = options[extend_attr];
      }
    }
    const opts_fields = {};
    const opts_field_names = [];
    const hash_fields = Array.isArray(options.fields)
      ? Object.fromEntries(options.fields.map((f) => [f.name, f]))
      : options.fields || {};
    for (let [key, field] of Object.entries(hash_fields)) {
      field = ensure_field_as_options(field, key);
      opts_field_names.push(key);
      opts_fields[key] = field;
    }
    let opts_names = options.field_names;
    if (!opts_names) {
      if (_extends) {
        opts_names = unique([..._extends.field_names, ...opts_field_names]);
      } else {
        opts_names = unique(opts_field_names);
      }
    }
    model.field_names = normalize_field_names(clone(opts_names));
    model.fields = {};
    for (const name of model.field_names) {
      if (!abstract) {
        this.check_field_name(name);
      }
      let field = opts_fields[name];
      if (!field) {
        const tname = model.table_name || "[abstract model]";
        if (_extends) {
          field = _extends.fields[name];
          if (!field) {
            throw new Error(`'${tname}' field name '${name}' is not in fields and parent fields`);
          } else {
            field = ensure_field_as_options(field, name);
          }
        } else {
          throw new Error(`Model class '${tname}'s field name '${name}' is not in fields`);
        }
      } else if (_extends && _extends.fields[name]) {
        const pfield = _extends.fields[name];
        field = { ...pfield.get_options(), ...field };
        if (pfield.model && field.model) {
          field.model = this.create_model({
            abstract: true,
            extends: pfield.model,
            fields: field.model.fields,
            field_names: field.model.field_names,
          });
        }
      }
      model.fields[name] = this.make_field_from_json({ ...field, name });
    }
    for (const [key, value] of Object.entries(options)) {
      if (model[key] === undefined && MODEL_MERGE_NAMES[key]) {
        model[key] = value;
      }
    }
    if (!options.unique_together && _extends && _extends.unique_together) {
      model.unique_together = _extends.unique_together.filter((group) =>
        group.every((name) => name in model.fields),
      );
    }
    let unique_together = model.unique_together || [];
    if (typeof unique_together[0] === "string") {
      unique_together = [unique_together];
    }
    model.unique_together = unique_together;
    model.abstract = abstract;
    model.__normalized__ = true;
    if (options.mixins) {
      const merge_model = this.merge_models([...options.mixins, model]);
      return merge_model;
    } else {
      return model;
    }
  }
  static set_label_name_dict() {
    this.label_to_name = {};
    this.name_to_label = {};
    for (const [name, field] of Object.entries(this.fields)) {
      this.label_to_name[field.label] = name;
      this.name_to_label[name] = field.label;
    }
  }
  static ensure_admin_list_names() {
    this.admin.list_names = clone(this.admin.list_names || []);
    if (this.admin.list_names.length === 0) {
      this.admin.list_names = this.get_admin_list_names();
    }
  }
  static get_admin_list_names() {
    const names = [];
    for (const name of this.names) {
      const field = this.fields[name];
      if (!compound_types[field.type]) {
        names.push(name);
      }
    }
    return names;
  }
  static ensure_ctime_list_names(ctime_name) {
    const admin = assert(this.admin);
    if (!admin.list_names.includes(ctime_name)) {
      admin.list_names = [...admin.list_names, ctime_name];
    }
  }
  static resolve_foreignkey_self() {
    for (const name of this.field_names) {
      const field = this.fields[name];
      let fk_model = field.reference;
      if (fk_model === "self") {
        fk_model = this;
        field.reference = this;
        field.setup_with_fk_model(this);
      }
      if (fk_model) {
        this.foreignkey_fields[name] = field;
      }
    }
  }
  static resolve_foreignkey_related() {
    for (const name of this.field_names) {
      const field = this.fields[name];
      const fk_model = field.reference;
      if (fk_model) {
        if (field.related_name === undefined) {
          field.related_name = `${this.table_name}_set`;
        }
        if (field.related_query_name === undefined) {
          field.related_query_name = this.table_name;
        }
        const rqn = field.related_query_name;
        assert(!this.fields[rqn], `related_query_name ${rqn} conflicts with field name`);
        fk_model.reversed_fields[rqn] = field;
      }
    }
  }
  static set_class_name(table_name) {
    Object.defineProperty(this, "name", {
      value: `${capitalize(table_name)}Model`,
    });
  }
  static materialize_with_table_name(opts) {
    const table_name = opts.table_name;
    const label = opts.label;
    if (!table_name) {
      const names_hint = (this.field_names && this.field_names.join(",")) || "no field_names";
      throw new Error(`you must define table_name for a non-abstract model (${names_hint})`);
    }
    check_conflicts(table_name);
    this.set_class_name(table_name);
    this.table_name = table_name;
    this._table_name_token = smart_quote(table_name);
    this.class_name = to_camel_case(table_name);
    this.label = this.label || label || table_name;
    this.abstract = false;
    if (!this.primary_key && this.auto_primary_key) {
      const pk_name = DEFAULT_PRIMARY_KEY;
      this.primary_key = pk_name;
      this.fields[pk_name] = Fields.integer.create_field({
        name: pk_name,
        primary_key: true,
        serial: true,
      });
      this.field_names.unshift(pk_name);
    }
    for (const [name, field] of Object.entries(this.fields)) {
      field._column_token = smart_quote(name);
      if (field.reference) {
        field.table_name = table_name;
      }
    }
    this.RecordClass = make_record_meta(this);
    return this;
  }
  static mix(...varargs) {
    return this._make_model_class(this.merge_models([...varargs]));
  }
  static merge_models(models) {
    if (models.length < 2) {
      throw new Error("provide at least two models to merge");
    } else if (models.length === 2) {
      return this.merge_model(...models);
    } else {
      let merged = models[0];
      for (let i = 1; i <= models.length; i = i + 1) {
        merged = this.merge_model(merged, models[i]);
      }
      return merged;
    }
  }
  static merge_model(a, b) {
    const A = (a.__normalized__ && a) || this.normalize(a);
    const B = (b.__normalized__ && b) || this.normalize(b);
    const C = {};
    const field_names = unique([...A.field_names, ...B.field_names]);
    const fields = {};
    for (const name of field_names) {
      const af = A.fields[name];
      const bf = B.fields[name];
      if (af && bf) {
        fields[name] = Xodel.merge_field(af, bf);
      } else if (af) {
        fields[name] = af;
      } else if (bf) {
        fields[name] = bf;
      } else {
        throw new Error(`can't find field ${name} for model ${A.table_name} and ${B.table_name}`);
      }
    }
    for (const M of [A, B]) {
      for (const [key, value] of Object.entries(M)) {
        if (MODEL_MERGE_NAMES[key]) {
          C[key] = value;
        }
      }
    }
    C.field_names = field_names;
    C.fields = fields;
    return this.normalize(C);
  }
  static merge_field(a, b) {
    const aopts = (a instanceof Fields.basefield && a.get_options()) || clone(a);
    const bopts = (b instanceof Fields.basefield && b.get_options()) || clone(b);
    const options = { ...aopts, ...bopts };
    if (aopts.model && bopts.model) {
      options.model = this.merge_model(aopts.model, bopts.model);
    }
    return this.make_field_from_json(options);
  }
  static to_json(names) {
    const reversed_fields = {};
    for (const [name, field] of Object.entries(this.reversed_fields)) {
      if (field.reference) {
        reversed_fields[name] = {
          name: field.name,
          reference: field.reference.table_name,
          reference_column: field.reference_column,
        };
      }
    }
    if (!names) {
      return {
        table_name: this.table_name,
        class_name: this.class_name,
        primary_key: this.primary_key,
        label: this.label || this.table_name,
        names: clone(this.names),
        field_names: clone(this.field_names),
        label_to_name: clone(this.label_to_name),
        name_to_label: clone(this.name_to_label),
        admin: clone(this.admin),
        unique_together: clone(this.unique_together),
        detail_names: clone(this.detail_names),
        reversed_fields: reversed_fields,
        fields: Object.fromEntries(
          this.field_names.map((name) => [name, this.fields[name].json()]),
        ),
      };
    } else {
      if (!Array.isArray(names)) {
        names = [names];
      }
      const label_to_name = {};
      const name_to_label = {};
      const fields = {};
      for (const name of names) {
        const field = this.fields[name];
        label_to_name[field.label] = name;
        name_to_label[field.name] = field.label;
        fields[name] = field.json();
      }
      return {
        table_name: this.table_name,
        class_name: this.class_name,
        primary_key: this.primary_key,
        label: this.label || this.table_name,
        names: names,
        field_names: names,
        label_to_name: label_to_name,
        name_to_label: name_to_label,
        admin: clone(this.admin),
        unique_together: clone(this.unique_together),
        detail_names: clone(this.detail_names),
        reversed_fields: reversed_fields,
        fields: fields,
      };
    }
  }
  static check_unique_key(key) {
    const pkf = this.fields[key];
    if (!pkf) {
      throw new Error("invalid field name: " + key);
    }
    if (!(pkf.primary_key || pkf.unique)) {
      throw new Error(`field '${key}' is not primary_key or not unique`);
    }
    return key;
  }
  static async create(input) {
    return await this.save_create(input, this.names, "*");
  }
  static async save(input, names, key) {
    const uk = key || this.primary_key;
    names = names || this.names;
    // TODO: need check recursive here. lua code: rawget(input, key)
    if (input[uk] !== undefined) {
      return await this.save_update(input, names, uk);
    } else {
      return await this.save_create(input, names, key);
    }
  }
  static async save_create(input, names, key) {
    names = names || this.names;
    const data = this.validate_create(input, names);
    const prepared = this._prepare_for_db(data, names);
    const created = await this.create_sql()
      ._base_insert(prepared)
      ._base_returning(key || "*")
      .execr();
    Object.assign(data, created[0]);
    return this.create_record(data);
  }
  static async save_update(input, names, key) {
    names = names || this.names;
    const data = this.validate_update(input, names);
    if (!key) {
      key = this.primary_key;
    } else {
      key = this.check_unique_key(key);
    }
    const look_value = input[key];
    if (look_value === undefined) {
      throw new Error("no primary or unique key value for save_update");
    }
    const prepared = this._prepare_for_db(data, names);
    const updated = await this.create_sql()
      ._base_update(prepared)
      .where({ [key]: look_value })
      ._base_returning(key)
      .execr();
    if (updated.length === 1) {
      data[key] = updated[0][key];
      return this.create_record(data);
    } else if (updated.length === 0) {
      throw new Error(
        `update failed, record does not exist(model:${this.table_name}, key:${key}, value:${look_value})`,
      );
    } else {
      throw new Error(
        `expect 1 but ${updated.length} records are updated(model:${this.table_name}, key:${key}, value:${look_value})`,
      );
    }
  }
  static _prepare_for_db(data, columns) {
    const prepared = {};
    for (const name of columns || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
      }
      const value = data[name];
      if (field.prepare_for_db && (value !== undefined || field.auto_now)) {
        try {
          const val = field.prepare_for_db(value);
          prepared[name] = val;
        } catch (error) {
          return this.make_field_error({
            name,
            message: error.message,
          });
        }
      } else {
        prepared[name] = value;
      }
    }
    return prepared;
  }
  static validate(input, names, key) {
    if (input[key || this.primary_key] !== undefined) {
      return this.validate_update(input, names || this.names);
    } else {
      return this.validate_create(input, names || this.names);
    }
  }
  static validate_create(input, names) {
    const data = {};
    let value;
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw_field_error(name, this.table_name);
      }
      try {
        value = field.validate(input[name]);
      } catch (error) {
        return this.make_field_error({
          name,
          value: input[name],
          message: error.message,
          index: error.index,
        });
      }
      if (field.default && (value === undefined || value === "")) {
        if (typeof field.default !== "function") {
          value = field.default;
        } else {
          try {
            value = field.default(input);
          } catch (error) {
            return this.make_field_error({
              name,
              message: error.message,
              index: error.index,
            });
          }
        }
      }
      data[name] = value;
    }
    return data;
  }
  static validate_update(input, names) {
    const data = {};
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw_field_error(name, this.table_name);
      }
      let value = input[name];
      if (value !== undefined && value !== null) {
        try {
          value = field.validate(input[name]);
          if (value === undefined) {
            data[name] = "";
          } else {
            data[name] = value;
          }
        } catch (error) {
          return this.make_field_error({
            name,
            value: input[name],
            message: error.message,
            index: error.index,
          });
        }
      }
    }
    return data;
  }
  static _get_cascade_field(tf) {
    if (tf.cascade_column) {
      return tf.model.fields[tf.cascade_column];
    }
    const table_validate_columns = tf.names || tf.form_names || tf.model.names;
    for (const column of table_validate_columns) {
      const fk = tf.model.fields[column];
      if (fk === undefined) {
        throw new Error(`cascade field '${column}' not found for model '${this.table_name}'`);
      }
      if (fk.type === "foreignkey" && fk.reference.table_name === this.table_name) {
        return fk;
      }
    }
  }
  static _walk_cascade_fields(callback) {
    for (const name of this.names) {
      const field = this.fields[name];
      if (field.type === "table" && !field.model.abstract) {
        const fk = this._get_cascade_field(field);
        if (!fk) {
          throw new Error(`cascade field '${field.name}' not found for model '${this.table_name}'`);
        }
        callback(field, fk);
      }
    }
  }
  static validate_cascade_update(input, names) {
    const data = this.validate_update(input, names);
    this._walk_cascade_fields(function (tf, fk) {
      const rows = data[tf.name];
      for (const row of rows) {
        row[fk.name] = input[fk.reference_column];
      }
    });
    return data;
  }
  static async save_cascade_update(input, names, key) {
    names = names || this.names;
    const data = this.validate_cascade_update(input, names);
    if (!key) {
      key = this.primary_key;
    } else {
      key = this.check_unique_key(key);
    }
    const look_value = input[key];
    if (look_value === undefined) {
      throw new Error("no primary or unique key value for save_update");
    }
    const names_without_tablefield = names.filter((name) => this.fields[name].type !== "table");
    const prepared = this._prepare_for_db(data, names_without_tablefield);
    const updated_sql = this.create_sql()
      ._base_update(prepared)
      .where({ [key]: look_value })
      ._base_returning(key);
    this._walk_cascade_fields(function (tf, fk) {
      const rows = data[tf.name];
      if (rows.length > 0) {
        const align_sql = tf.model
          .where({ [fk.name]: input[fk.reference_column] })
          .skip_validate()
          .align(rows);
        updated_sql.prepend(align_sql);
      } else {
        const delete_sql = tf.model.delete().where({ [fk.name]: input[fk.reference_column] });
        updated_sql.prepend(delete_sql);
      }
    });
    return await updated_sql.execr();
  }
  static _check_upsert_key_error(rows, key) {
    assert(key, "no key for upsert");
    if (rows instanceof Array) {
      if (typeof key === "string") {
        for (const [i, row] of rows.entries()) {
          if (row[key] === undefined || row[key] === "") {
            const label = this.fields[key].label;
            return this.make_field_error({
              name: key,
              message: label + "不能为空",
              batch_index: i,
            });
          }
        }
      } else {
        for (const [i, row] of rows.entries()) {
          for (const k of key) {
            if (row[k] === undefined || row[k] === "") {
              const label = this.fields[k].label;
              return this.make_field_error({
                name: k,
                message: label + "不能为空",
                batch_index: i,
              });
            }
          }
        }
      }
    } else if (typeof key === "string") {
      const label = this.fields[key].label;
      if (rows[key] === undefined || rows[key] === "") {
        return this.make_field_error({
          name: key,
          message: label + "不能为空",
        });
      }
    } else {
      for (const k of key) {
        if (rows[k] === undefined || rows[k] === "") {
          const label = this.fields[k].label;
          return this.make_field_error({
            name: k,
            message: label + "不能为空",
          });
        }
      }
    }
  }
  static make_field_error({ name, message, index, batch_index, value }) {
    const field = assert(this.fields[name], "invalid feild name: " + name);
    const err = {
      type: "field_error",
      name: field.name,
      label: field.label,
      message,
      index,
      value,
    };
    if (batch_index !== undefined) {
      err.batch_index = batch_index;
      throw new ValidateBatchError(err);
    } else {
      throw new ValidateError(err);
    }
  }
  static load(data) {
    for (const name of this.names) {
      const field = this.fields[name];
      const value = data[name];
      if (value !== undefined) {
        if (!field.load) {
          data[name] = value;
        } else {
          data[name] = field.load(value);
        }
      }
    }
    return this.create_record(data);
  }
  static _validate_create_data(rows, columns) {
    if (rows instanceof Array) {
      const cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validate_create(row, columns);
        } catch (error) {
          if (error instanceof ValidateError) {
            return this.make_field_error({
              ...error,
              message: error.message,
              batch_index: index,
            });
          } else {
            throw error;
          }
        }
      }
      return cleaned;
    } else {
      const cleaned = this.validate_create(rows, columns);
      return cleaned;
    }
  }
  static _validate_update_data(rows, columns) {
    if (rows instanceof Array) {
      const cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validate_update(row, columns);
        } catch (error) {
          if (error instanceof ValidateError) {
            return this.make_field_error({
              ...error,
              message: error.message,
              batch_index: index,
            });
          } else {
            throw error;
          }
        }
      }
      return cleaned;
    } else {
      const cleaned = this.validate_update(rows, columns);
      return cleaned;
    }
  }
  static _validate_create_rows(rows, key, columns) {
    this._check_upsert_key_error(rows, key);
    return this._validate_create_data(rows, columns);
  }
  static _validate_update_rows(rows, key, columns) {
    this._check_upsert_key_error(rows, key);
    return this._validate_update_data(rows, columns);
  }
  static _prepare_db_rows(rows, columns) {
    if (rows instanceof Array) {
      const cleaned = [];
      for (const [i, row] of rows.entries()) {
        try {
          cleaned[i] = this.prepare_for_db(row, columns);
        } catch (error) {
          if (error instanceof ValidateError) {
            return this.make_field_error({
              ...error,
              message: error.message,
              batch_index: i,
            });
          } else {
            throw error;
          }
        }
      }
      return cleaned;
    } else {
      return this._prepare_for_db(rows, columns);
    }
  }
  static is_instance(row) {
    return row instanceof Xodel;
  }
  static async filter(kwargs) {
    return await this.create_sql().where(kwargs).exec();
  }
  static create_record(data) {
    return new this.RecordClass(data);
  }
  static async get_or_create(params, defaults, columns) {
    const [values_list, insert_columns] = Sql.prototype._get_insert_values_token({
      ...params,
      ...defaults,
    });
    const insert_columns_token = as_token(insert_columns);
    const all_columns_token = as_token(
      unique([...(columns || [this.primary_key]), ...insert_columns]),
    );
    const insert_sql = `(INSERT INTO ${
      this._table_name_token
    }(${insert_columns_token}) SELECT ${as_literal_without_brackets(
      values_list,
    )} WHERE NOT EXISTS (${this.create_sql()
      .select(1)
      .where(params)}) RETURNING ${all_columns_token})`;
    const inserted_set = Sql.new({
      model: this,
      table_name: "NEW_RECORDS",
      _as: "NEW_RECORDS",
    })
      .with(`NEW_RECORDS(${all_columns_token})`, insert_sql)
      ._base_select(all_columns_token)
      ._base_select("TRUE AS __is_inserted__");
    const selected_set = this.create_sql()
      .where(params)
      ._base_select(all_columns_token)
      ._base_select("FALSE AS __is_inserted__");
    const records = await inserted_set.union_all(selected_set).exec();
    if (records.length > 1) {
      throw new Error("multiple records returned");
    }
    const ins = records[0];
    const created = ins.__is_inserted__;
    delete ins.__is_inserted__;
    return [ins, created];
  }
  static async meta_query(data) {
    let sql = this.create_sql();
    for (const arg_name of select_args) {
      if (data[arg_name] !== undefined) {
        sql = sql[arg_name](...ensure_array(data[arg_name]));
      }
    }
    if (data.get || data.try_get || data.flat || data.exists) {
      return sql;
    } else {
      return await sql.exec();
    }
  }
}

const whitelist = {
  DEFAULT: true,
  as_token: true,
  as_literal: true,
  __call: true,
  new: true,
  token: true,
};
for (const [k, v] of Object.entries(Sql)) {
  if (typeof v === "function" && !whitelist[k]) {
    assert(Xodel[k] === undefined, `Xodel.${k} can't be defined as Sql.${k} already exists`);
  }
}
export const Model = Xodel;
export default Xodel;
