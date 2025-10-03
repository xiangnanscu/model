/* eslint-disable max-len */
/* eslint-disable no-constant-condition */
import postgres from "postgres";
import { SqlModel } from "./sqlmodel.mjs";

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

class Xodel extends SqlModel {
  static _driver = postgres({
    host: process.env.PGHOST || "localhost",
    port: process.env.PGPORT || "5432",
    database: process.env.PGDATABASE || "test",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    max: process.env.PG_MAX || 20,
    idle_timeout: process.env.PG_IDLE_TIMEOUT || 20,
    connect_timeout: process.env.PG_CONNECT_TIMEOUT || 3,
  });

  static materialize_with_table_name(opts) {
    super.materialize_with_table_name(opts);
    this.RecordClass = make_record_meta(this);
    return this;
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
      ._base_returning(key)
      ._base_returning(names_without_tablefield);
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
    const ins = await updated_sql.exec();
    if (ins.length === 0) {
      throw new Error("no record updated");
    }
    return ins[0];
  }

  static async query(statement, options = {}) {
    const result = await this._driver.unsafe(statement, options);
    if (options.compact) {
      for (let i = 0; i < result.length; i++) {
        result[i] = Object.values(result[i]);
      }
      return result;
    } else {
      return result;
    }
  }
  static transaction(callback) {
    return this.query.transaction(callback);
  }
  static atomic(func) {
    return (request) => Model.transaction(() => func(request));
  }
  static _make_model_class(opts) {
    const proxy = super._make_model_class(opts);
    proxy.prototype.constructor = function (data) {
      return proxy.create_record(data);
    };
    const dbc = opts.db_config || this.db_config;
    if (dbc) {
      proxy._driver = postgres({
        host: dbc.host || "localhost",
        port: dbc.port || "5432",
        database: dbc.database || "test",
        user: dbc.user || "postgres",
        password: dbc.password || "postgres",
        max: dbc.max || 20,
        idle_timeout: dbc.idle_timeout || 20,
        connect_timeout: dbc.connect_timeout || 3,
      });
    }

    return proxy;
  }
}

const XodelProxy = new Proxy(Xodel, {
  apply(target, thisArg, argumentsList) {
    return target.create_model(...argumentsList);
  },
});

export default XodelProxy;
export { Xodel };
