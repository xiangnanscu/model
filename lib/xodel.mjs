/* eslint-disable max-len */
/* eslint-disable no-constant-condition */
import postgres from "postgres";
import { SqlModel } from "./sqlmodel.mjs";

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
