import * as Fields from "./field";
import Sql from "./sql.mjs";
import {
  clone,
  assert,
  next,
  NULL,
  DEFAULT,
  unique,
  dict,
  capitalize,
  Http,
  Query,
  getenv,
  ngx_localtime,
  IS_PG_KEYWORDS,
} from "./utils";

const default_query = Query({
  getenv,
  HOST: getenv("PGHOST") || "127.0.0.1",
  PORT: getenv("PGPORT") || 5432,
  DATABASE: getenv("PGDATABASE") || "postgres",
  USER: getenv("PGUSER") || "postgres",
  PASSWORD: getenv("PGPASSWORD") || "postgres",
});
const DEFAULT_PRIMARY_KEY = "id";
const DEFAULT_STRING_MAXLENGTH = 256;
const MODEL_MERGE_NAMES = {
  admin: true,
  table_name: true,
  label: true,
  db_options: true,
  abstract: true,
  disable_auto_primary_key: true,
  primary_key: true,
  unique_together: true,
};
class ValidateError extends Error {
  constructor({ name, message, label, index }) {
    super(message);
    Object.assign(this, { name, label, message, index });
  }
  toString() {
    return `MODEL FIELD ERROR: ${this.name}(${this.label})+${this.message}`;
  }
}
class ValidateBatchError extends ValidateError {
  constructor({ name, message, label, index, batch_index }) {
    super({ name, message, label, index });
    this.batch_index = batch_index;
  }
}
const base_model = {
  abstract: true,
  field_names: [DEFAULT_PRIMARY_KEY, "ctime", "utime"],
  fields: {
    [DEFAULT_PRIMARY_KEY]: { type: "integer", primary_key: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", auto_now_add: true },
    utime: { label: "更新时间", type: "datetime", auto_now: true },
  },
};

function check_reserved(name) {
  assert(typeof name === "string", `name must by string, not ${typeof name} (${name})`);
  assert(!name.includes("__"), "don't use __ in a field name");
  assert(!IS_PG_KEYWORDS[name.toUpperCase()], `${name} is a postgresql reserved word`);
}
function ensure_field_as_options(field, name) {
  if (field instanceof Fields.basefield) {
    field = field.get_options();
  } else {
    field = clone(field);
  }
  if (name) {
    field.name = name;
  }
  assert(field.name, "you must define a name for a field");
  return field;
}
function normalize_field_names(field_names) {
  assert(Array.isArray(field_names), "you must provide field_names for a model");
  for (const name of field_names) {
    assert(typeof name === "string", `field_names must be string, not ${typeof name}`);
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
function make_field_from_json(json, kwargs) {
  const options = { ...json, ...kwargs };
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
  return fcls.create_field(options);
}
const token = Sql.token;
const as_token = Sql.as_token;
const as_literal = Sql.as_literal;
const as_literal_without_brackets = Sql.as_literal_without_brackets;

class ModelSql extends Sql {}
ModelSql.prototype.increase = function (name, amount) {
  return this.update({ [name]: token(`${name} + ${amount || 1}`) });
};
ModelSql.prototype.decrease = function (name, amount) {
  return this.update({ [name]: token(`${name} - ${amount || 1}`) });
};
ModelSql.prototype._base_get_multiple = function (keys, columns) {
  if (keys.length === 0) {
    throw new Error("empty keys passed to get_multiple");
  }
  columns = columns || Sql.get_keys(keys[0]);
  [keys, columns] = this._get_cte_values_literal(keys, columns, false);
  const join_cond = this._get_join_conditions(columns, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(keys)})`;
  return this.with(cte_name, cte_values).right_join("V", join_cond);
};
ModelSql.prototype._get_cte_values_literal = function (rows, columns, no_check) {
  columns = columns || Sql.get_keys(rows);
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
  res[0] = "(" + (as_token(first_row) + ")");
  for (let i = 2; i <= rows.length; i = i + 1) {
    res[i] = as_literal(rows[i]);
  }
  return [res, columns];
};
ModelSql.prototype._rows_to_array = function (rows, columns) {
  const c = columns.length;
  const n = rows.length;
  const res = new Array(n);
  const fields = this.model.fields;
  for (let i = 0; i < n; i = i + 1) {
    res[i] = new Array(c);
  }
  for (const [i, col] of columns.entries()) {
    for (let j = 0; j < n; j = j + 1) {
      const v = rows[j][col];
      if (v !== undefined && v !== "") {
        res[j][i] = v;
      } else if (fields[col]) {
        const _js_default = fields[col].default;
        if (_js_default !== undefined) {
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
};
ModelSql.prototype._register_join_model = function (join_args, join_type) {
  join_type = join_type || join_args.join_type || "INNER";
  let model, table_name;
  if (join_args.model) {
    model = join_args.model;
    table_name = model.table_name;
  } else {
    model = this.model;
    table_name = this.table_name;
  }
  const column = join_args.column;
  const f = assert(model.fields[column], `invalid name ${column} for model ${table_name}`);
  const fk_model = join_args.fk_model || (f && f.reference);
  const fk_column = join_args.fk_column || (f && f.reference_column);
  let join_key;
  if (join_args.join_key === undefined) {
    if (this.table_name === table_name) {
      join_key = column + ("__" + fk_model.table_name);
    } else {
      join_key = `${join_type}__${table_name}__${column}__${fk_model.table_name}__${fk_column}`;
    }
  } else {
    join_key = join_args.join_key;
  }
  if (!this._join_keys) {
    this._join_keys = [];
  }
  let join_obj = this._join_keys[join_key];
  if (!join_obj) {
    join_obj = {
      join_type,
      model,
      column,
      alias: join_args.alias || table_name,
      fk_model,
      fk_column,
      fk_alias: join_args.fk_alias || "T" + this._get_join_number(),
    };
    const join_table = `${fk_model.table_name} ${join_obj.fk_alias}`;
    const join_cond = `${join_obj.alias}.${join_obj.column} = ${join_obj.fk_alias}.${join_obj.fk_column}`;
    this._handle_join(join_type, join_table, join_cond);
    this._join_keys[join_key] = join_obj;
  }
  return join_obj;
};
ModelSql.prototype._find_field_model = function (col) {
  const field = this.model.fields[col];
  if (field) {
    return [field, this.model, this._as || this.table_name];
  }
  if (!this._join_keys) {
    return [null];
  }
  for (const join_obj of Object.values(this._join_keys)) {
    const fk_field = join_obj.fk_model.fields[col];
    if (fk_field && join_obj.model.table_name === this.table_name) {
      return [fk_field, join_obj.fk_model, join_obj.fk_alias || join_obj.fk_model.table_name];
    }
  }
};
ModelSql.prototype._parse_column = function (key, as_select, strict, disable_alias) {
  let a = key.index_of("__");
  if (a === -1) {
    return [this._get_column(key, strict), "eq"];
  }
  let token = key.slice(0, a);
  let [field, model, prefix] = this._find_field_model(token);
  if (!field) {
    throw new Error(`${token} is not a valid field name for ${this.table_name}`);
  }
  let i, fk_model, rc, join_key, is_fk, op;
  let field_name = token;
  // eslint-disable-next-line no-constant-condition
  while (1) {
    i = a + 1;
    a = key.index_of("__", i);
    if (a === -1) {
      token = key.slice(i);
    } else {
      token = key.slice(i, a);
    }
    if (!field.reference) {
      op = token;
      break;
    } else {
      fk_model = field.reference;
      rc = field.reference_column;
      is_fk = true;
      const fk_model_field = fk_model.fields[token];
      if (!fk_model_field) {
        // fk__eq, compare on fk value directly
        op = token;
        break;
      } else if (token === field.reference_column) {
        // fk__id, unnecessary suffix, ignore
        break;
      } else {
        // fk__name, need inner join
        if (!join_key) {
          join_key = field_name + ("__" + fk_model.table_name);
        } else {
          join_key = join_key + ("__" + field_name);
        }
        const join_obj = this._register_join_model({
          join_type: this._join_type || "INNER",
          join_key,
          model,
          column: field_name,
          alias: assert(prefix, "prefix in _parse_column should never be falsy"),
          fk_model,
          fk_column: rc,
        });
        field = fk_model_field;
        model = fk_model;
        prefix = join_obj.fk_alias;
        field_name = token;
      }
    }
    if (!a) {
      break;
    }
  }
  const final_key = prefix + ("." + field_name);
  if (as_select && is_fk && !disable_alias) {
    assert(op === undefined, `invalid field name: ${op}`);
    return [final_key + (" AS " + key), op];
  } else {
    return [final_key, op || "eq"];
  }
};
ModelSql.prototype._get_column = function (key, strict) {
  if (this.model.fields[key]) {
    return (this._as && this._as + ("." + key)) || this.model.name_cache[key];
  }
  if (key === "*") {
    return "*";
  }
  const [table_name, column] = key.match(/^([\w_]+)[.]([\w_]+)$/);
  if (table_name) {
    return key;
  }
  if (this._join_keys) {
    for (const join_obj of Object.values(this._join_keys)) {
      if (join_obj.model.table_name === this.table_name && join_obj.fk_model.fields[key]) {
        return join_obj.fk_alias + ("." + key);
      }
    }
  }
  if (strict) {
    throw new Error(`invalid field name: '${key}'`);
  } else {
    return key;
  }
};
ModelSql.prototype._base_join = function (join_type, join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, join_type);
    return this;
  }
  const fk = this.model.foreign_keys[join_args];
  if (fk) {
    this._register_join_model(
      {
        model: this.model,
        column: join_args,
        fk_model: fk.reference,
        fk_column: fk.reference_column,
        fk_alias: fk.reference.table_name,
      },
      join_type
    );
    return this;
  }
  return Sql.prototype._base_join.call(this, join_type, join_args, key, op, val);
};
ModelSql.prototype.insert = function (rows, columns) {
  if (!(rows instanceof ModelSql)) {
    if (!this._skip_validate) {
      [rows, columns] = this.model.validate_create_data(rows, columns);
    }
    [rows, columns] = this.model.prepare_db_rows(rows, columns);
  }
  return Sql.prototype._base_insert.call(this, rows, columns);
};
ModelSql.prototype.update = function (row, columns) {
  if (typeof row === "string") {
    return Sql.prototype._base_update.call(this, row);
  } else if (!(row instanceof ModelSql)) {
    if (!this._skip_validate) {
      row = this.model.validate_update(row, columns);
    }
    [row, columns] = this.model.prepare_db_rows(row, columns, true);
  }
  return Sql.prototype._base_update.call(this, row, columns);
};
ModelSql.prototype.merge = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  return Sql.prototype._base_merge.call(this, rows, key, columns);
};
ModelSql.prototype.upsert = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  return Sql.prototype._base_upsert.call(this, rows, key, columns);
};
ModelSql.prototype.updates = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_update_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, true);
  return Sql.prototype._base_updates.call(this, rows, key, columns);
};
ModelSql.prototype.get_multiple = async function (keys, columns) {
  if (this._commit === undefined || this._commit) {
    return Sql.prototype._base_get_multiple.call(this, keys, columns).exec();
  } else {
    return Sql.prototype._base_get_multiple.call(this, keys, columns);
  }
};
ModelSql.prototype.exec_statement = async function (statement) {
  const records = assert(await this.model.query(statement, this._compact));
  if (this._raw || this._compact || this._update || this._insert || this._delete) {
    if ((this._update || this._insert || this._delete) && this._returning) {
      delete records.affected_rows;
    }
    return records;
  } else {
    const cls = this.model;
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
        records[i] = cls.create_record(record);
      }
    }
    return records;
  }
};
ModelSql.prototype.exec = async function () {
  return await this.exec_statement(this.statement());
};
ModelSql.prototype.count = async function (cond, op, dval) {
  let res;
  if (cond !== undefined) {
    res = await this._base_select("count(*)").where(cond, op, dval).compact().exec();
  } else {
    res = await this._base_select("count(*)").compact().exec();
  }
  return res[0][0];
};
ModelSql.prototype.create = async function (rows, columns) {
  return await this.insert(rows, columns).execr();
};
ModelSql.prototype.exists = async function () {
  const statement = `SELECT EXISTS (${this.select(1).limit(1).compact().statement()})`;
  const res = await this.model.query(statement, this._compact);
  return res;
};
ModelSql.prototype.compact = function () {
  this._compact = true;
  return this;
};
ModelSql.prototype.raw = function () {
  this._raw = true;
  return this;
};
ModelSql.prototype.commit = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._commit = bool;
  return this;
};
ModelSql.prototype.join_type = function (jtype) {
  this._join_type = jtype;
  return this;
};
ModelSql.prototype.skip_validate = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._skip_validate = bool;
  return this;
};
ModelSql.prototype.flat = async function (col) {
  if (col) {
    return this.returning(col).compact().execr().flat();
  } else {
    return this.compact().execr().flat();
  }
};
ModelSql.prototype.try_get = async function (cond, op, dval) {
  let records;
  if (cond !== undefined) {
    if (typeof cond === "object" && next(cond) === undefined) {
      throw new Error("empty condition table is not allowed");
    }
    records = await this.where(cond, op, dval).limit(2).exec();
  } else {
    records = await this.limit(2).exec();
  }
  if (records.length === 1) {
    return records[0];
  } else {
    throw new Error(records.length);
  }
};
ModelSql.prototype.get = async function (cond, op, dval) {
  try {
    return await this.try_get(cond, op, dval);
  } catch (error) {
    throw new Error(`failed to get: ${error.message} returned`);
  }
};
ModelSql.prototype.as_set = async function () {
  return await this.compact().execr().flat().as_set();
};
ModelSql.prototype.execr = async function () {
  return await this.raw().exec();
};
ModelSql.prototype.load_all_fk_labels = function () {
  for (const name of this.model.names) {
    const field = this.model.fields[name];
    if (field && field.type === "foreignkey" && field.reference_label_column !== field.reference__column) {
      this.load_fk(field.name, field.reference_label_column);
    }
  }
  return this;
};
ModelSql.prototype.load_fk = function (fk_name, select_names, ...varargs) {
  const fk = this.model.foreign_keys[fk_name];
  if (fk === undefined) {
    throw new Error(fk_name + (" is not a valid forein key name for " + this.table_name));
  }
  const fk_model = fk.reference;
  const join_key = fk_name + ("__" + fk_model.table_name);
  const join_obj = this._register_join_model({
    join_type: this._join_type || "INNER",
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
  if (Array.isArray(select_names)) {
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
  return Sql.prototype._base_select.call(this, fks);
};

function make_record_meta(model) {
  class RecordMeta extends Object {
    constructor(data) {
      super(data);
      for (const [k, v] of Object.entries(data)) {
        this[k] = v;
      }
      return this;
    }
  }
  Object.defineProperty(this, "name", {
    value: `${model.name}Record`,
  });
  RecordMeta.prototype.delete = async function (key) {
    key = model.check_unique_key(key || model.primary_key);
    if (this[key] === undefined) {
      throw new Error("empty value for delete key:" + key);
    }
    return await model
      .create_sql()
      .delete({ [key]: this[key] })
      .returning(key)
      .exec();
  };
  RecordMeta.prototype.save = async function (names, key) {
    return await model.prototype.save.call(this, names, key);
  };
  RecordMeta.prototype.save_create = async function (names, key) {
    return await model.prototype.save_create.call(this, names, key);
  };
  RecordMeta.prototype.save_update = async function (names, key) {
    return await model.prototype.save_update.call(this, names, key);
  };
  RecordMeta.prototype.validate = async function (names, key) {
    return await model.prototype.validate.call(this, names, key);
  };
  RecordMeta.prototype.validate_update = async function (names) {
    return await model.prototype.validate_update.call(this, names);
  };
  RecordMeta.prototype.validate_create = async function (names) {
    return await model.prototype.validate_create.call(this, names);
  };
  return RecordMeta;
}

function create_model_proxy(Xodel) {
  return new Proxy(Xodel, {
    get(obj, k) {
      const sql_k = ModelSql.prototype[k];
      if (sql_k !== undefined) {
        if (typeof sql_k === "function") {
          return function (...varargs) {
            return sql_k.call(Xodel.create_sql(), ...varargs);
          };
        } else {
          return sql_k;
        }
      }
      if (ModelSql[k] !== undefined) {
        return ModelSql[k];
      }
      const model_k = Xodel.prototype[k];
      if (model_k !== undefined) {
        if (typeof model_k === "function") {
          return function (...varargs) {
            model_k.call(new Xodel(), ...varargs);
          };
        } else {
          return model_k;
        }
      }
      if (Xodel[k] !== undefined) {
        return Xodel[k];
      }
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

class Xodel {
  static ValidateError = ValidateError;
  static ValidateBatchError = ValidateBatchError;
  static Http = Http;
  static _query = default_query;
  static base_model = base_model;
  static DEFAULT_PRIMARY_KEY = DEFAULT_PRIMARY_KEY;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static make_field_from_json = make_field_from_json;
  static token = Sql.token;
  static as_token = Sql.as_token;
  static as_literal = Sql.as_literal;
  static http_model_cache = {};

  static set_class_name(table_name) {
    const class_name = {
      value: `${capitalize(table_name)}Model`,
    };
    Object.defineProperty(this, "name", class_name);
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
  static async create_model_async(options) {
    for (const name of options.field_names || Object.keys(options.fields)) {
      const field = options.fields[name];
      if (field.choices_url) {
        const fetch_choices = async () => {
          const choices_url = options.is_admin_mode
            ? field.choices_url_admin || field.choices_url // 如果不是fk,那么choices_url_admin不会定义
            : field.choices_url;
          const { data: choices } = await this.Http[field.choices_url_method || "post"](choices_url);
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
          this.http_model_cache[model_key] = await Xodel.create_model_async({
            ...field.model,
            is_admin_mode: options.is_admin_mode,
          });
        }
        field.model = this.http_model_cache[model_key];
      }
    }
    return this.create_model(options);
  }
  static async get_http_model(model_key, is_admin_mode) {
    if (!this.http_model_cache[model_key]) {
      const model_url = model_key.match(/^https?:/) || model_key.match(/^\//) ? model_key : `/admin/model/${model_key}`;
      const { data } = await this.Http.get(model_url);
      // is_admin_mode具有传染性
      this.http_model_cache[model_key] = await Xodel.create_model_async({
        ...data,
        is_admin_mode,
      });
    } else {
      console.log("cached:" + model_key);
    }
    return this.http_model_cache[model_key];
  }
}
Xodel.query = async function (statement, compact) {
  return await this._query(statement, compact);
};
Xodel.create_model = function (options) {
  const XodelClass = this._make_model_class(this.normalize(options));
  return create_model_proxy(XodelClass);
};
Xodel.create_sql = function () {
  return ModelSql.new({ model: this, table_name: this.table_name });
};
Xodel.create_sql_as = function (table_name, rows) {
  const alias_sql = ModelSql.new({ model: this, table_name }).as(table_name);
  if (rows) {
    return alias_sql.with_values(table_name, rows);
  } else {
    return alias_sql;
  }
};
Xodel.is_model_class = function (model) {
  return typeof model === "object" && model.__is_model_class__;
};
Xodel.check_field_name = function (name) {
  check_reserved(name);
  if (Object.prototype.hasOwnProperty.call(this, name) || Object.prototype.hasOwnProperty.call(this.prototype, name)) {
    throw new Error(`field name '${name}' conflicts with model class attributes`);
  }
};
Xodel._make_model_class = function (opts) {
  class ModelClass extends this {
    static _query =
      (opts.db_options && Query(opts.db_options)) || (this.db_options && Query(this.db_options)) || this._query;
    static table_name = opts.table_name;
    static admin = opts.admin || {};
    static label = opts.label || opts.table_name;
    static fields = opts.fields;
    static field_names = opts.field_names;
    static mixins = opts.mixins;
    static extends = opts.extends;
    static abstract = opts.abstract;
    static primary_key = opts.primary_key;
    static unique_together = opts.unique_together;
    static disable_auto_primary_key = opts.disable_auto_primary_key == undefined ? true : false;
    constructor(data) {
      super(data);
      return ModelClass.create_record(data);
    }
  }
  let pk_defined = false;
  ModelClass.foreign_keys = {};
  ModelClass.names = [];
  for (const name of ModelClass.field_names) {
    const field = ModelClass.fields[name];
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
  const uniques = [];
  for (const unique_group of ModelClass.unique_together || []) {
    for (const name of unique_group) {
      if (!ModelClass.fields[name]) {
        throw new Error(`invalid unique_together name ${name} for model ${ModelClass.table_name}`);
      }
    }
    uniques.push(clone(unique_group));
  }
  ModelClass.unique_together = uniques;
  ModelClass.__is_model_class__ = true;
  if (ModelClass.table_name) {
    ModelClass.materialize_with_table_name({ table_name: ModelClass.table_name });
  } else {
    ModelClass.set_class_name("Abstract");
  }
  ModelClass.set_label_name_dict();
  ModelClass.ensure_ctime_in_list_names();
  ModelClass.resolve_self_foreignkey();
  return ModelClass;
};
Xodel.normalize = function (options) {
  const _extends = options.extends;
  const model = {
    admin: clone(options.admin || {}),
    table_name: options.table_name || (_extends && _extends.table_name) || undefined,
  };
  model.admin.list_names = clone(model.admin.list_names || []);
  const opts_fields = {};
  const opts_field_names = [];
  for (let [key, field] of Object.entries(options.fields || {})) {
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
    this.check_field_name(name);
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
        throw new Error(`Xodel class '${tname}'s field name '${name}' is not in fields`);
      }
    } else if (!(field instanceof Fields.basefield) && _extends && _extends.fields[name]) {
      const pfield = _extends.fields[name];
      field = dict(pfield.get_options(), field);
      if (pfield.model && field.model) {
        field.model = this.create_model({
          abstract: true,
          extends: pfield.model,
          fields: field.model.fields,
          field_names: field.model.field_names,
        });
      }
    }
    model.fields[name] = make_field_from_json(field, { name });
  }
  for (const [key, value] of Object.entries(options)) {
    if (model[key] === undefined && MODEL_MERGE_NAMES[key]) {
      model[key] = value;
    }
  }
  let unique_together = options.unique_together || [];
  if (typeof unique_together[0] === "string") {
    unique_together = [unique_together];
  }
  model.unique_together = unique_together;
  let abstract;
  if (options.abstract !== undefined) {
    abstract = !!options.abstract;
  } else {
    abstract = model.table_name === undefined;
  }
  model.abstract = abstract;
  model.__normalized__ = true;
  if (options.mixins) {
    const merge_model = this.merge_models([...options.mixins, model]);
    return merge_model;
  } else {
    return model;
  }
};
Xodel.set_label_name_dict = function () {
  this.label_to_name = {};
  this.name_to_label = {};
  for (const [name, field] of Object.entries(this.fields)) {
    this.label_to_name[field.label] = name;
    this.name_to_label[name] = field.label;
  }
};
Xodel.ensure_ctime_in_list_names = function () {
  const admin = this.admin;
  const ctime_name = this.auto_now_add_name;
  if (!admin.list_names || admin.list_names.length === 0) {
    admin.list_names = [...this.names, ctime_name];
  } else if (!admin.list_names.includes(ctime_name)) {
    admin.list_names = [...admin.list_names, ctime_name];
  }
};
Xodel.resolve_self_foreignkey = function () {
  for (const name of this.field_names) {
    const field = this.fields[name];
    let fk_model = field.reference;
    if (fk_model === "self") {
      fk_model = this;
      field.reference = this;
      field.setup_with_fk_model(this);
    }
    if (fk_model) {
      this.foreign_keys[name] = field;
    }
  }
};
Xodel.materialize_with_table_name = function (opts) {
  const table_name = opts.table_name;
  const label = opts.label;
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
    const pk_name = DEFAULT_PRIMARY_KEY;
    this.primary_key = pk_name;
    this.fields[pk_name] = Fields.integer.create_field({
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
  this.RecordClass = make_record_meta(this);
  return this;
};
Xodel.mix_with_base = function (...varargs) {
  return this.mix(base_model, ...varargs);
};
Xodel.mix = function (...varargs) {
  return create_model_proxy(this._make_model_class(this.merge_models([...varargs])));
};
Xodel.merge_models = function (models) {
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
};
Xodel.merge_model = function (a, b) {
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
};
Xodel.merge_field = function (a, b) {
  const aopts = (a instanceof Fields.basefield && a.get_options()) || clone(a);
  const bopts = (b instanceof Fields.basefield && b.get_options()) || clone(b);
  const options = { ...aopts, ...bopts };
  if (aopts.model && bopts.model) {
    options.model = this.merge_model(aopts.model, bopts.model);
  }
  return make_field_from_json(options);
};
Xodel.to_json = function () {
  return {
    table_name: this.table_name,
    primary_key: this.primary_key,
    admin: clone(this.admin),
    unique_together: clone(this.unique_together),
    label: this.label || this.table_name,
    names: clone(this.names),
    field_names: clone(this.field_names),
    label_to_name: clone(this.label_to_name),
    name_to_label: clone(this.name_to_label),
    fields: Object.fromEntries(
      this.field_names.map(function (name) {
        return [name, this.fields[name].json()];
      })
    ),
  };
};
Xodel.all = async function () {
  const records = assert(await this.query("SELECT * FROM " + this.table_name));
  for (let i = 0; i < records.length; i = i + 1) {
    records[i] = this.load(records[i]);
  }
  return records;
};
Xodel.get_or_create = async function (params, defaults, columns) {
  const [values_list, insert_columns] = Sql.prototype._get_insert_values_token.call(this, dict(params, defaults));
  const insert_columns_token = as_token(insert_columns);
  const all_columns_token = unique(as_token([...(columns || [this.primary_key]), ...insert_columns]));
  const insert_sql = `(INSERT INTO ${this.table_name}(${insert_columns_token}) SELECT ${as_literal_without_brackets(
    values_list
  )} WHERE NOT EXISTS (${this.create_sql().select(1).where(params)}) RETURNING ${all_columns_token})`;
  const inserted_set = this.create_sql_as("new_records")
    .with(`new_records(${all_columns_token})`, insert_sql)
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
};
Xodel.save = async function (input, names, key) {
  key = key || this.primary_key;
  // TODO: need check recursive here. lua code: rawget(input, key)
  if (input[key] !== undefined) {
    return await this.save_update(input, names, key);
  } else {
    return await this.save_create(input, names, key);
  }
};
Xodel.check_unique_key = function (key) {
  const pkf = this.fields[key];
  if (!pkf) {
    throw new Error("invalid field name: " + key);
  }
  if (!(pkf.primary_key || pkf.unique)) {
    throw new Error(`field '${key}' is not primary_key or not unique`);
  }
  return key;
};
Xodel.save_create = async function (input, names, key) {
  const data = assert(this.validate_create(input, names));
  const prepared = assert(this.prepare_for_db(data, names));
  const created = await this.create_sql()
    ._base_insert(prepared)
    ._base_returning(key || "*")
    .execr();
  Object.assign(data, created[0]);
  return this.create_record(data);
};
Xodel.save_update = async function (input, names, key) {
  const data = assert(this.validate_update(input, names));
  if (!key) {
    key = this.primary_key;
  } else {
    key = this.check_unique_key(key);
  }
  const look_value = input[key];
  if (look_value === undefined) {
    throw new Error("no primary or unique key value for save_update");
  }
  const prepared = assert(this.prepare_for_db(data, names, true));
  const updated = await this.create_sql()
    ._base_update(prepared)
    .where({ [key]: look_value })
    ._base_returning(key)
    .execr();
  if (updated.length === 1) {
    data[key] = updated[0][key];
    return this.create_record(data);
  } else if (updated.length === 0) {
    throw new Error(`update failed, record does not exist(model:${this.table_name}, key:${key}, value:${look_value})`);
  } else {
    throw new Error(
      `expect 1 but ${updated.length} records are updated(model:${this.table_name}, key:${key}, value:${look_value})`
    );
  }
};
Xodel.prepare_for_db = function (data, columns, is_update) {
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
    prepared[this.auto_now_name] = ngx_localtime();
  }
  return prepared;
};
Xodel.validate = function (input, names, key) {
  if (input[key || this.primary_key] !== undefined) {
    return this.validate_update(input, names);
  } else {
    return this.validate_create(input, names);
  }
};
Xodel.validate_create = function (input, names) {
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
  if (!this.clean) {
    return data;
  } else {
    return this.clean(data);
  }
};
Xodel.validate_update = function (input, names) {
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
          index: error.index,
        });
      }
    }
  }
  if (!this.clean) {
    return data;
  } else {
    return this.clean(data);
  }
};
Xodel.check_upsert_key = function (rows, key) {
  assert(key, "no key for upsert");
  if (rows instanceof Array) {
    if (typeof key === "string") {
      for (const [i, row] of rows.entries()) {
        if (row[key] === undefined || row[key] === "") {
          return this.make_field_error({ name: key, message: key + "不能为空", batch_index: i });
        }
      }
    } else {
      for (const [i, row] of rows.entries()) {
        for (const k of key) {
          if (row[k] === undefined || row[k] === "") {
            return this.make_field_error({ name: k, message: k + "不能为空", batch_index: i });
          }
        }
      }
    }
  } else if (typeof key === "string") {
    if (rows[key] === undefined || rows[key] === "") {
      return this.make_field_error({ name: key, message: key + "不能为空" });
    }
  } else {
    for (const k of key) {
      if (rows[k] === undefined || rows[k] === "") {
        return this.make_field_error({ name: k, message: k + "不能为空" });
      }
    }
  }
  return [rows, key];
};
Xodel.make_field_error = function ({ name, message, index, batch_index }) {
  const field = assert(this.fields[name], "invalid feild name: " + name);
  const err = field.make_error(message, index);
  if (batch_index) {
    err.batch_index = batch_index;
    throw new ValidateBatchError(err);
  } else {
    throw new ValidateError(err);
  }
};
Xodel.parse_error_message = function (err) {
  if (typeof err === "object") {
    return err;
  }
  const captured = /^(?<name>.+?)~(?<message>.+?)$/.exec(err);
  if (!captured) {
    throw new Error("can't parse this model error message: " + err);
  } else {
    const name = captured.name;
    const message = captured.message;
    return this.make_field_error({ name, message });
  }
};
Xodel.load = function (data) {
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
};
Xodel.validate_create_data = function (rows, columns) {
  let cleaned;
  columns = columns || this.names;
  if (rows instanceof Array) {
    cleaned = {};
    for (const [index, row] of rows.entries()) {
      try {
        cleaned[index] = this.validate_create(row, columns);
      } catch (error) {
        if (error instanceof ValidateError) {
          return this.make_field_error({
            ...error,
            batch_index: index,
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
};
Xodel.validate_update_data = function (rows, columns) {
  let cleaned;
  columns = columns || this.names;
  if (rows[0]) {
    cleaned = [];
    for (const [index, row] of rows.entries()) {
      try {
        cleaned[index] = this.validate_update(row, columns);
      } catch (error) {
        if (error instanceof ValidateError) {
          return this.make_field_error({
            ...error,
            batch_index: index,
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
};
Xodel.validate_create_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
  const [cleaned_rows, cleaned_columns] = this.validate_create_data(checked_rows, columns);
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.validate_update_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
  const [cleaned_rows, cleaned_columns] = this.validate_update_data(checked_rows, columns);
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.prepare_db_rows = function (rows, columns, is_update) {
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
            ...error,
            batch_index: i,
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
};
Xodel.is_instance = function (row) {
  return row instanceof Xodel;
};
Xodel.filter = async function (kwargs) {
  return await this.create_sql().where(kwargs).exec();
};
Xodel.filter_with_fk_labels = async function (kwargs) {
  const records = this.create_sql().load_all_fk_labels().where(kwargs);
  return await records.exec();
};
Xodel.create_record = function (data) {
  return new this.RecordClass(data);
};
const whitelist = {
  DEFAULT: true,
  as_token: true,
  as_literal: true,
  __call: true,
  new: true,
  token: true,
};
for (const [k, v] of Object.entries(ModelSql)) {
  if (typeof v === "function" && !whitelist[k]) {
    assert(Xodel[k] === undefined, "same function name appears:" + k);
  }
}
export default Xodel;
