/* eslint-disable max-len */
/* eslint-disable no-constant-condition */
import { IS_PG_KEYWORDS, assert, smart_quote } from "./utils.mjs";
import Sql from "./sql.mjs";
import Model from "./model.mjs";
import F from "./F.mjs";

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
