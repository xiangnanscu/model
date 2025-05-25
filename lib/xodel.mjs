/* eslint-disable max-len */
/* eslint-disable no-constant-condition */
import {
  IS_PG_KEYWORDS,
  assert,
  smart_quote,
  as_token,
  as_literal,
  NULL,
  DEFAULT,
  make_token,
  ValidateError,
} from "./utils.mjs";
import Sql from "./sql.mjs";
import Model from "./model.mjs";
import F from "./F.mjs";
import Q from "./Q.mjs";
import { Count, Sum, Avg, Max, Min } from "./Func.mjs";

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

class Xodel extends Model {
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static token = make_token;
  static as_token = as_token;
  static as_literal = as_literal;
  static smart_quote = smart_quote;
  static Q = Q;
  static F = F;
  static Count = Count;
  static Sum = Sum;
  static Avg = Avg;
  static Max = Max;
  static Min = Min;

  static create_sql() {
    return Sql.new({
      model: this,
      table_name: this._table_name_token || smart_quote(this.table_name),
      _as: "T",
    });
  }

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

  static create_record(data) {
    return new this.RecordClass(data);
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

  static transaction(callback) {
    return this.query.transaction(callback);
  }
  static atomic(func) {
    return (request) => Model.transaction(() => func(request));
  }

  static materialize_with_table_name(opts) {
    super.materialize_with_table_name(opts);
    this.RecordClass = make_record_meta(this);
    return this;
  }

  static _make_model_class(opts) {
    const ModelClass = super._make_model_class(opts);
    ModelClass.prototype.constructor = function (data) {
      return ModelClass.create_record(data);
    };
    const proxy = this._create_model_proxy(ModelClass);
    return proxy;
  }

  static check_field_name(name) {
    super.check_field_name(name);
    assert(
      !IS_PG_KEYWORDS[name.toUpperCase()],
      `${name} is a postgresql reserved word, can't be used as a table or column name`,
    );
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
  static _prepare_db_rows(rows, columns) {
    if (rows instanceof Array) {
      const cleaned = [];
      for (const [i, row] of rows.entries()) {
        try {
          cleaned[i] = this._prepare_for_db(row, columns);
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
  static _validate_create_rows(rows, key, columns) {
    this._check_upsert_key_error(rows, key);
    return this._validate_create_data(rows, columns);
  }
  static _validate_update_rows(rows, key, columns) {
    this._check_upsert_key_error(rows, key);
    return this._validate_update_data(rows, columns);
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

export default Xodel;
