import * as Field from "./field";
import { clone, string_format, assert, next, make_token, NULL, DEFAULT, unique, IS_PG_KEYWORDS } from "./utils";

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

const base_model = {
  abstract: true,
  field_names: [DEFAULT_PRIMARY_KEY, "ctime", "utime"],
  fields: {
    [DEFAULT_PRIMARY_KEY]: { type: "integer", primary_key: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", auto_now_add: true },
    utime: { label: "更新时间", type: "datetime", auto_now: true },
  },
};
function disable_setting_model_attrs(cls, key, value) {
  throw new Error(`modify model class '${cls.table_name}' is not allowed (key: ${key}, value: ${value})`);
}
function dict(t1, t2) {
  const res = clone(t1);
  if (t2) {
    for (const [key, value] of Object.entries(t2)) {
      res[key] = value;
    }
  }
  return res;
}
function check_reserved(name) {
  assert(typeof name === "string", `name must by string, not ${typeof name} (${name})`);
  assert(!name.find("__", 1, true), "don't use __ in a field name");
  assert(!IS_PG_KEYWORDS[name.upper()], `${name} is a postgresql reserved word`);
}
function is_field_class(t) {
  return typeof t === "object" && getmetatable(t) && getmetatable(t).__is_field_class__;
}
const shortcuts_names = ["name", "label", "type", "required"];
function normalize_field_shortcuts(field) {
  field = clone(field);
  for (const [i, prop] of shortcuts_names.entries()) {
    if (field[prop] === undefined && field[i] !== undefined) {
      field[prop] = field[i];
      field[i] = undefined;
    }
  }
  return field;
}
function ensure_field_as_options(field, name) {
  if (is_field_class(field)) {
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
  for (const [_, name] of field_names.entries()) {
    assert(typeof name === "string", `field_names must be string, not ${typeof name}`);
  }
  return array(field_names);
}
function get_foreign_object(attrs, prefix) {
  const fk = [];
  const n = prefix.length;
  for (const [k, v] of Object.entries(attrs)) {
    if (k.sub(1, n) === prefix) {
      fk[k.sub(n + 1)] = v;
      attrs[k] = undefined;
    }
  }
  return fk;
}
function make_field_from_json(json, kwargs) {
  const options = dict(json, kwargs);
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
  const fcls = Field[options.type];
  if (!fcls) {
    throw new Error("invalid field type:" + String(options.type));
  }
  return fcls.create_field(options);
}
function is_sql_instance(row) {
  const meta = getmetatable(row);
  return meta && meta.__SQL_BUILDER__;
}
const as_token = Sql.as_token;
const as_literal = Sql.as_literal;
const as_literal_without_brackets = Sql.as_literal_without_brackets;
const ModelSql = Sql._class([], true);
ModelSql.prototype.increase = function (name, amount) {
  return this.update({ [name]: this.token(`${name} + ${amount || 1}`) });
};
ModelSql.prototype.decrease = function (name, amount) {
  return this.update({ [name]: this.token(`${name} - ${amount || 1}`) });
};
ModelSql.prototype._base_get_multiple = function (keys, columns) {
  if (keys.length === 0) {
    throw new Error("empty keys passed to get_multiple");
  }
  columns = columns || utils.get_keys(keys[0]);
  [keys, columns] = this._get_cte_values_literal(keys, columns, false);
  const join_cond = this._get_join_conditions(columns, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(keys)})`;
  return this.with(cte_name, cte_values).right_join("V", join_cond);
};
ModelSql.prototype._get_cte_values_literal = function (rows, columns, no_check) {
  columns = columns || utils.get_keys(rows);
  rows = this._rows_to_array(rows, columns);
  const first_row = rows[0];
  for (const [i, col] of columns.entries()) {
    const field = this._find_field_model(col);
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
  const res = table_new(n, 0);
  const fields = this.model.fields;
  for (let i = 0; i < n; i = i + 1) {
    res[i] = table_new(c, 0);
  }
  for (const [i, col] of columns.entries()) {
    for (let j = 0; j < n; j = j + 1) {
      const v = rows[j][col];
      if (v !== undefined && v !== "") {
        res[j][i] = v;
      } else if (fields[col]) {
        const _js_default = fields[col]._js_default;
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
  let find = true;
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
    find = false;
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
  return [join_obj, find];
};
ModelSql.prototype._find_field_model = function (col) {
  const field = this.model.fields[col];
  if (field) {
    return [field, this.model, this._as || this.table_name];
  }
  if (!this._join_keys) {
    return;
  }
  for (const [_, join_obj] of Object.entries(this._join_keys)) {
    const fk_field = join_obj.fk_model.fields[col];
    if (fk_field && join_obj.model.table_name === this.table_name) {
      return [fk_field, join_obj.fk_model, join_obj.fk_alias || join_obj.fk_model.table_name];
    }
  }
};
ModelSql.prototype._parse_column = function (key, as_select, strict, disable_alias) {
  let [a, b] = key.find("__", 1, true);
  if (!a) {
    return [this._get_column(key, strict), "eq"];
  }
  let token = key.sub(1, a - 1);
  let [field, model, prefix] = this._find_field_model(token);
  if (!field || !model) {
    throw new Error(`${token} is not a valid field name for ${this.table_name}`);
  }
  let i, fk_model, rc, join_key, is_fk;
  let op;
  let field_name = token;
  while (true) {
    i = b + 1;
    [a, b] = key.find("__", i, true);
    if (!a) {
      token = key.sub(i);
    } else {
      token = key.sub(i, a - 1);
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
        op = token;
        break;
      } else if (token === field.reference_column) {
        break;
      } else {
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
  const [table_name, column] = match(key, "^([\\w_]+).([\\w_]+)$", "josui");
  if (table_name) {
    return key;
  }
  if (this._join_keys) {
    for (const [_, join_obj] of Object.entries(this._join_keys)) {
      if (join_obj.model.table_name === this.table_name && join_obj.fk_model.fields[key]) {
        return join_obj.fk_alias + ("." + key);
      }
    }
  }
  if (strict) {
    throw new Error(`invalid field name: \`${key}\``);
  } else {
    return key;
  }
};
ModelSql.prototype.join = function (join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, "INNER");
  } else if (this.model.foreign_keys[join_args]) {
    const fk = this.model.foreign_keys[join_args];
    this._register_join_model(
      {
        model: this.model,
        column: join_args,
        fk_model: fk.reference,
        fk_column: fk.reference_column,
        fk_alias: fk.reference.table_name,
      },
      "INNER"
    );
  } else {
    Sql.prototype._base_join.call(this, join_args, key, op, val);
  }
  return this;
};
ModelSql.prototype.inner_join = function (join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, "INNER");
  } else {
    Sql.prototype._base_join.call(this, join_args, key, op, val);
  }
  return this;
};
ModelSql.prototype.left_join = function (join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, "LEFT");
  } else {
    Sql.prototype._base_left_join.call(this, join_args, key, op, val);
  }
  return this;
};
ModelSql.prototype.right_join = function (join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, "RIGHT");
  } else {
    Sql.prototype._base_right_join.call(this, join_args, key, op, val);
  }
  return this;
};
ModelSql.prototype.full_join = function (join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._register_join_model(join_args, "FULL");
  } else {
    Sql.prototype._base_full_join.call(this, join_args, key, op, val);
  }
  return this;
};
ModelSql.prototype.insert = function (rows, columns) {
  if (!is_sql_instance(rows)) {
    if (!this._skip_validate) {
      [rows, columns] = this.model.validate_create_data(rows, columns);
      if (rows === undefined) {
        throw new Error(columns);
      }
    }
    [rows, columns] = this.model.prepare_db_rows(rows, columns);
    if (rows === undefined) {
      throw new Error(columns);
    }
    return Sql.prototype._base_insert.call(this, rows, columns);
  } else {
    return Sql.prototype._base_insert.call(this, rows, columns);
  }
};
ModelSql.prototype.update = function (row, columns) {
  if (typeof row === "string") {
    return Sql.prototype._base_update.call(this, row);
  } else if (!is_sql_instance(row)) {
    let err;
    if (!this._skip_validate) {
      [row, err] = this.model.validate_update(row, columns);
      if (row === undefined) {
        throw new Error(err);
      }
    }
    [row, columns] = this.model.prepare_db_rows(row, columns, true);
    if (row === undefined) {
      throw new Error(columns);
    }
    return Sql.prototype._base_update.call(this, row, columns);
  } else {
    return Sql.prototype._base_update.call(this, row, columns);
  }
};
ModelSql.prototype.merge = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
    if (rows === undefined) {
      throw new Error(key);
    }
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  if (rows === undefined) {
    throw new Error(columns);
  }
  return Sql.prototype._base_merge.call(this, rows, key, columns);
};
ModelSql.prototype.upsert = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
    if (rows === undefined) {
      throw new Error(key);
    }
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  if (rows === undefined) {
    throw new Error(columns);
  }
  return Sql.prototype._base_upsert.call(this, rows, key, columns);
};
ModelSql.prototype.updates = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_update_rows(rows, key, columns);
    if (rows === undefined) {
      throw new Error(columns);
    }
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, true);
  if (rows === undefined) {
    throw new Error(columns);
  }
  return Sql.prototype._base_updates.call(this, rows, key, columns);
};
ModelSql.prototype.get_multiple = function (keys, columns) {
  if (this._commit === undefined || this._commit) {
    return Sql.prototype._base_get_multiple.call(this, keys, columns).exec();
  } else {
    return Sql.prototype._base_get_multiple.call(this, keys, columns);
  }
};
ModelSql.prototype.exec_statement = function (statement) {
  const records = assert(this.model.query(statement, this._compact));
  if (this._raw || this._compact || this._update || this._insert || this._delete) {
    if ((this._update || this._insert || this._delete) && this._returning) {
      records.affected_rows = undefined;
    }
    return array.new(records);
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
        for (const [_, name] of field_names.entries()) {
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
    return array.new(records);
  }
};
ModelSql.prototype.exec = function () {
  return this.exec_statement(this.statement());
};
ModelSql.prototype.count = function (cond, op, dval) {
  let res, err;
  if (cond !== undefined) {
    [res, err] = this._base_select("count(*)").where(cond, op, dval).compact().exec();
  } else {
    [res, err] = this._base_select("count(*)").compact().exec();
  }
  if (res === undefined) {
    throw new Error(err);
  } else {
    return res[0][0];
  }
};
ModelSql.prototype.create = function (rows, columns) {
  return this.insert(rows, columns).execr();
};
ModelSql.prototype.exists = function () {
  const statement = `SELECT EXISTS (${this.select(1).limit(1).compact().statement()})`;
  const [res, err] = this.model.query(statement, this._compact);
  if (res === undefined) {
    throw new Error(err);
  } else {
    return res[0][0];
  }
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
ModelSql.prototype.flat = function (col) {
  if (col) {
    return this.returning(col).compact().execr().flat();
  } else {
    return this.compact().execr().flat();
  }
};
ModelSql.prototype.try_get = function (cond, op, dval) {
  let records;
  if (cond !== undefined) {
    if (typeof cond === "object" && next(cond) === undefined) {
      throw new Error("empty condition table is not allowed");
    }
    records = this.where(cond, op, dval).limit(2).exec();
  } else {
    records = this.limit(2).exec();
  }
  if (records.length === 1) {
    return records[0];
  } else {
    throw new Error(records.length);
  }
};
ModelSql.prototype.get = function (cond, op, dval) {
  const [record, record_number] = this.try_get(cond, op, dval);
  if (!record) {
    if (record_number === 0) {
      throw new Error("record not found");
    } else {
      throw new Error("multiple records returned: " + record_number);
    }
  } else {
    return record;
  }
};
ModelSql.prototype.as_set = function () {
  return this.compact().execr().flat().as_set();
};
ModelSql.prototype.execr = function () {
  return this.raw().exec();
};
ModelSql.prototype.load_all_fk_labels = function () {
  for (const [i, name] of this.model.names.entries()) {
    const field = this.model.fields[name];
    if (field && field.type === "foreignkey" && field.reference_label_column) {
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
    this._load_fk = [];
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
    for (const [_, fkn] of select_names.entries()) {
      assert(fk_model.fields[fkn], "invalid field name for fk model: " + fkn);
      res.push(`${right_alias}.${fkn} AS ${fk_name}__${fkn}`);
    }
    fks = res.join(", ");
  } else if (select_names === "*") {
    const res = [];
    for (const [i, fkn] of fk_model.field_names.entries()) {
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
  const RecordMeta = dict(object, []);
  RecordMeta.__index = RecordMeta;
  RecordMeta.prototype.__call = function (data) {
    for (const [k, v] of Object.entries(data)) {
      this[k] = v;
    }
    return this;
  };
  RecordMeta.prototype.delete = function (key) {
    key = model.check_unique_key(key || model.primary_key);
    if (this[key] === undefined) {
      throw new Error("empty value for delete key:" + key);
    }
    return model
      .create_sql()
      .delete({ [key]: this[key] })
      .returning(key)
      .exec();
  };
  RecordMeta.prototype.save = function (names, key) {
    return model.prototype.save.call(this, names, key);
  };
  RecordMeta.prototype.save_create = function (names, key) {
    return model.prototype.save_create.call(this, names, key);
  };
  RecordMeta.prototype.save_update = function (names, key) {
    return model.prototype.save_update.call(this, names, key);
  };
  RecordMeta.prototype.validate = function (names, key) {
    return model.prototype.validate.call(this, names, key);
  };
  RecordMeta.prototype.validate_update = function (names) {
    return model.prototype.validate_update.call(this, names);
  };
  RecordMeta.prototype.validate_create = function (names) {
    return model.prototype.validate_create.call(this, names);
  };
  return RecordMeta;
}
function create_model_proxy(Model) {
  const proxy = { __model__: Model };
  function __index(_, k) {
    const sql_k = ModelSql[k];
    if (sql_k !== undefined) {
      if (typeof sql_k === "function") {
        return function (_, ...varargs) {
          return sql_k(Model.create_sql(), ...varargs);
        };
      } else {
        return sql_k;
      }
    }
    const model_k = Model[k];
    if (model_k !== undefined) {
      if (typeof model_k === "function") {
        return function (cls, ...varargs) {
          if (cls === proxy) {
            return model_k(Model, ...varargs);
          } else {
            throw new Error(`calling model proxy method \`${k}\` with first argument not being itself is not allowed`);
          }
        };
      } else {
        return model_k;
      }
    } else {
      return undefined;
    }
  }
  function __newindex(t, k, v) {
    Model[k] = v;
  }
  return setmetatable(proxy, {
    __call: Model.create_record,
    __index,
    __newindex,
  });
}
const Xodel = {
  __SQL_BUILDER__: true,
  _query: default_query,
  DEFAULT_PRIMARY_KEY,
  NULL,
  make_field_from_json,
  token: Sql.token,
  DEFAULT: Sql.DEFAULT,
  as_token: Sql.as_token,
  as_literal: Sql.as_literal,
};
setmetatable(Xodel, {
  __call(t, ...varargs) {
    return t.mix_with_base(...varargs);
  },
});
Xodel.__index = Xodel;
Xodel.query = function (statement, compact) {
  return this._query(statement, compact);
};
Xodel.new = function (self) {
  return setmetatable(self || [], this);
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
Xodel.normalize = function (options) {
  const _extends = options._extends;
  const model = {
    admin: clone(options.admin || []),
    table_name: options.table_name || (_extends && _extends.table_name) || undefined,
  };
  model.admin.list_names = array(clone(model.admin.list_names || []));
  const opts_fields = [];
  const opts_field_names = array([]);
  for (let [i, field] of options.entries()) {
    field = ensure_field_as_options(field);
    opts_field_names.push(field.name);
    opts_fields[field.name] = field;
  }
  for (let [key, field] of Object.entries(options.fields || [])) {
    if (typeof key === "string") {
      field = ensure_field_as_options(field, key);
      opts_field_names.push(key);
      opts_fields[key] = field;
    } else {
      field = ensure_field_as_options(field);
      opts_field_names.push(field.name);
      opts_fields[field.name] = field;
    }
  }
  let opts_names = options.field_names;
  if (!opts_names) {
    if (_extends) {
      opts_names = array.concat(_extends.field_names, opts_field_names).uniq();
    } else {
      opts_names = opts_field_names.uniq();
    }
  }
  model.field_names = normalize_field_names(clone(opts_names));
  model.fields = [];
  for (const [_, name] of model.field_names.entries()) {
    check_reserved(name);
    if (this[name]) {
      throw new Error(`field name '${name}' conflicts with model class attributes`);
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
      field = dict(pfield.get_options(), field);
      if (pfield.model && field.model) {
        field.model = this.create_model({
          abstract: true,
          _extends: pfield.model,
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
  this.label_to_name = [];
  this.name_to_label = [];
  for (const [name, field] of Object.entries(this.fields)) {
    this.label_to_name[field.label] = name;
    this.name_to_label[name] = field.label;
  }
};
Xodel._make_model_class = function (opts) {
  const model = dict.call(this, {
    _query: (opts.db_options && Query(opts.db_options)) || (this.db_options && Query(this.db_options)) || this._query,
    table_name: opts.table_name,
    admin: opts.admin || [],
    label: opts.label || opts.table_name,
    fields: opts.fields,
    field_names: opts.field_names,
    mixins: opts.mixins,
    _extends: opts._extends,
    abstract: opts.abstract,
    primary_key: opts.primary_key,
    unique_together: opts.unique_together,
    disable_auto_primary_key: opts.disable_auto_primary_key,
  });
  model.__index = model;
  let pk_defined = false;
  model.foreign_keys = [];
  model.names = array([]);
  for (const [i, name] of Object.entries(model.field_names)) {
    const field = model.fields[name];
    if (field.primary_key) {
      const pk_name = field.name;
      assert(!pk_defined, `duplicated primary key: "${pk_name}" and "${pk_defined}"`);
      pk_defined = pk_name;
      model.primary_key = pk_name;
    } else if (field.auto_now) {
      model.auto_now_name = field.name;
    } else if (field.auto_now_add) {
      model.auto_now_add_name = field.name;
    } else {
      model.names.push(name);
    }
  }
  const uniques = array([]);
  for (const [i, unique_group] of (model.unique_together || []).entries()) {
    for (const [i, name] of unique_group.entries()) {
      if (!model.fields[name]) {
        throw new Error(`invalid unique_together name ${name} for model ${model.table_name}`);
      }
    }
    uniques.push(array(clone(unique_group)));
  }
  model.unique_together = uniques;
  model.__is_model_class__ = true;
  if (model.table_name) {
    model.materialize_with_table_name({ table_name: model.table_name });
    model.set_label_name_dict();
    setmetatable(model, {
      __call: model.create_record,
      __newindex: disable_setting_model_attrs,
    });
  } else {
    model.set_label_name_dict();
  }
  const admin = model.admin;
  const ctime_name = model.auto_now_add_name;
  if (!admin.list_names || admin.list_names.length === 0) {
    admin.list_names = model.names + array([ctime_name]);
  } else if (!admin.list_names.includes(ctime_name)) {
    admin.list_names = admin.list_names + array([ctime_name]);
  }
  for (const [i, name] of Object.entries(model.field_names)) {
    const field = model.fields[name];
    let fk_model = field.reference;
    if (fk_model === "self") {
      fk_model = model;
      field.reference = model;
      field.setup_with_fk_model(model);
    }
    if (fk_model) {
      model.foreign_keys[name] = field;
    }
  }
  return model;
};
Xodel.materialize_with_table_name = function (opts) {
  const table_name = opts.table_name;
  const label = opts.label;
  if (!table_name) {
    const names_hint = (this.field_names && this.field_names.join(",")) || "no field_names";
    throw new Error(`you must define table_name for a non-abstract model (${names_hint})`);
  }
  check_reserved(table_name);
  this.table_name = table_name;
  this.label = this.label || label || table_name;
  this.abstract = false;
  if (!this.primary_key && !this.disable_auto_primary_key) {
    const pk_name = DEFAULT_PRIMARY_KEY;
    this.primary_key = pk_name;
    this.fields[pk_name] = Field.integer({
      name: pk_name,
      primary_key: true,
      serial: true,
    });
    this.field_names.unshift(pk_name);
  }
  this.name_cache = [];
  for (const [name, field] of Object.entries(this.fields)) {
    this.name_cache[name] = this.table_name + ("." + name);
    if (field.reference) {
      field.table_name = table_name;
    }
  }
  this.RecordClass = make_record_meta.call(this);
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
  const C = [];
  const field_names = (A.field_names + B.field_names).uniq();
  const fields = [];
  for (const [i, name] of field_names.entries()) {
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
  for (const [i, M] of [A, B].entries()) {
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
  const aopts = (a.__is_field_class__ && a.get_options()) || clone(a);
  const bopts = (b.__is_field_class__ && b.get_options()) || clone(b);
  const options = dict(aopts, bopts);
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
    fields: object.from_entries(
      this.field_names.map(function (name) {
        return [name, this.fields[name].json()];
      })
    ),
  };
};
Xodel.to_camel_json = function () {
  const res = [];
  const model_json = this.to_json();
  for (const [key, value] of Object.entries(model_json)) {
    res[utils.snake_to_camel(key)] = value;
  }
  res.admin = {
    formNames: res.admin.form_names,
    listNames: res.admin.list_names,
  };
  for (const [key, field] of Object.entries(res.fields)) {
    for (const [i, name] of this.fields[key].option_names.entries()) {
      if (field[name] !== undefined) {
        const ckey = utils.snake_to_camel(name);
        field[ckey] = field[name];
        if (ckey !== name) {
          field[name] = undefined;
        }
      }
    }
    field.type = utils.snake_to_camel(field.type);
    if (field.type === "array") {
      field.arrayType = utils.snake_to_camel(field.arrayType || "");
    }
  }
  return res;
};
Xodel.all = function () {
  const records = assert(this.query("SELECT * FROM " + this.table_name));
  for (let i = 0; i < records.length; i = i + 1) {
    records[i] = this.load(records[i]);
  }
  return setmetatable(records, array);
};
Xodel.get_or_create = function (params, defaults, columns) {
  const [values_list, insert_columns] = Sql._get_insert_values_token(dict(params, defaults));
  const insert_columns_token = as_token(insert_columns);
  const all_columns_token = as_token(utils.list(columns || [this.primary_key], insert_columns).uniq());
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
  const records = inserted_set.union_all(selected_set).exec();
  if (records.length > 1) {
    throw new Error("multiple records returned");
  }
  const ins = records[0];
  const created = ins.__is_inserted__;
  ins.__is_inserted__ = undefined;
  return [ins, created];
};
Xodel.save = function (input, names, key) {
  key = key || this.primary_key;
  if (rawget(input, key) !== undefined) {
    return this.save_update(input, names, key);
  } else {
    return this.save_create(input, names, key);
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
Xodel.save_create = function (input, names, key) {
  const data = assert(this.validate_create(input, names));
  const prepared = assert(this.prepare_for_db(data, names));
  key = key || this.primary_key;
  const created = this.create_sql()._base_insert(prepared)._base_returning("*").execr();
  utils.dict_update(data, created[0]);
  return this.create_record(data);
};
Xodel.save_update = function (input, names, key) {
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
  const updated = this.create_sql()
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
  const prepared = [];
  for (const [_, name] of (columns || this.names).entries()) {
    const field = this.fields[name];
    if (!field) {
      throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
    }
    const value = data[name];
    if (field.prepare_for_db && value !== undefined) {
      const [val, err] = field.prepare_for_db(value, data);
      if (val === undefined && err) {
        throw new Error(this.make_field_error(name, err));
      } else {
        prepared[name] = val;
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
  if (rawget(input, key || this.primary_key) !== undefined) {
    return this.validate_update(input, names);
  } else {
    return this.validate_create(input, names);
  }
};
Xodel.validate_create = function (input, names) {
  const data = [];
  for (const [_, name] of (names || this.names).entries()) {
    const field = this.fields[name];
    if (!field) {
      throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
    }
    let [value, err, index] = field.validate(rawget(input, name), input);
    if (err !== undefined) {
      throw new Error(this.make_field_error(name, err, index));
    } else if (field._js_default && (value === undefined || value === "")) {
      if (typeof field._js_default !== "function") {
        value = field._js_default;
      } else {
        [value, err] = field._js_default(input);
        if (value === undefined) {
          throw new Error(this.make_field_error(name, err, index));
        }
      }
    }
    data[name] = value;
  }
  if (!this.clean) {
    return data;
  } else {
    const [res, clean_err] = this.clean(data);
    if (res === undefined) {
      throw new Error(this.parse_error_message(clean_err));
    } else {
      return res;
    }
  }
};
Xodel.validate_update = function (input, names) {
  const data = [];
  for (const [_, name] of (names || this.names).entries()) {
    const field = this.fields[name];
    if (!field) {
      throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
    }
    let err, index;
    let value = rawget(input, name);
    if (value !== undefined) {
      [value, err, index] = field.validate(value, input);
      if (err !== undefined) {
        throw new Error(this.make_field_error(name, err, index));
      } else if (value === undefined) {
        data[name] = "";
      } else {
        data[name] = value;
      }
    }
  }
  if (!this.clean) {
    return data;
  } else {
    const [res, clean_err] = this.clean(data);
    if (res === undefined) {
      throw new Error(this.parse_error_message(clean_err));
    } else {
      return res;
    }
  }
};
Xodel.check_upsert_key = function (rows, key) {
  assert(key, "no key for upsert");
  if (rows[0]) {
    if (typeof key === "string") {
      for (const [i, row] of rows.entries()) {
        if (row[key] === undefined || row[key] === "") {
          const err = this.make_field_error(key, key + "不能为空");
          err.batch_index = i;
          throw new Error(err);
        }
      }
    } else {
      for (const [i, row] of rows.entries()) {
        for (const [_, k] of key.entries()) {
          if (row[k] === undefined || row[k] === "") {
            const err = this.make_field_error(k, k + "不能为空");
            err.batch_index = i;
            throw new Error(err);
          }
        }
      }
    }
  } else if (typeof key === "string") {
    if (rows[key] === undefined || rows[key] === "") {
      throw new Error(this.make_field_error(key, key + "不能为空"));
    }
  } else {
    for (const [_, k] of key.entries()) {
      if (rows[k] === undefined || rows[k] === "") {
        throw new Error(this.make_field_error(k, k + "不能为空"));
      }
    }
  }
  return [rows, key];
};
Xodel.make_field_error = function (name, err, index) {
  const field = assert(this.fields[name], "invalid feild name: " + name);
  return field.make_error(err, index);
};
Xodel.parse_error_message = function (err) {
  if (typeof err === "object") {
    return err;
  }
  const captured = match(err, "^(?<name>.+?)~(?<message>.+?)$", "josui");
  if (!captured) {
    throw new Error("can't parse this model error message: " + err);
  } else {
    const name = captured.name;
    const message = captured.message;
    return this.make_field_error(name, message);
  }
};
Xodel.load = function (data) {
  for (const [_, name] of this.names.entries()) {
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
  let err_obj, cleaned;
  columns = columns || this.names;
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, err_obj] = this.validate_create(row, columns);
      if (row === undefined) {
        err_obj.batch_index = i;
        throw new Error(err_obj);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, err_obj] = this.validate_create(rows, columns);
    if (err_obj) {
      throw new Error(err_obj);
    }
  }
  return [cleaned, columns];
};
Xodel.validate_update_data = function (rows, columns) {
  let err_obj, cleaned;
  columns = columns || this.names;
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, err_obj] = this.validate_update(row, columns);
      if (row === undefined) {
        err_obj.batch_index = i;
        throw new Error(err_obj);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, err_obj] = this.validate_update(rows, columns);
    if (err_obj) {
      throw new Error(err_obj);
    }
  }
  return [cleaned, columns];
};
Xodel.validate_create_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
  if (checked_rows === undefined) {
    throw new Error(checked_key);
  }
  const [cleaned_rows, cleaned_columns] = this.validate_create_data(checked_rows, columns);
  if (cleaned_rows === undefined) {
    throw new Error(cleaned_columns);
  }
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.validate_update_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key || this.primary_key);
  if (checked_rows === undefined) {
    throw new Error(checked_key);
  }
  const [cleaned_rows, cleaned_columns] = this.validate_update_data(checked_rows, columns);
  if (cleaned_rows === undefined) {
    throw new Error(cleaned_columns);
  }
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.prepare_db_rows = function (rows, columns, is_update) {
  let err, cleaned;
  columns = columns || utils.get_keys(rows);
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, err] = this.prepare_for_db(row, columns, is_update);
      if (err !== undefined) {
        err.index = i;
        throw new Error(err);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, err] = this.prepare_for_db(rows, columns, is_update);
    if (err !== undefined) {
      throw new Error(err);
    }
  }
  if (is_update) {
    const utime = this.auto_now_name;
    if (utime && !array(columns).includes(utime)) {
      columns.push(utime);
    }
    return [cleaned, columns];
  } else {
    return [cleaned, columns];
  }
};
Xodel.is_instance = function (row) {
  return is_sql_instance(row);
};
Xodel.filter = function (kwargs) {
  return this.create_sql().where(kwargs).exec();
};
Xodel.filter_with_fk_labels = function (kwargs) {
  const records = this.create_sql().load_all_fk_labels().where(kwargs);
  return records.exec();
};
Xodel.create_record = function (data) {
  return setmetatable(data, this.RecordClass);
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
