import * as Field from "./field";
import * as utils from "./utils";
import { Http } from "@/globals/Http";

const DEFAULT_STRING_MAXLENGTH = 256;
const FOREIGN_KEY = 2;
const NON_FOREIGN_KEY = 3;
const END = 4;
const COMPARE_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  ne: "<>",
  eq: "=",
};
const IS_PG_KEYWORDS = {};
const NON_MERGE_NAMES = {
  sql: true,
  fields: true,
  field_names: true,
  extend: true,
  mixins: true,
  admin: true,
};
const is_empty_object = (obj) => {
  for (var i in obj) {
    return false;
  }
  return true;
};
const get_localtime = Field.Base_field.get_localtime;
const string_format = (s, ...varargs) => {
  let status = 0;
  const res = [];
  let j = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%") {
      if (status === 0) {
        status = 1;
      } else if (status === 1) {
        status = 0;
        res.push("%");
      }
    } else if (c === "s" && status === 1) {
      j = j + 1;
      res.push(varargs[j]);
      status = 0;
    } else {
      res.push(c);
    }
  }
  return res.join("");
};
const capitalize = (s) => s.char_at(0).to_upper_case() + s.slice(1);
const base_model = {
  abstract: true,
  field_names: ["id", "ctime", "utime"],
  fields: {
    id: { type: "integer", primary_key: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", auto_now_add: true },
    utime: { label: "更新时间", type: "datetime", auto_now: true },
  },
};
const unique = (arr) => {
  return arr.filter((e, i) => arr.index_of(e) === i);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
function _prefix_with_V(column) {
  return "V." + column;
}
function map(tbl, func) {
  const res = [];
  for (let i = 0; i < tbl.length; i = i + 1) {
    res[i] = func(tbl[i]);
  }
  return res;
}
function check_reserved(name) {
  assert(typeof name === "string", `name must by string, not ${typeof name} (${name})`);
  assert(!name.includes("__"), "don't use __ in a field name");
  assert(!IS_PG_KEYWORDS[name.to_upper_case()], `${name} is a postgresql reserved word`);
}
function normalize_array_and_hash_fields(fields) {
  assert(typeof fields === "object", "you must provide fields for a model");
  const aligned_fields = [];
  const field_names = [];
  if (Array.is_array(fields)) {
    for (const field of fields) {
      aligned_fields[field.name] = field;
      field_names.push(field.name);
    }
  } else {
    for (const [name, field] of Object.entries(fields)) {
      if (typeof name === "number") {
        assert(field.name, "you must define name for a field when using array fields");
        aligned_fields[field.name] = field;
        field_names.push(field.name);
      } else {
        aligned_fields[name] = field;
        field_names.push(name);
      }
    }
  }

  return [aligned_fields, field_names];
}
function normalize_field_names(field_names) {
  assert(typeof field_names === "object", "you must provide field_names for a model");
  for (const name of field_names) {
    assert(typeof name === "string", "element of field_names must be string");
  }
  return field_names;
}
function get_foreign_object(attrs, prefix) {
  const fk = {};
  const n = prefix.length;
  for (const [k, v] of Object.entries(attrs)) {
    if (k.slice(0, n) === prefix) {
      fk[k.slice(n)] = v;
      delete attrs[k];
    }
  }
  return fk;
}
function make_record_class(model) {
  class Record {
    constructor(attrs) {
      Object.assign(this, attrs);
    }
    async delete(key) {
      key = model.check_unique_key(key || model.primary_key);
      if (this[key] === undefined) {
        throw new Error("empty value for delete key:" + key);
      }
      return await model
        .new_sql()
        .delete({ [key]: this[key] })
        .returning(key)
        .exec();
    }
    async save(names, key) {
      return await model.save(this, names, key);
    }
    async save_create(names, key) {
      return await model.save_create(this, names, key);
    }
    async save_update(names, key) {
      return await model.save_update(this, names, key);
    }
    validate(names, key) {
      return model.validate(this, names, key);
    }
    validate_update(names) {
      return model.validate_update(this, names);
    }
    validate_create(names) {
      return model.validate_create(this, names);
    }
  }
  return Record;
}
function assert(bool, err_msg) {
  if (!bool) {
    throw new Error(err_msg);
  } else {
    return bool;
  }
}
class Validate_error extends Error {
  constructor({ name, message, label }) {
    super(message);
    Object.assign(this, { name, label, message });
  }
  String() {
    return `MODEL FIELD ERROR: ${this.name}(${this.label})+${this.message}`;
  }
}
class Validate_batch_error extends Validate_error {
  constructor({ name, message, label, index }) {
    super({ name, message, label });
    this.index = index;
  }
}
function make_field_from_json(json, kwargs) {
  const options = { ...json, ...kwargs };
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
  const fcls = Field[`${capitalize(utils.snake_to_camel(options.type))}Field`];
  if (!fcls) {
    throw new Error("invalid field type:" + String(options.type));
  }
  return fcls.new(options);
}
function make_token(s) {
  function raw_token() {
    return s;
  }
  return raw_token;
}
const DEFAULT = make_token("DEFAULT");
const NULL = make_token("NULL");
const PG_SET_MAP = {
  _union: "UNION",
  _union_all: "UNION ALL",
  _except: "EXCEPT",
  _except_all: "EXCEPT ALL",
  _intersect: "INTERSECT",
  _intersect_all: "INTERSECT ALL",
};
function _escape_factory(is_literal, is_bracket) {
  function as_sql_token(value) {
    if ("string" === typeof value) {
      if (is_literal) {
        return "'" + value.replace_all("'", "''") + "'";
      } else {
        return value;
      }
    } else if ("number" === typeof value || "bigint" === typeof value) {
      return String(value);
    } else if ("boolean" === typeof value) {
      return value === true ? "TRUE" : "FALSE";
    } else if ("function" === typeof value) {
      return value();
    } else if (NULL === value) {
      return "NULL";
    } else if (value instanceof Model) {
      return "(" + value.statement() + ")";
    } else if (Array.is_array(value)) {
      if (value.length === 0) {
        throw new Error("empty array as Sql value is not allowed");
      }
      const token = value.map(as_sql_token).join(", ");
      if (is_bracket) {
        return "(" + token + ")";
      } else {
        return token;
      }
    } else {
      throw new Error(`don't know how to escape value: ${value} (${typeof value})`);
    }
  }
  return as_sql_token;
}
const as_literal = _escape_factory(true, true);
const as_token = _escape_factory(false, false);
function get_cte_returning_values(columns, literals) {
  const values = [];
  for (const col of columns) {
    values.push(as_token(col));
  }
  if (literals) {
    for (const e of literals) {
      values.push(as_literal(e));
    }
  }
  return values;
}
function get_returning_token(opts) {
  if (opts.cte_returning) {
    return " RETURNING " + as_token(get_cte_returning_values(opts.cte_returning.columns, opts.cte_returning.literals));
  } else if (opts.returning) {
    return " RETURNING " + opts.returning;
  } else {
    return "";
  }
}
function assemble_sql(opts) {
  let statement;
  if (opts.update) {
    const from = (opts.from && " FROM " + opts.from) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = get_returning_token(opts);
    statement = `UPDATE ${opts.table_name} SET ${opts.update}${from}${where}${returning}`;
  } else if (opts.insert) {
    const returning = get_returning_token(opts);
    statement = `INSERT INTO ${opts.table_name} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    const using = (opts.using && " USING " + opts.using) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = get_returning_token(opts);
    statement = `DELETE FROM ${opts.table_name}${using}${where}${returning}`;
  } else {
    const from = opts.from || opts.table_name;
    const where = (opts.where && " WHERE " + opts.where) || "";
    const group = (opts.group && " GROUP BY " + opts.group) || "";
    const having = (opts.having && " HAVING " + opts.having) || "";
    const order = (opts.order && " ORDER BY " + opts.order) || "";
    const limit = (opts.limit && " LIMIT " + opts.limit) || "";
    const offset = (opts.offset && " OFFSET " + opts.offset) || "";
    const distinct = (opts.distinct && "DISTINCT ") || "";
    const select = opts.select || "*";
    statement = `SELECT ${distinct}${select} FROM ${from}${where}${group}${having}${order}${limit}${offset}`;
  }
  return (opts.with && `WITH ${opts.with} ${statement}`) || statement;
}

class Model_proxy {
  static create_proxy(modelclass) {
    return new Proxy(modelclass, {
      get(obj, prop) {
        if (prop in obj) {
          return obj[prop];
        } else if (prop in obj.prototype) {
          return obj.new_sql()[prop];
        } else {
          return;
        }
      },
      set(obj, prop, value) {
        obj[prop] = value;
        return true;
      },
    });
  }
}

class Model {
  static Validate_error = Validate_error;
  static Validate_batch_error = Validate_batch_error;
  static base_model = base_model;
  static make_field_from_json = make_field_from_json;
  static token = make_token;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static as_token = as_token;
  static as_literal = as_literal;
  static http_model_cache = {};
  constructor(attrs) {
    Object.assign(this, attrs);
  }
  to_string() {
    return this.statement();
  }
  static new(self) {
    return new this(self);
  }
  static async create_model_async(options) {
    // 目前主要是异步获取reference_url和choices_url资源
    for (const name of options.field_names || Object.keys(options.fields)) {
      const field = options.fields[name];
      if (field.choices_url) {
        const fetch_choices = async () => {
          const choices_url = options.is_admin_mode
            ? field.choices_url_admin || field.choices_url // 如果不是fk,那么choices_url_admin不会定义
            : field.choices_url;
          const { data: choices } = await Http[field.choices_url_method || "post"](choices_url);
          const res = options.choices_callback ? options.choices_callback(choices, field) : choices;
          return res;
        };
        if (field.preload) {
          field.choices = await fetch_choices();
        } else {
          field.choices = fetch_choices;
        }
      }
      if (typeof field.reference == "string") {
        if (field.reference == field.table_name) {
          field.reference = "self";
        } else {
          const model_url = options.is_admin_mode ? field.reference_url_admin : field.reference_url || field.reference;
          field.reference = await this.get_http_model(model_url, options.is_admin_mode);
        }
      }
      if (field.type == "table" && !field.model?.__is_model_class__) {
        const model_key = field.model.table_name;
        if (!this.http_model_cache[model_key]) {
          this.http_model_cache[model_key] = await Model.create_model_async({
            ...field.model,
            is_admin_mode: options.is_admin_mode,
          });
        }
        field.model = this.http_model_cache[model_key];
      }
    }
    return Model.create_model(options);
  }
  static async get_http_model(model_key, is_admin_mode) {
    if (!this.http_model_cache[model_key]) {
      const model_url = model_key.match(/^https?:/) || model_key.match(/^\//) ? model_key : `/admin/model/${model_key}`;
      const { data } = await Http.get(model_url);
      // is_admin_mode具有传染性
      this.http_model_cache[model_key] = await Model.create_model_async({
        ...data,
        is_admin_mode,
      });
    } else {
      console.log("cached:" + model_key);
    }
    return this.http_model_cache[model_key];
  }
  static create_model(options) {
    const Xodel_class = this.make_model_class(this.normalize(options));
    return Model_proxy.create_proxy(Xodel_class);
  }
  static set_label_name_dict() {
    this.label_to_name = {};
    this.name_to_label = {};
    for (const [name, field] of Object.entries(this.fields)) {
      this.label_to_name[field.label] = name;
      this.name_to_label[name] = field.label;
    }
  }
  static set_class_name(table_name) {
    const class_name = {
      value: `${capitalize(table_name)}Model`,
    };
    Object.define_property(this, "name", class_name);
  }
  static make_model_class(opts) {
    class ModelClass extends this {
      static sql_query = opts.sql_query ? opts.sql_query : this.sql_query;
      static table_name = opts.table_name;
      static admin = opts.admin || {};
      static label = opts.label || opts.table_name;
      static fields = opts.fields;
      static field_names = opts.field_names;
      static primary_key = opts.primary_key;
      static default_primary_key = opts.default_primary_key;
      static mixins = opts.mixins;
      static extend = opts.extend;
      static abstract = opts.abstract;
      static name_to_label = opts.name_to_label;
      static label_to_name = opts.label_to_name;
      static disable_auto_primary_key = opts.disable_auto_primary_key == undefined ? true : false;
      cls = ModelClass;
    }
    let pk_defined = false;
    ModelClass.foreign_keys = {};
    ModelClass.names = [];
    for (const [name, field] of Object.entries(ModelClass.fields)) {
      let fk_model = field.reference;
      if (fk_model === "self") {
        fk_model = ModelClass;
        field.reference = ModelClass;
      }
      if (fk_model) {
        ModelClass.foreign_keys[name] = field;
      }
      if (field.primary_key) {
        const pk_name = field.name;
        assert(!pk_defined, `duplicated primary key: "${pk_name}" and "${pk_defined}"`);
        pk_defined = pk_name;
        ModelClass.primary_key = pk_name;
      } else if (field.auto_now) {
        ModelClass.auto_now_name = field.name;
      } else if (field.auto_now_add) {
        ModelClass.auto_now_add_name = field.name;
      } else {
        ModelClass.names.push(name);
      }
    }
    for (const [_, field] of Object.entries(ModelClass.fields)) {
      if (field.db_type === Field.Base_field.FK_TYPE_NOT_DEFIEND) {
        field.db_type = ModelClass.fields[field.reference_column].db_type;
      }
    }
    ModelClass.__is_model_class__ = true;
    if (ModelClass.table_name) {
      ModelClass.materialize_with_table_name({
        table_name: ModelClass.table_name,
      });
    } else {
      ModelClass.set_class_name("Abstract");
    }
    ModelClass.set_label_name_dict();
    return ModelClass;
  }

  static materialize_with_table_name({ table_name, label }) {
    if (!table_name) {
      const names_hint = (this.field_names && this.field_names.join(",")) || "no field_names";
      throw new Error(`you must define table_name for a non-abstract model (${names_hint})`);
    }
    check_reserved(table_name);
    this.set_class_name(table_name);
    this.table_name = table_name;
    this.label = this.label || label || table_name;
    this.abstract = false;
    if (!this.primary_key && !this.disable_auto_primary_key) {
      const pk_name = this.default_primary_key || "id";
      this.primary_key = pk_name;
      this.fields[pk_name] = Field.Integer_field.new({
        name: pk_name,
        primary_key: true,
        serial: true,
      });
      this.field_names.unshift(pk_name);
    }
    this.name_cache = {};
    for (const [name, field] of Object.entries(this.fields)) {
      this.name_cache[name] = this.table_name + ("." + name);
      if (field.reference) {
        field.table_name = table_name;
      }
    }
    this.Record_class = make_record_class(this);
    return this;
  }
  static get_defaults() {
    return Object.from_entries(this.names.map((k) => [k, this.fields[k].default]));
  }
  static to_form_value(values, names) {
    const res = {};
    for (const name of names || this.field_names) {
      const field = this.fields[name];
      const value = field.to_form_value(values[name]);
      res[name] = value;
    }
    return res;
  }
  static to_post_value(values, names) {
    const data = {};
    for (const name of names || this.field_names) {
      const field = this.fields[name];
      data[name] = field.to_post_value(values[name]);
    }
    return data;
  }
  static normalize(options) {
    const extend = options.extend;
    const model = {
      admin: options.admin || {},
      table_name: options.table_name || extend?.table_name,
      sql_query: options.sql_query,
    };
    const [opts_fields, opts_field_names] = normalize_array_and_hash_fields(options.fields || []);
    let opts_names = options.field_names;
    if (!opts_names) {
      if (extend) {
        opts_names = unique([...extend.field_names, ...opts_field_names]);
      } else {
        opts_names = opts_field_names;
      }
    }
    model.field_names = normalize_field_names(clone(opts_names));
    model.fields = {};
    for (const name of opts_names) {
      check_reserved(name);
      if (name !== "name" && name !== "apply" && name !== "call" && this[name] !== undefined) {
        throw new Error(`field name "${name}" conflicts with model class attributes`);
      }
      let field = opts_fields[name];
      if (!field) {
        const tname = options.table_name || "[abstract model]";
        if (extend) {
          field = extend.fields[name];
          if (!field) {
            throw new Error(`'${tname}' field name '${name}' is not in fields and parent fields`);
          }
        } else {
          throw new Error(`'${tname}' field name '${name}' is not in fields`);
        }
      } else if (!(field instanceof Field.Base_field)) {
        if (extend) {
          const pfield = extend.fields[name];
          if (pfield) {
            field = { ...pfield.get_options(), ...field };
            if (pfield.model && field.model) {
              field.model = this.create_model({
                abstract: true,
                extend: pfield.model,
                fields: field.model.fields,
                field_names: field.model.field_names,
              });
            }
          }
        }
      }
      if (!(field instanceof Field.Base_field)) {
        model.fields[name] = make_field_from_json(field, { name });
      } else {
        model.fields[name] = make_field_from_json(field.get_options(), {
          name,
          type: field.type,
        });
      }
    }
    for (const [key, value] of Object.entries(options)) {
      if (model[key] === undefined && !NON_MERGE_NAMES[key]) {
        model[key] = value;
      }
    }
    let abstract;
    if (options.abstract !== undefined) {
      abstract = !!options.abstract;
    } else {
      abstract = options.table_name === undefined;
    }
    model.abstract = abstract;
    model.__normalized__ = true;
    if (options.mixins) {
      return this.merge_models([...options.mixins, model]);
    } else {
      return model;
    }
  }
  static mix_with_base(...varargs) {
    return this.mix(base_model, ...varargs);
  }
  static mix(...varargs) {
    return Model_proxy.create_proxy(this.make_model_class(this.merge_models([...varargs])));
  }
  static merge_models(models) {
    if (models.length < 2) {
      throw new Error("provide at least two models to merge");
    } else if (models.length === 2) {
      return this.merge_model(...models);
    } else {
      let merged = models[0];
      for (let i = 2; i <= models.length; i = i + 1) {
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
        fields[name] = Model.merge_field(af, bf);
      } else if (af) {
        fields[name] = af;
      } else {
        fields[name] = assert(bf, `can't find field ${name} for model ${B.table_name}`);
      }
    }
    for (const M of [A, B]) {
      for (const [key, value] of Object.entries(M)) {
        if (!NON_MERGE_NAMES[key]) {
          C[key] = value;
        }
      }
    }
    C.field_names = field_names;
    C.fields = fields;
    return this.normalize(C);
  }
  static merge_field(a, b) {
    const aopts = a instanceof Field ? a.get_options() : clone(a);
    const bopts = b instanceof Field ? b.get_options() : clone(b);
    const options = { ...aopts, ...bopts };
    if (aopts.model && bopts.model) {
      options.model = this.merge_model(aopts.model, bopts.model);
    }
    return make_field_from_json(options);
  }
  static async filter(kwargs) {
    return await this.new_sql().where(kwargs).exec();
  }
  static async all() {
    const records = await this.sql_query("SELECT * FROM " + this.table_name);
    for (let i = 0; i < records.length; i = i + 1) {
      records[i] = this.load(records[i]);
    }
    return records;
  }
  static async save(input, names, key) {
    key = key || this.primary_key;
    if (input[key] !== undefined) {
      return await this.save_update(input, names, key);
    } else {
      return await this.save_create(input, names, key);
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
  static async save_create(input, names, key) {
    const data = this.validate_create(input, names);
    key = key || this.primary_key;
    const prepared = this.prepare_for_db(data);
    const created = await this.new_sql()._base_insert(prepared)._base_returning(key).execr();
    data[key] = created[0][key];
    return this.new_record(data);
  }
  static async save_update(input, names, key) {
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
    const prepared = this.prepare_for_db(data, names, true);
    const updated = await this.new_sql()
      ._base_update(prepared)
      .where({ [key]: look_value })
      ._base_returning(key)
      .execr();
    if (updated.length === 1) {
      data[key] = updated[0][key];
      return this.new_record(data);
    } else if (updated.length === 0) {
      throw new Error(
        `update failed, record does not exist(model:${this.table_name}, key:${key}, value:${look_value})`
      );
    } else {
      throw new Error(
        `expect 1 but ${updated.affected_rows} records are updated(model:${this.table_name}, key:${key}, value:${look_value})`
      );
    }
  }
  static new_record(data) {
    return new this.Record_class(data);
  }
  static new_sql() {
    return new this({ table_name: this.table_name });
  }
  static make_field_error({ name, message, index }) {
    const label = this.fields[name].label;
    if (index !== undefined) {
      throw new Validate_batch_error({ name, message, label, index });
    } else {
      throw new Validate_error({ name, message, label });
    }
  }
  static check_upsert_key(rows, key) {
    assert(key, "no key for upsert");
    if (rows instanceof Array) {
      if (typeof key === "string") {
        for (const [i, row] of rows.entries()) {
          if (row[key] === undefined || row[key] === "") {
            return this.make_field_error({
              message: "不能为空",
              index: i,
              name: key,
            });
          }
        }
      } else {
        for (const [i, row] of rows.entries()) {
          for (const k of key) {
            if (row[k] === undefined || row[k] === "") {
              return this.make_field_error({
                message: "不能为空",
                index: i,
                name: k,
              });
            }
          }
        }
      }
    } else if (typeof key === "string") {
      if (rows[key] === undefined || rows[key] === "") {
        return this.make_field_error({
          message: "不能为空",
          name: key,
        });
      }
    } else {
      for (const k of key) {
        if (rows[k] === undefined || rows[k] === "") {
          return this.make_field_error({
            message: "不能为空",
            name: k,
          });
        }
      }
    }
    return [rows, key];
  }
  static validate(input, names, key) {
    if (input[key || this.primary_key] !== undefined) {
      return this.validate_update(input, names);
    } else {
      return this.validate_create(input, names);
    }
  }
  static validate_create(input, names) {
    const data = {};
    let value;
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
      }
      try {
        value = field.validate(input[name], input);
      } catch (error) {
        return this.make_field_error({
          name,
          message: error.message,
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
            });
          }
        }
      }
      data[name] = value;
    }
    if (!this.clean) {
      return data;
    } else {
      return this.clean(data);
    }
  }
  static validate_update(input, names) {
    const data = {};
    let value;
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
      }
      value = input[name];
      if (value !== undefined) {
        try {
          value = field.validate(input[name], input);
          if (value === undefined) {
            data[name] = "";
          } else {
            data[name] = value;
          }
        } catch (error) {
          return this.make_field_error({
            name,
            message: error.message,
          });
        }
      }
    }
    if (!this.clean) {
      return data;
    } else {
      return this.clean(data);
    }
  }
  static parse_error_message(err) {
    if (typeof err === "object") {
      return err;
    }
    const captured = /^(?<name>.+?)~(?<message>.+?)$/.exec(err);
    if (!captured) {
      throw new Error("can't parse this model error message: " + err);
    } else {
      const { name, message } = captured.groups;
      const label = this.name_to_label[name];
      return { name, message, label };
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
    return this.new_record(data);
  }
  static validate_create_data(rows, columns) {
    let cleaned;
    columns = columns || this.get_keys(rows);
    if (rows instanceof Array) {
      cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validate_create(row, columns);
        } catch (error) {
          if (error instanceof Validate_error) {
            return this.make_field_error({
              batch_index: index,
              name: error.name,
              message: error.message,
            });
          } else {
            throw error;
          }
        }
      }
    } else {
      cleaned = this.validate_create(rows, columns);
    }
    return [cleaned, columns];
  }
  static validate_update_data(rows, columns) {
    let cleaned;
    columns = columns || this.get_keys(rows);
    if (rows instanceof Array) {
      cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validate_update(row, columns);
        } catch (error) {
          if (error instanceof Validate_error) {
            return this.make_field_error({
              index,
              name: error.name,
              message: error.message,
            });
          } else {
            throw error;
          }
        }
      }
    } else {
      cleaned = this.validate_update(rows, columns);
    }
    return [cleaned, columns];
  }
  static validate_create_rows(rows, key, columns) {
    const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
    const [cleaned_rows, cleaned_columns] = this.validate_create_data(checked_rows, columns);
    return [cleaned_rows, checked_key, cleaned_columns];
  }
  static validate_update_rows(rows, key, columns) {
    const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
    const [cleaned_rows, cleaned_columns] = this.validate_update_data(checked_rows, columns);
    return [cleaned_rows, checked_key, cleaned_columns];
  }
  static prepare_db_rows(rows, columns, is_update) {
    let cleaned;
    columns = columns || Sql.get_keys(rows);
    if (rows instanceof Array) {
      cleaned = {};
      for (const [i, row] of rows.entries()) {
        try {
          cleaned[i] = this.prepare_for_db(row, columns, is_update);
        } catch (error) {
          if (error instanceof ValidateError) {
            return this.make_field_error({
              batch_index: i,
              name: error.name,
              message: error.message,
            });
          } else {
            throw error;
          }
        }
      }
    } else {
      cleaned = this.prepare_for_db(rows, columns, is_update);
    }
    if (is_update) {
      const utime = this.auto_now_name;
      if (utime && !columns.includes(utime)) {
        columns.push(utime);
      }
      return [cleaned, columns];
    } else {
      return [cleaned, columns];
    }
  }
  static prepare_for_db(data, columns, is_update) {
    const prepared = {};
    for (const name of columns || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
      }
      const value = data[name];
      if (field.prepare_for_db && value !== undefined) {
        try {
          const val = field.prepare_for_db(value, data);
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
    if (is_update && this.auto_now_name) {
      prepared[this.auto_now_name] = get_localtime();
    }
    return prepared;
  }
  static get_keys(rows) {
    const columns = [];
    if (rows instanceof Array) {
      const d = [];
      for (const row of rows) {
        for (const k of Object.keys(row)) {
          if (!d[k]) {
            d[k] = true;
            columns.push(k);
          }
        }
      }
    } else {
      for (const k of Object.keys(rows)) {
        columns.push(k);
      }
    }
    return columns;
  }
  _base_select(a, b, ...varargs) {
    const s = this._base_get_select_token(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  _base_get_select_token(a, b, ...varargs) {
    if (b === undefined) {
      if (typeof a === "object") {
        return this._base_get_select_token(...a);
      } else {
        return as_token(a);
      }
    } else {
      let s = as_token(a) + ", " + as_token(b);
      for (let i = 0; i < varargs.length; i = i + 1) {
        s = s + ", " + as_token(varargs[i]);
      }
      return s;
    }
  }
  _base_insert(rows, columns) {
    if (typeof rows === "object") {
      if (rows instanceof Model) {
        if (rows._select) {
          this._set_select_subquery_insert_token(rows, columns);
        } else {
          this._set_cud_subquery_insert_token(rows);
        }
      } else if (rows instanceof Array) {
        this._insert = this._get_bulk_insert_token(rows, columns);
      } else if (Object.keys(rows).length) {
        this._insert = this._get_insert_token(rows, columns);
      } else {
        throw new Error("can't pass empty table to Xodel._base_insert");
      }
    } else if (typeof rows === "string") {
      this._insert = rows;
    } else {
      throw new Error("invalid value type to Model._base_insert:" + typeof rows);
    }
    return this;
  }
  _base_update(row, columns) {
    if (row instanceof Model) {
      this._update = this._base_get_update_query_token(row, columns);
    } else if (typeof row === "object") {
      this._update = this._get_update_token(row, columns);
    } else {
      this._update = row;
    }
    return this;
  }
  _base_merge(rows, key, columns) {
    [rows, columns] = this._get_cte_values_literal(rows, columns, false);
    const cte_name = `V(${columns.join(", ")})`;
    const cte_values = `(VALUES ${as_token(rows)})`;
    const join_cond = this._get_join_conditions(key, "V", "T");
    const vals_columns = columns.map(_prefix_with_V);
    const insert_subquery = Model.new({ table_name: "V" })
      ._base_select(vals_columns)
      ._base_left_join("U AS T", join_cond)
      ._base_where_null("T." + (Array.is_array(key) ? key[0] : key));
    let updated_subquery;
    if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
      updated_subquery = Model.new({ table_name: "V" })
        ._base_select(vals_columns)
        ._base_join(this.table_name + " AS T", join_cond);
    } else {
      updated_subquery = Model.new({ table_name: this.table_name, _as: "T" })
        ._base_update(this._get_update_token_with_prefix(columns, key, "V"))
        ._base_from("V")
        ._base_where(join_cond)
        ._base_returning(vals_columns);
    }
    this.with(cte_name, cte_values).with("U", updated_subquery);
    return this._base_insert(insert_subquery, columns);
  }
  _base_upsert(rows, key, columns) {
    assert(key, "you must provide key for upsert(string or table)");
    if (rows instanceof Model) {
      assert(columns !== undefined, "you must specify columns when use subquery as values of upsert");
      this._insert = this._get_upsert_query_token(rows, key, columns);
    } else if (Array.is_array(rows)) {
      this._insert = this._get_bulk_upsert_token(rows, key, columns);
    } else {
      this._insert = this._get_upsert_token(rows, key, columns);
    }
    return this;
  }
  _base_updates(rows, key, columns) {
    if (rows instanceof Model) {
      columns = columns || rows._returning_args.flat();
      const cte_name = `V(${columns.join(", ")})`;
      const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
      this.with(cte_name, rows);
      return this._base_update(this._get_update_token_with_prefix(columns, key, "V")).from("V").where(join_cond);
    } else if (rows.length === 0) {
      throw new Error("empty rows passed to updates");
    } else {
      [rows, columns] = this._get_cte_values_literal(rows, columns, false);
      const cte_name = `V(${columns.join(", ")})`;
      const cte_values = `(VALUES ${as_token(rows)})`;
      const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
      this.with(cte_name, cte_values);
      return this._base_update(this._get_update_token_with_prefix(columns, key, "V")).from("V").where(join_cond);
    }
  }
  _base_get_multiple(keys, columns) {
    if (keys.length === 0) {
      throw new Error("empty keys passed to get_multiple");
    }
    columns = columns || this.cls.get_keys(keys[0]);
    [keys, columns] = this._get_cte_values_literal(keys, columns, false);
    const join_cond = this._get_join_conditions(columns, "V", this._as || this.table_name);
    const cte_name = `V(${columns.join(", ")})`;
    const cte_values = `(VALUES ${as_token(keys)})`;
    return this.with(cte_name, cte_values).right_join("V", join_cond);
  }
  _base_returning(a, b, ...varargs) {
    const s = this._base_get_select_token(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    } else {
      return this;
    }
    if (this._returning_args) {
      this._returning_args = [this._returning_args, ...varargs];
    } else {
      this._returning_args = [...varargs];
    }
    return this;
  }
  _base_from(a, ...varargs) {
    if (!this._from) {
      this._from = this._base_get_select_token(a, ...varargs);
    } else {
      this._from = this._from + ", " + this._base_get_select_token(a, ...varargs);
    }
    return this;
  }
  _base_join(right_table, key, op, val) {
    const join_token = this._get_join_token("INNER", right_table, key, op, val);
    this._from = `${this._from || this.get_table()} ${join_token}`;
    return this;
  }
  _base_left_join(right_table, key, op, val) {
    const join_token = this._get_join_token("LEFT", right_table, key, op, val);
    this._from = `${this._from || this.get_table()} ${join_token}`;
    return this;
  }
  _base_right_join(right_table, key, op, val) {
    const join_token = this._get_join_token("RIGHT", right_table, key, op, val);
    this._from = `${this._from || this.get_table()} ${join_token}`;
    return this;
  }
  _base_full_join(right_table, key, op, val) {
    const join_token = this._get_join_token("FULL", right_table, key, op, val);
    this._from = `${this._from || this.get_table()} ${join_token}`;
    return this;
  }
  _base_where(cond, op, dval) {
    const where_token = this._base_get_condition_token(cond, op, dval);
    return this._handle_where_token(where_token, "(%s) AND (%s)");
  }
  _base_get_condition_token_from_table(kwargs, logic) {
    const tokens = [];
    if (Array.is_array(kwargs)) {
      for (const value of kwargs) {
        const token = this._base_get_condition_token(value);
        if (token !== undefined && token !== "") {
          tokens.push("(" + token + ")");
        }
      }
    } else {
      for (const [k, value] of Object.entries(kwargs)) {
        tokens.push(`${k} = ${as_literal(value)}`);
      }
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + logic + " ");
    }
  }
  _base_get_condition_token(cond, op, dval) {
    if (op === undefined) {
      const argtype = typeof cond;
      if (argtype === "object") {
        return this._base_get_condition_token_from_table(cond);
      } else if (argtype === "string") {
        return cond;
      } else if (argtype === "function") {
        const old_where = this._where;
        delete this._where;
        const res = cond.call(this);
        if (res === this) {
          const group_where = this._where;
          if (group_where === undefined) {
            throw new Error("no where token generate after calling condition function");
          } else {
            this._where = old_where;
            return group_where;
          }
        } else {
          this._where = old_where;
          return res;
        }
      } else {
        throw new Error("invalid condition type: " + argtype);
      }
    } else if (dval === undefined) {
      return `${cond} = ${as_literal(op)}`;
    } else {
      return `${cond} ${op} ${as_literal(dval)}`;
    }
  }
  _base_where_in(cols, range) {
    const in_token = this._get_in_token(cols, range);
    if (this._where) {
      this._where = `(${this._where}) AND ${in_token}`;
    } else {
      this._where = in_token;
    }
    return this;
  }
  _base_where_not_in(cols, range) {
    const not_in_token = this._get_in_token(cols, range, "NOT IN");
    if (this._where) {
      this._where = `(${this._where}) AND ${not_in_token}`;
    } else {
      this._where = not_in_token;
    }
    return this;
  }
  _base_where_null(col) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _base_where_not_null(col) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _base_where_between(col, low, high) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _base_where_not_between(col, low, high) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _base_or_where_in(cols, range) {
    const in_token = this._get_in_token(cols, range);
    if (this._where) {
      this._where = `${this._where} OR ${in_token}`;
    } else {
      this._where = in_token;
    }
    return this;
  }
  _base_or_where_not_in(cols, range) {
    const not_in_token = this._get_in_token(cols, range, "NOT IN");
    if (this._where) {
      this._where = `${this._where} OR ${not_in_token}`;
    } else {
      this._where = not_in_token;
    }
    return this;
  }
  _base_or_where_null(col) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _base_or_where_not_null(col) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _base_or_where_between(col, low, high) {
    if (this._where) {
      this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _base_or_where_not_between(col, low, high) {
    if (this._where) {
      this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _rows_to_array(rows, columns) {
    const c = columns.length;
    const n = rows.length;
    const res = new Array(n);
    const fields = this.cls.fields;
    for (let i = 0; i < n; i = i + 1) {
      res[i] = new Array(c);
    }
    for (const [i, col] of columns.entries()) {
      for (let j = 0; j < n; j = j + 1) {
        const v = rows[j][col];
        if (v !== undefined && v !== "") {
          res[j][i] = v;
        } else if (fields[col]) {
          const dft = fields[col].default;
          if (dft !== undefined) {
            res[j][i] = fields[col].get_default(rows[j]);
          } else {
            res[j][i] = NULL;
          }
        } else {
          res[j][i] = NULL;
        }
      }
    }
    return res;
  }
  _get_insert_values_token(row, columns) {
    const value_list = [];
    if (!columns) {
      columns = [];
      for (const [k, v] of Object.entries(row)) {
        columns.push(k);
        value_list.push(v);
      }
    } else {
      for (const col of columns) {
        const v = row[col];
        if (v !== undefined) {
          value_list.push(v);
        } else {
          value_list.push(DEFAULT);
        }
      }
    }
    return [as_literal(value_list), columns];
  }
  _get_bulk_insert_values_token(rows, columns) {
    columns = columns || this.cls.get_keys(rows);
    rows = this._rows_to_array(rows, columns);
    return [map(rows, as_literal), columns];
  }
  _get_update_token_with_prefix(columns, key, table_name) {
    const tokens = [];
    if (typeof key === "string") {
      for (const col of columns) {
        if (col !== key) {
          tokens.push(`${col} = ${table_name}.${col}`);
        }
      }
    } else {
      const sets = [];
      for (const k of key) {
        sets[k] = true;
      }
      for (const col of columns) {
        if (!sets[col]) {
          tokens.push(`${col} = ${table_name}.${col}`);
        }
      }
    }
    return tokens.join(", ");
  }
  _get_select_token(a, b, ...varargs) {
    if (b === undefined) {
      if (Array.is_array(a)) {
        const tokens = a.map((e) => this._get_select_column(e));
        return as_token(tokens);
      } else if (typeof a === "string") {
        return this._get_select_column(a);
      } else {
        return as_token(a);
      }
    } else {
      a = this._get_select_column(a);
      b = this._get_select_column(b);
      let s = as_token(a) + ", " + as_token(b);
      for (const name of varargs) {
        s = s + ", " + as_token(this._get_select_column(name));
      }
      return s;
    }
  }
  _get_select_token_literal(a, b, ...varargs) {
    if (b === undefined) {
      if (Array.is_array(a)) {
        const tokens = a.map(as_literal);
        return as_token(tokens);
      } else {
        return as_literal(a);
      }
    } else {
      let s = as_literal(a) + ", " + as_literal(b);
      for (const name of varargs) {
        s = s + ", " + as_literal(name);
      }
      return s;
    }
  }
  _get_update_token(row, columns) {
    const kv = [];
    if (!columns) {
      for (const [k, v] of Object.entries(row)) {
        kv.push(`${k} = ${as_literal(v)}`);
      }
    } else {
      for (const k of columns) {
        const v = row[k];
        kv.push(`${k} = ${(v !== undefined && as_literal(v)) || "DEFAULT"}`);
      }
    }
    return kv.join(", ");
  }
  _get_with_token(name, token) {
    if (token === undefined) {
      return name;
    } else if (token instanceof Model) {
      return `${name} AS (${token.statement()})`;
    } else {
      return `${name} AS ${token}`;
    }
  }
  _get_insert_token(row, columns) {
    const [values_token, insert_columns] = this._get_insert_values_token(row, columns);
    return `(${as_token(insert_columns)}) VALUES ${values_token}`;
  }
  _get_bulk_insert_token(rows, columns) {
    [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
    return `(${as_token(columns)}) VALUES ${as_token(rows)}`;
  }
  _set_select_subquery_insert_token(sub_query, columns) {
    const columns_token = as_token(columns || sub_query._select || "");
    if (columns_token !== "") {
      this._insert = `(${columns_token}) ${sub_query.statement()}`;
    } else {
      this._insert = sub_query.statement();
    }
  }
  _set_cud_subquery_insert_token(sub_query) {
    const cte_return = sub_query._cte_returning;
    if (cte_return) {
      const cte_columns = cte_return.columns;
      const insert_columns = [...cte_columns, ...cte_return.literal_columns];
      const cud_select_query = Model.new({ table_name: "d" })._base_select(insert_columns);
      this.with(`d(${as_token(insert_columns)})`, sub_query);
      this._insert = `(${as_token(insert_columns)}) ${cud_select_query.statement()}`;
    } else if (sub_query._returning_args) {
      const insert_columns = sub_query._returning_args.flat();
      const cud_select_query = Model.new({ table_name: "d" })._base_select(insert_columns);
      this.with(`d(${as_token(insert_columns)})`, sub_query);
      this._insert = `(${as_token(insert_columns)}) ${cud_select_query.statement()}`;
    }
  }
  _get_upsert_token(row, key, columns) {
    const [values_token, insert_columns] = this._get_insert_values_token(row, columns);
    const insert_token = `(${as_token(insert_columns)}) VALUES ${values_token} ON CONFLICT (${this._get_select_token(
      key
    )})`;
    if ((Array.is_array(key) && key.length === insert_columns.length) || insert_columns.length === 1) {
      return `${insert_token} DO NOTHING`;
    } else {
      return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(insert_columns, key, "EXCLUDED")}`;
    }
  }
  _get_bulk_upsert_token(rows, key, columns) {
    [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
    const insert_token = `(${as_token(columns)}) VALUES ${as_token(rows)} ON CONFLICT (${this._base_get_select_token(
      key
    )})`;
    if ((Array.is_array(key) && key.length === columns.length) || columns.length === 1) {
      return `${insert_token} DO NOTHING`;
    } else {
      return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(columns, key, "EXCLUDED")}`;
    }
  }
  _get_upsert_query_token(rows, key, columns) {
    const columns_token = this._get_select_token(columns);
    const insert_token = `(${columns_token}) ${rows.statement()} ON CONFLICT (${this._get_select_token(key)})`;
    if ((Array.is_array(key) && key.length === columns.length) || columns.length === 1) {
      return `${insert_token} DO NOTHING`;
    } else {
      return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(columns, key, "EXCLUDED")}`;
    }
  }
  _get_join_expr(key, op, val) {
    if (op === undefined) {
      return key;
    } else if (val === undefined) {
      return `${key} = ${op}`;
    } else {
      return `${key} ${op} ${val}`;
    }
  }
  _get_join_token(join_type, right_table, key, op, val) {
    if (key !== undefined) {
      return `${join_type} JOIN ${right_table} ON (${this._get_join_expr(key, op, val)})`;
    } else {
      return `${join_type} JOIN ${right_table}`;
    }
  }
  _get_in_token(cols, range, op) {
    cols = as_token(cols);
    op = op || "IN";
    if (typeof range === "object") {
      if (range instanceof Model) {
        return `(${cols}) ${op} (${range.statement()})`;
      } else {
        return `(${cols}) ${op} ${as_literal(range)}`;
      }
    } else {
      return `(${cols}) ${op} ${range}`;
    }
  }
  _get_update_query_token(sub_select, columns) {
    const columns_token = (columns && this._get_select_token(columns)) || sub_select._select;
    return `(${columns_token}) = (${sub_select.statement()})`;
  }
  _base_get_update_query_token(sub_select, columns) {
    const columns_token = (columns && this._base_get_select_token(columns)) || sub_select._select;
    return `(${columns_token}) = (${sub_select.statement()})`;
  }
  _get_join_conditions(key, left_table, right_table) {
    if (typeof key === "string") {
      return `${left_table}.${key} = ${right_table}.${key}`;
    }
    const res = [];
    for (const k of key) {
      res.push(`${left_table}.${k} = ${right_table}.${k}`);
    }
    return res.join(" AND ");
  }
  _get_cte_values_literal(rows, columns, no_check) {
    columns = columns || this.cls.get_keys(rows);
    rows = this._rows_to_array(rows, columns);
    const first_row = rows[0];
    for (const [i, col] of columns.entries()) {
      const [field] = this._find_field_model(col);
      if (field) {
        first_row[i] = `${as_literal(first_row[i])}::${field.db_type}`;
      } else if (no_check) {
        first_row[i] = as_literal(first_row[i]);
      } else {
        throw new Error("invalid field name for _get_cte_values_literal: " + col);
      }
    }
    const res = [];
    res[0] = "(" + as_token(first_row) + ")";
    for (let i = 1; i < rows.length; i = i + 1) {
      res[i] = as_literal(rows[i]);
    }
    return [res, columns];
  }
  _handle_join(join_type, join_table, join_cond) {
    if (this._update) {
      this.from(join_table);
      this.where(join_cond);
    } else if (this._delete) {
      this.using(join_table);
      this.where(join_cond);
    } else if (join_type === "INNER") {
      this._base_join(join_table, join_cond);
    } else if (join_type === "LEFT") {
      this._base_left_join(join_table, join_cond);
    } else if (join_type === "RIGHT") {
      this._base_right_join(join_table, join_cond);
    } else {
      this._base_full_join(join_table, join_cond);
    }
  }
  _register_join_model(join_args, join_type) {
    join_type = join_type || join_args.join_type || "INNER";
    // let find = true;
    const model = join_args.model || this;
    const fk_model = join_args.fk_model;
    const column = join_args.column;
    const fk_column = join_args.fk_column;
    let join_key;
    if (join_args.join_key === undefined) {
      if (this.table_name === model.table_name) {
        join_key = column + "__" + fk_model.table_name;
      } else {
        join_key = `${join_type}__${model.table_name}__${column}__${fk_model.table_name}__${fk_column}`;
      }
    } else {
      join_key = join_args.join_key;
    }
    if (!this._join_keys) {
      this._join_keys = {};
    }
    let join_obj = this._join_keys[join_key];
    if (!join_obj) {
      // find = false;
      join_obj = {
        join_type,
        model,
        column,
        alias: join_args.alias || model.table_name,
        fk_model,
        fk_column,
        fk_alias: "T" + this._get_join_number(),
      };
      const join_table = `${fk_model.table_name} ${join_obj.fk_alias}`;
      const join_cond = `${join_obj.alias}.${join_obj.column} = ${join_obj.fk_alias}.${join_obj.fk_column}`;
      this._handle_join(join_type, join_table, join_cond);
      this._join_keys[join_key] = join_obj;
    }
    return join_obj; // [join_obj, find];
  }
  _find_field_model(col) {
    const field = this.cls.fields[col];
    if (field) {
      return [field, this, this._as || this.cls.table_name];
    }
    if (!this._join_keys) {
      return [false];
    }
    for (const join_obj of Object.values(this._join_keys)) {
      const fk_field = join_obj.fk_model.fields[col];
      if (join_obj.model.table_name === this.cls.table_name && fk_field) {
        return [fk_field, join_obj.fk_model, join_obj.fk_alias || join_obj.fk_model.table_name];
      }
    }
  }
  _get_where_key(key) {
    let a = key.index_of("__");
    if (a === -1) {
      return [this._get_column(key), "eq"];
    }
    let e = key.slice(0, a);
    let [field, model, prefix] = this._find_field_model(e);
    if (!field) {
      throw new Error(`${e} is not a valid field name for ${this.table_name}`);
    }
    let i, state, fk_model, rc, join_key;
    let op = "eq";
    let field_name = e;
    if (field.reference) {
      fk_model = field.reference;
      rc = field.reference_column;
      state = FOREIGN_KEY;
    } else {
      state = NON_FOREIGN_KEY;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i = a + 2;
      a = key.index_of("__", i);
      if (a === -1) {
        e = key.slice(i);
      } else {
        e = key.slice(i, a);
      }
      if (state === NON_FOREIGN_KEY) {
        op = e;
        state = END;
      } else if (state === FOREIGN_KEY) {
        const field_of_fk = fk_model.fields[e];
        if (field_of_fk) {
          if (!join_key) {
            join_key = field_name + "__" + fk_model.table_name;
          } else {
            join_key = join_key + "__" + field_name;
          }
          const join_obj = this._register_join_model({
            join_key,
            model,
            column: field_name,
            alias: prefix || model.table_name,
            fk_model,
            fk_column: rc,
          });
          prefix = join_obj.fk_alias;
          if (field_of_fk.reference) {
            model = fk_model;
            fk_model = field_of_fk.reference;
            rc = field_of_fk.reference_column;
          } else {
            state = NON_FOREIGN_KEY;
          }
          field_name = e;
        } else {
          op = e;
          state = END;
        }
      } else {
        throw new Error(`invalid cond table key parsing state ${state} with token ${e}`);
      }
      if (a == -1) {
        break;
      }
    }
    return [prefix + "." + field_name, op];
  }
  _get_column(key) {
    if (this.cls.fields[key]) {
      return (this._as && this._as + "." + key) || this.cls.name_cache[key];
    }
    if (!this._join_keys) {
      return key;
    }
    for (const join_obj of Object.values(this._join_keys)) {
      if (join_obj.model.table_name === this.table_name && join_obj.fk_model.fields[key]) {
        return join_obj.fk_alias + "." + key;
      }
    }
    return key;
  }
  _get_select_column(key) {
    if (typeof key !== "string") {
      return key;
    } else {
      return this._get_column(key);
    }
  }
  _get_expr_token(value, key, op) {
    if (op === "eq") {
      return `${key} = ${as_literal(value)}`;
    } else if (op === "in") {
      return `${key} IN ${as_literal(value)}`;
    } else if (op === "notin") {
      return `${key} NOT IN ${as_literal(value)}`;
    } else if (COMPARE_OPERATORS[op]) {
      return `${key} ${COMPARE_OPERATORS[op]} ${as_literal(value)}`;
    } else if (op === "contains") {
      return `${key} LIKE '%${value.gsub("'", "''")}%'`;
    } else if (op === "startswith") {
      return `${key} LIKE '${value.gsub("'", "''")}%'`;
    } else if (op === "endswith") {
      return `${key} LIKE '%${value.gsub("'", "''")}'`;
    } else if (op === "null") {
      if (value) {
        return `${key} IS NULL`;
      } else {
        return `${key} IS NOT NULL`;
      }
    } else {
      throw new Error("invalid sql op: " + String(op));
    }
  }
  _get_join_number() {
    if (this._join_keys) {
      return Object.keys(this._join_keys).length + 1;
    } else {
      return 1;
    }
  }
  _handle_where_token(where_token, tpl) {
    if (where_token === "") {
      return this;
    } else if (this._where === undefined) {
      this._where = where_token;
    } else {
      this._where = string_format(tpl, this._where, where_token);
    }
    return this;
  }
  _get_condition_token_from_table(kwargs, logic) {
    const tokens = [];
    if (Array.is_array(kwargs)) {
      for (const value of kwargs) {
        const token = this._get_condition_token(value);
        if (token !== undefined && token !== "") {
          tokens.push("(" + token + ")");
        }
      }
    } else {
      for (const [k, value] of Object.entries(kwargs)) {
        tokens.push(this._get_expr_token(value, ...this._get_where_key(k)));
      }
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + logic + " ");
    }
  }
  _get_condition_token(cond, op, dval) {
    if (op === undefined) {
      if (typeof cond === "object") {
        return this._get_condition_token_from_table(cond);
      } else {
        return this._base_get_condition_token(cond);
      }
    } else if (dval === undefined) {
      return `${this._get_column(cond)} = ${as_literal(op)}`;
    } else {
      return `${this._get_column(cond)} ${op} ${as_literal(dval)}`;
    }
  }
  _get_condition_token_or(cond, op, dval) {
    if (typeof cond === "object") {
      return this._get_condition_token_from_table(cond, "OR");
    } else {
      return this._get_condition_token(cond, op, dval);
    }
  }
  _get_condition_token_not(cond, op, dval) {
    let token;
    if (typeof cond === "object") {
      token = this._get_condition_token_from_table(cond, "OR");
    } else {
      token = this._get_condition_token(cond, op, dval);
    }
    return (token !== "" && `NOT (${token})`) || "";
  }
  _handle_set_option(other_sql, inner_attr) {
    if (!this[inner_attr]) {
      this[inner_attr] = other_sql.statement();
    } else {
      this[inner_attr] = `(${this[inner_attr]}) ${PG_SET_MAP[inner_attr]} (${other_sql.statement()})`;
    }
    this.statement = this._statement_for_set;
    return this;
  }
  _statement_for_set() {
    let statement = this.statement();
    if (this._intersect) {
      statement = `(${statement}) INTERSECT (${this._intersect})`;
    } else if (this._intersect_all) {
      statement = `(${statement}) INTERSECT ALL (${this._intersect_all})`;
    } else if (this._union) {
      statement = `(${statement}) UNION (${this._union})`;
    } else if (this._union_all) {
      statement = `(${statement}) UNION ALL (${this._union_all})`;
    } else if (this._except) {
      statement = `(${statement}) EXCEPT (${this._except})`;
    } else if (this._except_all) {
      statement = `(${statement}) EXCEPT ALL (${this._except_all})`;
    }
    return statement;
  }
  statement() {
    const table_name = this.get_table();
    const statement = assemble_sql({
      table_name,
      with: this._with,
      join: this._join,
      distinct: this._distinct,
      returning: this._returning,
      cte_returning: this._cte_returning,
      insert: this._insert,
      update: this._update,
      delete: this._delete,
      using: this._using,
      select: this._select,
      from: this._from,
      where: this._where,
      group: this._group,
      having: this._having,
      order: this._order,
      limit: this._limit,
      offset: this._offset,
    });
    return statement;
  }
  with(name, token) {
    const with_token = this._get_with_token(name, token);
    if (this._with) {
      this._with = `${this._with}, ${with_token}`;
    } else {
      this._with = with_token;
    }
    return this;
  }
  union(other_sql) {
    return this._handle_set_option(other_sql, "_union");
  }
  union_all(other_sql) {
    return this._handle_set_option(other_sql, "_union_all");
  }
  except(other_sql) {
    return this._handle_set_option(other_sql, "_except");
  }
  except_all(other_sql) {
    return this._handle_set_option(other_sql, "_except_all");
  }
  intersect(other_sql) {
    return this._handle_set_option(other_sql, "_intersect");
  }
  intersect_all(other_sql) {
    return this._handle_set_option(other_sql, "_intersect_all");
  }
  as(table_alias) {
    this._as = table_alias;
    return this;
  }
  with_values(name, rows) {
    let columns = this.cls.get_keys(rows[0]);
    [rows, columns] = this._get_cte_values_literal(rows, columns, true);
    const cte_name = `${name}(${columns.join(", ")})`;
    const cte_values = `(VALUES ${as_token(rows)})`;
    return this.with(cte_name, cte_values);
  }
  insert(rows, columns) {
    if (!(rows instanceof Model)) {
      if (!this._skip_validate) {
        [rows, columns] = this.cls.validate_create_data(rows, columns);
      }
      [rows, columns] = this.cls.prepare_db_rows(rows, columns);
    }
    return this._base_insert(rows, columns);
  }
  update(row, columns) {
    if (typeof row === "string") {
      return this._base_update(row);
    } else if (!(row instanceof Model)) {
      if (!this._skip_validate) {
        row = this.cls.validate_update(row, columns);
      }
      [row, columns] = this.cls.prepare_db_rows(row, columns, true);
    }
    return this._base_update(row, columns);
  }
  async get_multiple(keys, columns) {
    if (this._commit === undefined || this._commit) {
      return await this._base_get_multiple(keys, columns).exec();
    } else {
      return this._base_get_multiple(keys, columns);
    }
  }
  async merge(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skip_validate) {
      [rows, key, columns] = this.cls.validate_create_rows(rows, key, columns);
    }
    [rows, columns] = this.cls.prepare_db_rows(rows, columns, false);
    this._base_merge(rows, key, columns).compact();
    if (!this._returning) {
      this.returning(key);
    }
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async upsert(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skip_validate) {
      [rows, key, columns] = this.cls.validate_create_rows(rows, key, columns);
    }
    [rows, columns] = this.cls.prepare_db_rows(rows, columns, false);
    this._base_upsert(rows, key, columns).compact();
    if (!this._returning) {
      this.returning(key);
    }
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async updates(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skip_validate) {
      [rows, key, columns] = this.cls.validate_update_rows(rows, key, columns);
    }
    [rows, columns] = this.cls.prepare_db_rows(rows, columns, true);
    this._base_updates(rows, key, columns).compact();
    if (!this._returning) {
      this.returning(key);
    }
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async get_merge(rows, key) {
    let columns = this.cls.get_keys(rows[0]);
    [rows, columns] = this._get_cte_values_literal(rows, columns, true);
    const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
    const cte_name = `V(${columns.join(", ")})`;
    const cte_values = `(VALUES ${as_token(rows)})`;
    this._base_select("V.*").with(cte_name, cte_values)._base_right_join("V", join_cond);
    if (this._commit === undefined || this._commit) {
      return await this.execr();
    } else {
      return this;
    }
  }
  copy() {
    const copy_sql = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value === "object") {
        copy_sql[key] = clone(value);
      } else {
        copy_sql[key] = value;
      }
    }
    return Model.new(copy_sql);
  }
  delete(cond, op, dval) {
    this._delete = true;
    if (cond !== undefined) {
      this.where(cond, op, dval);
    }
    return this;
  }
  distinct() {
    this._distinct = true;
    return this;
  }
  select(a, b, ...varargs) {
    const s = this._get_select_token(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  select_literal(a, b, ...varargs) {
    const s = this._get_select_token_literal(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  returning(a, b, ...varargs) {
    const s = this._get_select_token(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    } else {
      return this;
    }
    if (this._returning_args) {
      this._returning_args = [this._returning_args, a, b, ...varargs];
    } else {
      this._returning_args = [a, b, ...varargs];
    }
    return this;
  }
  returning_literal(a, b, ...varargs) {
    const s = this._get_select_token_literal(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    }
    if (this._returning_args) {
      this._returning_args = [this._returning_args, a, b, ...varargs];
    } else {
      this._returning_args = [a, b, ...varargs];
    }
    return this;
  }
  cte_returning(opts) {
    this._cte_returning = opts;
    return this;
  }
  group(...varargs) {
    if (!this._group) {
      this._group = this._get_select_token(...varargs);
    } else {
      this._group = this._group + ", " + this._get_select_token(...varargs);
    }
    return this;
  }
  group_by(...varargs) {
    return this.group(...varargs);
  }
  order(...varargs) {
    if (!this._order) {
      this._order = this._get_select_token(...varargs);
    } else {
      this._order = this._order + ", " + this._get_select_token(...varargs);
    }
    return this;
  }
  order_by(...varargs) {
    return this.order(...varargs);
  }
  using(a, ...varargs) {
    this._delete = true;
    this._using = this._get_select_token(a, ...varargs);
    return this;
  }
  from(a, ...varargs) {
    if (!this._from) {
      this._from = this._get_select_token(a, ...varargs);
    } else {
      this._from = this._from + ", " + this._get_select_token(a, ...varargs);
    }
    return this;
  }
  get_table() {
    return (this._as === undefined && this.table_name) || this.table_name + " AS " + this._as;
  }
  join(join_args, key, op, val) {
    if (typeof join_args === "object") {
      this._register_join_model(join_args, "INNER");
    } else {
      this._base_join(join_args, key, op, val);
    }
    return this;
  }
  inner_join(join_args, key, op, val) {
    if (typeof join_args === "object") {
      this._register_join_model(join_args, "INNER");
    } else {
      this._base_join(join_args, key, op, val);
    }
    return this;
  }
  left_join(join_args, key, op, val) {
    if (typeof join_args === "object") {
      this._register_join_model(join_args, "LEFT");
    } else {
      this._base_left_join(join_args, key, op, val);
    }
    return this;
  }
  right_join(join_args, key, op, val) {
    if (typeof join_args === "object") {
      this._register_join_model(join_args, "RIGHT");
    } else {
      this._base_right_join(join_args, key, op, val);
    }
    return this;
  }
  full_join(join_args, key, op, val) {
    if (typeof join_args === "object") {
      this._register_join_model(join_args, "FULL");
    } else {
      this._base_full_join(join_args, key, op, val);
    }
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  offset(n) {
    this._offset = n;
    return this;
  }
  where(cond, op, dval) {
    const where_token = this._get_condition_token(cond, op, dval);
    return this._handle_where_token(where_token, "(%s) AND (%s)");
  }
  where_or(cond, op, dval) {
    const where_token = this._get_condition_token_or(cond, op, dval);
    return this._handle_where_token(where_token, "(%s) AND (%s)");
  }
  or_where_or(cond, op, dval) {
    const where_token = this._get_condition_token_or(cond, op, dval);
    return this._handle_where_token(where_token, "%s OR %s");
  }
  where_not(cond, op, dval) {
    const where_token = this._get_condition_token_not(cond, op, dval);
    return this._handle_where_token(where_token, "(%s) AND (%s)");
  }
  or_where(cond, op, dval) {
    const where_token = this._get_condition_token(cond, op, dval);
    return this._handle_where_token(where_token, "%s OR %s");
  }
  or_where_not(cond, op, dval) {
    const where_token = this._get_condition_token_not(cond, op, dval);
    return this._handle_where_token(where_token, "%s OR %s");
  }
  where_exists(builder) {
    if (this._where) {
      this._where = `(${this._where}) AND EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  where_not_exists(builder) {
    if (this._where) {
      this._where = `(${this._where}) AND NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  where_in(cols, range) {
    if (typeof cols === "string") {
      return this._base_where_in(this._get_column(cols), range);
    } else {
      const res = cols.map((e) => this._get_column(e));
      return this._base_where_in(res, range);
    }
  }
  where_not_in(cols, range) {
    if (typeof cols === "string") {
      cols = this._get_column(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._get_column(cols[i]);
      }
    }
    return this._base_where_not_in(cols, range);
  }
  where_null(col) {
    return this._base_where_null(this._get_column(col));
  }
  where_not_null(col) {
    return this._base_where_not_null(this._get_column(col));
  }
  where_between(col, low, high) {
    return this._base_where_between(this._get_column(col), low, high);
  }
  where_not_between(col, low, high) {
    return this._base_where_not_between(this._get_column(col), low, high);
  }
  or_where_in(cols, range) {
    if (typeof cols === "string") {
      cols = this._get_column(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._get_column(cols[i]);
      }
    }
    return this._base_or_where_in(cols, range);
  }
  or_where_not_in(cols, range) {
    if (typeof cols === "string") {
      cols = this._get_column(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._get_column(cols[i]);
      }
    }
    return this._base_or_where_not_in(cols, range);
  }
  or_where_null(col) {
    return this._base_or_where_null(this._get_column(col));
  }
  or_where_not_null(col) {
    return this._base_or_where_not_null(this._get_column(col));
  }
  or_where_between(col, low, high) {
    return this._base_or_where_between(this._get_column(col), low, high);
  }
  or_where_not_between(col, low, high) {
    return this._base_or_where_not_between(this._get_column(col), low, high);
  }
  or_where_exists(builder) {
    if (this._where) {
      this._where = `${this._where} OR EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  or_where_not_exists(builder) {
    if (this._where) {
      this._where = `${this._where} OR NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  having(cond, op, dval) {
    if (this._having) {
      this._having = `(${this._having}) AND (${this._get_condition_token(cond, op, dval)})`;
    } else {
      this._having = this._get_condition_token(cond, op, dval);
    }
    return this;
  }
  having_not(cond, op, dval) {
    if (this._having) {
      this._having = `(${this._having}) AND (${this._get_condition_token_not(cond, op, dval)})`;
    } else {
      this._having = this._get_condition_token_not(cond, op, dval);
    }
    return this;
  }
  having_exists(builder) {
    if (this._having) {
      this._having = `(${this._having}) AND EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  having_not_exists(builder) {
    if (this._having) {
      this._having = `(${this._having}) AND NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  having_in(cols, range) {
    const in_token = this._get_in_token(cols, range);
    if (this._having) {
      this._having = `(${this._having}) AND ${in_token}`;
    } else {
      this._having = in_token;
    }
    return this;
  }
  having_not_in(cols, range) {
    const not_in_token = this._get_in_token(cols, range, "NOT IN");
    if (this._having) {
      this._having = `(${this._having}) AND ${not_in_token}`;
    } else {
      this._having = not_in_token;
    }
    return this;
  }
  having_null(col) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  having_not_null(col) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  having_between(col, low, high) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  having_not_between(col, low, high) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  or_having(cond, op, dval) {
    if (this._having) {
      this._having = `${this._having} OR ${this._get_condition_token(cond, op, dval)}`;
    } else {
      this._having = this._get_condition_token(cond, op, dval);
    }
    return this;
  }
  or_having_not(cond, op, dval) {
    if (this._having) {
      this._having = `${this._having} OR ${this._get_condition_token_not(cond, op, dval)}`;
    } else {
      this._having = this._get_condition_token_not(cond, op, dval);
    }
    return this;
  }
  or_having_exists(builder) {
    if (this._having) {
      this._having = `${this._having} OR EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  or_having_not_exists(builder) {
    if (this._having) {
      this._having = `${this._having} OR NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  or_having_in(cols, range) {
    const in_token = this._get_in_token(cols, range);
    if (this._having) {
      this._having = `${this._having} OR ${in_token}`;
    } else {
      this._having = in_token;
    }
    return this;
  }
  or_having_not_in(cols, range) {
    const not_in_token = this._get_in_token(cols, range, "NOT IN");
    if (this._having) {
      this._having = `${this._having} OR ${not_in_token}`;
    } else {
      this._having = not_in_token;
    }
    return this;
  }
  or_having_null(col) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  or_having_not_null(col) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  or_having_between(col, low, high) {
    if (this._having) {
      this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  or_having_not_between(col, low, high) {
    if (this._having) {
      this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  async exists() {
    const statement = `SELECT EXISTS (${this.select(1).limit(1).statement()})`;
    const res = await this.cls.sql_query(statement);
    return res;
  }
  compact() {
    this._compact = true;
    return this;
  }
  raw() {
    this._raw = true;
    return this;
  }
  commit(bool) {
    if (bool === undefined) {
      bool = true;
    }
    this._commit = bool;
    return this;
  }
  skip_validate(bool) {
    if (bool === undefined) {
      bool = true;
    }
    this._skip_validate = bool;
    return this;
  }
  async flat(depth) {
    const res = await this.compact().execr();
    return res.flat(depth);
  }
  async count(cond, op, dval) {
    let res;
    if (cond !== undefined) {
      res = this.select("count(*)").where(cond, op, dval).compact().exec();
    } else {
      res = this.select("count(*)").compact().exec();
    }
    return res[0][0];
  }
  async create(rows, columns) {
    return await this.insert(rows, columns).returning("*").execr();
  }
  async try_get(cond, op, dval) {
    let records;
    if (cond !== undefined) {
      if (typeof cond === "object" && is_empty_object(cond)) {
        throw new Error("empty condition table is not allowed");
      }
      records = await this.where(cond, op, dval).limit(2).exec();
    } else {
      records = await this.limit(2).exec();
    }
    if (records.length === 1) {
      return records[0];
    } else {
      return undefined;
    }
  }
  async get(cond, op, dval) {
    let records;
    if (cond !== undefined) {
      if (typeof cond === "object" && is_empty_object(cond)) {
        throw new Error("empty condition table is not allowed");
      }
      records = await this.where(cond, op, dval).limit(2).exec();
    } else {
      records = await this.limit(2).exec();
    }
    if (records.length === 1) {
      return records[0];
    } else if (records.length === 0) {
      throw new Error("record not found");
    } else {
      throw new Error("multiple records returned: " + records.length);
    }
  }
  async get_or_create(params, defaults) {
    const records = await this.where(params).limit(2).exec();
    if (records.length === 1) {
      return [records[0], false];
    } else if (records.length === 0) {
      const pk = this.primary_key;
      const data = { ...params, ...defaults };
      //**NOTE: transacion here?
      const res = await this.new_sql().insert(data, this.names).returning(pk).execr();
      data[pk] = res[0][pk];
      return [this.cls.new_record(data), true];
    } else {
      throw new Error("expect 1 row returned, but now get " + records.length);
    }
  }
  async as_set() {
    const res = (await this.compact().execr()).flat();
    return new Set(res);
  }
  static async sql_query(statement) {
    // if (process?.env["PRINT_QUERY_SQL"] === "on") {
    //   console.log("  ", statement);
    // }
    return statement;
  }
  async execr() {
    return await this.raw().exec();
  }
  async exec() {
    const cls = this.cls;
    const statement = this.statement();
    const records = await cls.sql_query(statement);
    if (this._raw || this._compact || this._update || this._insert || this._delete) {
      return records;
    } else {
      if (!this._load_fk) {
        for (const [i, record] of records.entries()) {
          records[i] = cls.load(record);
        }
      } else {
        const fields = cls.fields;
        const field_names = cls.field_names;
        for (const [i, record] of records.entries()) {
          for (const name of field_names) {
            const field = fields[name];
            const value = record[name];
            if (value !== undefined) {
              const fk_model = this._load_fk[name];
              if (!fk_model) {
                if (!field.load) {
                  record[name] = value;
                } else {
                  record[name] = field.load(value);
                }
              } else {
                record[name] = fk_model.load(get_foreign_object(record, name + "__"));
              }
            }
          }
          records[i] = cls.new_record(record);
        }
      }
      return records;
    }
  }
  load_fk(fk_name, select_names, ...varargs) {
    const fk = this.foreign_keys[fk_name];
    if (fk === undefined) {
      throw new Error(fk_name + (" is not a valid forein key name for " + this.table_name));
    }
    const fk_model = fk.reference;
    const join_key = fk_name + "__" + fk_model.table_name;
    const join_obj = this._register_join_model({
      join_key,
      column: fk_name,
      fk_model,
      fk_column: fk.reference_column,
    });
    if (!this._load_fk) {
      this._load_fk = {};
    }
    this._load_fk[fk_name] = fk_model;
    this.select(fk_name);
    if (!select_names) {
      return this;
    }
    const right_alias = join_obj.fk_alias;
    let fks;
    if (typeof select_names === "object") {
      const res = [];
      for (const fkn of select_names) {
        assert(fk_model.fields[fkn], "invalid field name for fk model: " + fkn);
        res.push(`${right_alias}.${fkn} AS ${fk_name}__${fkn}`);
      }
      fks = res.join(", ");
    } else if (select_names === "*") {
      const res = [];
      for (const fkn of fk_model.field_names) {
        res.push(`${right_alias}.${fkn} AS ${fk_name}__${fkn}`);
      }
      fks = res.join(", ");
    } else if (typeof select_names === "string") {
      assert(fk_model.fields[select_names], "invalid field name for fk model: " + select_names);
      fks = `${right_alias}.${select_names} AS ${fk_name}__${select_names}`;
      for (let i = 0; i < varargs.length; i = i + 1) {
        const fkn = varargs[i];
        assert(fk_model.fields[fkn], "invalid field name for fk model: " + fkn);
        fks = `${fks}, ${right_alias}.${fkn} AS ${fk_name}__${fkn}`;
      }
    } else {
      throw new Error(`invalid argument type ${typeof select_names} for load_fk`);
    }
    return this._base_select(fks);
  }
}

export { Model };
