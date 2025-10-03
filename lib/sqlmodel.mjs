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
} from "./utils.mjs";
import Sql from "./sql.mjs";
import Model from "./model.mjs";
import F from "./F.mjs";
import Q from "./Q.mjs";
import { Count, Sum, Avg, Max, Min } from "./Func.mjs";

class SqlModel extends Model {
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
    assert(SqlModel[k] === undefined, `Xodel.${k} can't be defined as Sql.${k} already exists`);
  }
}

export default new Proxy(SqlModel, {
  apply(target, thisArg, argumentsList) {
    return target.create_model(...argumentsList);
  },
});

export { SqlModel };
