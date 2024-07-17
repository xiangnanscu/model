// ([a-z])([A-Z]) => $1_\L$2
// \[_, (\w+)\] of ([\w.]+)\.entries\(\) => $1 of $2
// rows[0] 替换为Array.isArray(rows)
// is_sql_instance\((\w+)\) => $1 instanceof Sql
// foo.bar = undefined => delete foo.bar
// table_new(n, 0); =>  new Array(n);
// key:find("__", 1, true) => key.indexOf("__")
// key:sub => key.slice
// key:gsub => key.replaceAll
// _find_field_model的结果要用[field]解构
// _get_expr_token接收_parse_column返回值时要用...
// foo = [] 要注意是否应该为 foo = {}, 如get_keys
// match(key, ...) => key.match
// lua循环起始值为2时js的处理, 例如:parse_where_exp
// lua: type(obj)=='table', js要考虑是不是Array.isArray(obj)
import * as Fields from "./field.mjs";
import {
  clone,
  assert,
  next,
  NULL,
  DEFAULT,
  unique,
  dict,
  capitalize,
  getenv,
  ngx_localtime,
  IS_PG_KEYWORDS,
  string_format,
  make_token,
  _prefix_with_V,
} from "./utils.mjs";

const PG_SET_MAP = {
  _union: "UNION",
  _union_all: "UNION ALL",
  _except: "EXCEPT",
  _except_all: "EXCEPT ALL",
  _intersect: "INTERSECT",
  _intersect_all: "INTERSECT ALL",
};
const COMPARE_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  ne: "<>",
  eq: "=",
};
function get_keys(rows) {
  const columns = [];
  for (const k of Object.keys(rows[0] || rows)) {
    columns.push(k);
  }
  return columns;
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
function _escape_factory(is_literal, is_bracket) {
  function as_sql_token(value) {
    const value_type = typeof value;
    if ("string" === value_type) {
      if (is_literal) {
        return "'" + value.replaceAll("'", "''") + "'";
      } else {
        return value;
      }
    } else if ("number" === value_type || "bigint" === value_type) {
      return String(value);
    } else if ("boolean" === value_type) {
      return (value && "TRUE") || "FALSE";
    } else if ("symbol" === value_type) {
      return value.description || String(value).slice(7, -1);
    } else if ("function" === value_type) {
      return value();
    } else if (value instanceof Sql) {
      return "(" + value.statement() + ")";
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error("empty array as Sql value is not allowed");
      }
      const token = value.map(as_sql_token).join(", ");
      if (is_bracket) {
        return "(" + token + ")";
      } else {
        return token;
      }
    } else if (NULL === value) {
      return "NULL";
    } else {
      throw new Error(`don't know how to escape value: ${value} (${value_type})`);
    }
  }
  return as_sql_token;
}
const as_literal = _escape_factory(true, true);
const as_literal_without_brackets = _escape_factory(true, false);
const as_token = _escape_factory(false, false);
function get_list_tokens(a, b, ...varargs) {
  if (b === undefined) {
    return as_token(a);
  } else {
    const res = [];
    for (const name of [a, b, ...varargs]) {
      res.push(as_token(name));
    }
    return res.join(", ");
  }
}
function _get_join_expr(key, op, val) {
  if (op === undefined) {
    return key;
  } else if (val === undefined) {
    return `${key} = ${op}`;
  } else {
    return `${key} ${op} ${val}`;
  }
}
function _get_join_token(join_type, right_table, key, op, val) {
  if (key !== undefined) {
    return `${join_type} JOIN ${right_table} ON (${_get_join_expr(key, op, val)})`;
  } else {
    return `${join_type} JOIN ${right_table}`;
  }
}
function get_join_table_condition(opts, key) {
  let from, where;
  let froms = [];
  if (opts[key]) {
    froms = [opts[key]];
  } else {
    froms = [];
  }
  let wheres;
  if (opts.where) {
    wheres = [opts.where];
  } else {
    wheres = [];
  }
  if (opts.join_args) {
    for (const [i, args] of opts.join_args.entries()) {
      if (i === 0) {
        froms.push(args[1]);
        wheres.push(args[2]);
      } else {
        froms.push(`${args[0]} JOIN ${args[1]} ON (${args[2]})`);
      }
    }
  }
  if (froms.length > 0) {
    from = froms.join(" ");
  }
  if (wheres.length === 1) {
    where = wheres[0];
  } else if (wheres.length > 1) {
    where = "(" + (wheres.join(") AND (") + ")");
  }
  return [from, where];
}
function get_join_table_condition_select(opts, init_from) {
  const froms = [init_from];
  if (opts.join_args) {
    for (const args of opts.join_args) {
      froms.push(`${args[0]} JOIN ${args[1]} ON (${args[2]})`);
    }
  }
  return froms.join(" ");
}
function assemble_sql(opts) {
  let statement;
  if (opts.update) {
    const [from, where] = get_join_table_condition(opts, "from");
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    const table_name = (opts.as && opts.table_name + (" " + opts.as)) || opts.table_name;
    statement = `UPDATE ${table_name} SET ${opts.update}${(from && " FROM " + from) || ""}${
      (where && " WHERE " + where) || ""
    }${returning}`;
  } else if (opts.insert) {
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    const table_name = (opts.as && opts.table_name + (" AS " + opts.as)) || opts.table_name;
    statement = `INSERT INTO ${table_name} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    const [using, where] = get_join_table_condition(opts, "using");
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    const table_name = (opts.as && opts.table_name + (" " + opts.as)) || opts.table_name;
    statement = `DELETE FROM ${table_name}${(using && " USING " + using) || ""}${
      (where && " WHERE " + where) || ""
    }${returning}`;
  } else {
    let from = opts.from || (opts.as && opts.table_name + (" " + opts.as)) || opts.table_name;
    from = get_join_table_condition_select(opts, from);
    const where = (opts.where && " WHERE " + opts.where) || "";
    const group = (opts.group && " GROUP BY " + opts.group) || "";
    const having = (opts.having && " HAVING " + opts.having) || "";
    const order = (opts.order && " ORDER BY " + opts.order) || "";
    const limit = (opts.limit && " LIMIT " + opts.limit) || "";
    const offset = (opts.offset && " OFFSET " + opts.offset) || "";
    const distinct = (opts.distinct && "DISTINCT ") || (opts.distinct_on && `DISTINCT ON(${opts.distinct_on}) `) || "";
    const select = opts.select || "*";
    statement = `SELECT ${distinct}${select} FROM ${from}${where}${group}${having}${order}${limit}${offset}`;
  }
  if (opts.with) {
    return `WITH ${opts.with} ${statement}`;
  } else if (opts.with_recursive) {
    return `WITH RECURSIVE ${opts.with_recursive} ${statement}`;
  } else {
    return statement;
  }
}

class Sql {
  static new(args) {
    if (typeof args === "string") {
      return new this({ table_name: args });
    } else {
      return new this(args);
    }
  }
  constructor(attrs) {
    Object.assign(this, attrs);
  }
  toString() {
    return this.statement();
  }
}
Sql.prototype._keep_args = function (method_name, ...varargs) {
  if (this[method_name]) {
    this[method_name] = [this[method_name], ...varargs];
  } else {
    this[method_name] = [...varargs];
  }
  return this;
};
Sql.prototype._base_insert = function (rows, columns) {
  if (typeof rows === "object") {
    if (rows instanceof Sql) {
      if (rows._returning_args) {
        this._set_cud_subquery_insert_token(rows, columns);
      } else if (rows._select_args) {
        this._set_select_subquery_insert_token(rows, columns);
      } else {
        throw new Error("select or returning args should be provided when inserting from a sub query");
      }
    } else if (rows instanceof Array) {
      this._insert = this._get_bulk_insert_token(rows, columns);
    } else if (next(rows) !== undefined) {
      this._insert = this._get_insert_token(rows, columns);
    } else {
      throw new Error("empty table can't used as insert data");
    }
  } else if (typeof rows === "string") {
    this._insert = rows;
  } else {
    throw new Error("invalid rows type:" + typeof rows);
  }
  return this;
};
Sql.prototype._base_update = function (row, columns) {
  if (typeof row === "object") {
    if (row instanceof Sql) {
      this._update = this._base_get_update_query_token(row, columns);
    } else {
      this._update = this._get_update_token(row, columns);
    }
  } else {
    this._update = row;
  }
  return this;
};
Sql.prototype._base_join_raw = function (join_type, right_table, key, op, val) {
  const join_token = _get_join_token(join_type, right_table, key, op, val);
  this._from = `${this._from || this.get_table()} ${join_token}`;
  return this;
};
Sql.prototype._base_select = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (s === "") {
  } else if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype._base_merge = function (rows, key, columns) {
  [rows, columns] = this._get_cte_values_literal(rows, columns, false);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(rows)})`;
  const join_cond = this._get_join_condition_from_key(key, "V", "W");
  const vals_columns = columns.map(_prefix_with_V);
  const insert_subquery = Sql.new({ table_name: "V" })
    ._base_select(vals_columns)
    ._keep_args("_select_args", vals_columns)
    ._base_join_raw("LEFT", "U AS W", join_cond)
    ._base_where_null("W." + (Array.isArray(key) ? key[0] : key));
  let updated_subquery;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    updated_subquery = Sql.new({ table_name: "V" })
      ._base_select(vals_columns)
      ._base_join_raw("INNER", this.table_name + " AS W", join_cond)
      ._base_returning(vals_columns);
  } else {
    updated_subquery = Sql.new({ table_name: this.table_name, _as: "W" })
      ._base_update(this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond)
      ._base_returning(vals_columns);
  }
  this.with(cte_name, cte_values).with("U", updated_subquery);
  return Sql.prototype._base_insert.call(this, insert_subquery, columns);
};
Sql.prototype._base_upsert = function (rows, key, columns) {
  assert(key, "you must provide key (string or table) for upsert");
  if (rows instanceof Sql) {
    assert(columns !== undefined, "you must specify columns when use subquery as values of upsert");
    this._insert = this._get_upsert_query_token(rows, key, columns);
  } else if (Array.isArray(rows)) {
    this._insert = this._get_bulk_upsert_token(rows, key, columns);
  } else {
    this._insert = this._get_upsert_token(rows, key, columns);
  }
  return this;
};
Sql.prototype._base_updates = function (rows, key, columns) {
  if (rows instanceof Sql) {
    columns = columns || rows._returning_args.flat();
    const cte_name = `V(${columns.join(", ")})`;
    const join_cond = this._get_join_condition_from_key(key, "V", this._as || this.table_name);
    this.with(cte_name, rows);
    return Sql.prototype._base_update
      .call(this, this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond);
  } else if (rows.length === 0) {
    throw new Error("empty rows passed to updates");
  } else {
    [rows, columns] = this._get_cte_values_literal(rows, columns, false);
    const cte_name = `V(${columns.join(", ")})`;
    const cte_values = `(VALUES ${as_token(rows)})`;
    const join_cond = this._get_join_condition_from_key(key, "V", this._as || this.table_name);
    this.with(cte_name, cte_values);
    return Sql.prototype._base_update
      .call(this, this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond);
  }
};
Sql.prototype._base_returning = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (s === "") {
  } else if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  this._keep_args("_returning_args", ...varargs);
  return this;
};
Sql.prototype._base_from = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (s === "") {
  } else if (!this._from) {
    this._from = s;
  } else {
    this._from = this._from + (", " + s);
  }
  return this;
};
Sql.prototype._base_using = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (s === "") {
  } else if (!this._using) {
    this._using = s;
  } else {
    this._using = this._using + (", " + s);
  }
  return this;
};
Sql.prototype._create_join_proxy = function (model, alias) {
  return new Proxy(
    {},
    {
      get(obj, key) {
        const field = model.fields[key];
        if (field) {
          return alias + ("." + key);
        }
      },
      // set(obj, prop, value) {},
    },
  );
};
Sql.prototype._ensure_context = function () {
  if (!this._join_proxy_models) {
    const alias = this._as || this.table_name;
    const main_proxy = this._create_join_proxy(this.model, alias);
    this._join_proxy_models = [main_proxy];
    this._join_alias = [alias];
    this._join_models = [this.model];
  }
};
Sql.prototype._create_context = function () {
  this._ensure_context();
  const context = [...this._join_proxy_models];
  for (const [i, proxy] of this._join_proxy_models.entries()) {
    context[this._join_models[i].table_name] = proxy;
    context[this._join_models[i].class_name || ""] = proxy;
  }
  return context;
};
Sql.prototype._handle_manual_join = function (join_type, fk_models, callback, join_key) {
  this._ensure_context();
  if (!this._join_args) {
    this._join_args = [];
  }
  if (!this._join_keys) {
    this._join_keys = {};
  }
  const offset = this._join_proxy_models.length;
  for (const fk_model of fk_models) {
    const right_alias = "T" + this._join_models.length;
    const proxy = this._create_join_proxy(fk_model, right_alias);
    this._join_proxy_models.push(proxy);
    this._join_alias.push(right_alias);
    this._join_models.push(fk_model);
    this._join_keys[join_key || right_alias] = right_alias;
  }
  let join_conds = callback(this._create_context());
  if (typeof join_conds === "string") {
    join_conds = [join_conds];
  }
  for (const [i, fk_model] of fk_models.entries()) {
    const right_alias_declare = fk_model.table_name + " " + this._join_alias[offset];
    this._join_args.push([join_type, right_alias_declare, join_conds[i]]);
  }
  return this._join_alias[this._join_alias.length - 1];
};
Sql.prototype._base_join = function (join_type, join_args, ...varargs) {
  // TODO
  if (typeof join_args === "object") {
    if (join_args instanceof Xodel) {
      const fk_models = [];
      const res = [join_args, ...varargs];
      let callback;
      for (const [i, a] of res.entries()) {
        if (i === res.length) {
          callback = a;
        } else {
          fk_models.push(a);
        }
      }
      this._handle_manual_join(join_type, fk_models, callback);
      return this;
    } else {
      throw new Error("invalid argument, it must be a pair: { model_class, condition_callback }");
    }
  } else {
    const fk = this.model.foreign_keys[join_args];
    if (fk) {
      return this._base_join(
        "INNER",
        fk.reference,
        (ctx) => `${ctx[this.model.table_name][join_args]} = ${ctx[fk.reference.table_name][fk.reference_column]}`,
      );
    } else {
      return this._base_join_raw(join_type, join_args, ...varargs);
    }
  }
};
Sql.prototype._base_where = function (cond, op, dval) {
  const where_token = this._base_get_condition_token(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype._base_get_condition_token = function (cond, op, dval) {
  if (op === undefined) {
    const argtype = typeof cond;
    if (argtype === "object") {
      return Sql.prototype._base_get_condition_token_from_table.call(this, cond);
    } else if (argtype === "string") {
      return cond;
    } else if (argtype === "function") {
      return cond(this._create_context());
    } else {
      throw new Error("invalid condition type: " + argtype);
    }
  } else if (dval === undefined) {
    return `${cond} = ${as_literal(op)}`;
  } else {
    return `${cond} ${op} ${as_literal(dval)}`;
  }
};
Sql.prototype._base_get_condition_token_from_table = function (kwargs, logic) {
  const tokens = [];
  for (const [k, value] of Object.entries(kwargs)) {
    tokens.push(`${k} = ${as_literal(value)}`);
  }
  if (logic === undefined) {
    return tokens.join(" AND ");
  } else {
    return tokens.join(" " + logic + " ");
  }
};
Sql.prototype._base_where_in = function (cols, range) {
  const in_token = this._get_in_token(cols, range);
  if (this._where) {
    this._where = `(${this._where}) AND ${in_token}`;
  } else {
    this._where = in_token;
  }
  return this;
};
Sql.prototype._base_where_not_in = function (cols, range) {
  const not_in_token = this._get_in_token(cols, range, "NOT IN");
  if (this._where) {
    this._where = `(${this._where}) AND ${not_in_token}`;
  } else {
    this._where = not_in_token;
  }
  return this;
};
Sql.prototype._base_where_null = function (col) {
  if (this._where) {
    this._where = `(${this._where}) AND ${col} IS NULL`;
  } else {
    this._where = col + " IS NULL";
  }
  return this;
};
Sql.prototype._base_where_not_null = function (col) {
  if (this._where) {
    this._where = `(${this._where}) AND ${col} IS NOT NULL`;
  } else {
    this._where = col + " IS NOT NULL";
  }
  return this;
};
Sql.prototype._base_where_between = function (col, low, high) {
  if (this._where) {
    this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype._base_where_not_between = function (col, low, high) {
  if (this._where) {
    this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype._base_or_where_in = function (cols, range) {
  const in_token = this._get_in_token(cols, range);
  if (this._where) {
    this._where = `${this._where} OR ${in_token}`;
  } else {
    this._where = in_token;
  }
  return this;
};
Sql.prototype._base_or_where_not_in = function (cols, range) {
  const not_in_token = this._get_in_token(cols, range, "NOT IN");
  if (this._where) {
    this._where = `${this._where} OR ${not_in_token}`;
  } else {
    this._where = not_in_token;
  }
  return this;
};
Sql.prototype._base_or_where_null = function (col) {
  if (this._where) {
    this._where = `${this._where} OR ${col} IS NULL`;
  } else {
    this._where = col + " IS NULL";
  }
  return this;
};
Sql.prototype._base_or_where_not_null = function (col) {
  if (this._where) {
    this._where = `${this._where} OR ${col} IS NOT NULL`;
  } else {
    this._where = col + " IS NOT NULL";
  }
  return this;
};
Sql.prototype._base_or_where_between = function (col, low, high) {
  if (this._where) {
    this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype._base_or_where_not_between = function (col, low, high) {
  if (this._where) {
    this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype._rows_to_array = function (rows, columns) {
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
        const _js_default = fields[col]._js_default;
        if (_js_default !== undefined) {
          res[j][i] = fields[col].get_default();
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
Sql.prototype._get_insert_values_token = function (row, columns) {
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
  return [value_list, columns];
};
Sql.prototype._get_bulk_insert_values_token = function (rows, columns) {
  columns = columns || get_keys(rows);
  rows = this._rows_to_array(rows, columns);
  return [rows.map(as_literal), columns];
};
Sql.prototype._get_update_token_with_prefix = function (columns, key, prefix) {
  const tokens = [];
  if (typeof key === "string") {
    for (const col of columns) {
      if (col !== key) {
        tokens.push(`${col} = ${prefix}.${col}`);
      }
    }
  } else {
    const sets = {};
    for (const k of key) {
      sets[k] = true;
    }
    for (const col of columns) {
      if (!sets[col]) {
        tokens.push(`${col} = ${prefix}.${col}`);
      }
    }
  }
  return tokens.join(", ");
};
Sql.prototype._get_select_token = function (a, b, ...varargs) {
  if (b === undefined) {
    if (Array.isArray(a)) {
      const tokens = [];
      for (const e of a) {
        tokens.push(this._get_select_column(e));
      }
      return as_token(tokens);
    } else if (typeof a === "string") {
      return this._get_select_column(a);
    } else if (typeof a === "function") {
      const select_args = a(this._create_context());
      if (typeof select_args === "string") {
        return select_args;
      } else if (Array.isArray(select_args)) {
        return select_args.join(", ");
      } else {
        throw new Error("wrong type:" + typeof select_args);
      }
    } else {
      return as_token(a);
    }
  } else {
    const res = [];
    for (const name of [a, b, ...varargs]) {
      res.push(as_token(this._get_select_column(name)));
    }
    return res.join(", ");
  }
};
Sql.prototype._get_select_literal = function (a, b, ...varargs) {
  if (b === undefined) {
    if (Array.isArray(a)) {
      const tokens = [];
      for (const e of a) {
        tokens.push(as_literal(e));
      }
      return as_token(tokens);
    } else {
      return as_literal(a);
    }
  } else {
    const res = [];
    for (const name of [a, b, ...varargs]) {
      res.push(as_literal(name));
    }
    return res.join(", ");
  }
};
Sql.prototype._get_update_token = function (row, columns) {
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
};
Sql.prototype._get_with_token = function (name, token) {
  if (token === undefined) {
    return name;
  } else if (token instanceof Sql) {
    return `${name} AS (${token.statement()})`;
  } else {
    return `${name} AS ${token}`;
  }
};
Sql.prototype._get_insert_token = function (row, columns) {
  const [values_list, insert_columns] = this._get_insert_values_token(row, columns);
  return `(${as_token(insert_columns)}) VALUES ${as_literal(values_list)}`;
};
Sql.prototype._get_bulk_insert_token = function (rows, columns) {
  [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
  return `(${as_token(columns)}) VALUES ${as_token(rows)}`;
};
Sql.prototype._set_select_subquery_insert_token = function (subsql, columns) {
  const columns_token = as_token(columns || subsql._select_args?.flat());
  this._insert = `(${columns_token}) ${subsql.statement()}`;
};
Sql.prototype._set_cud_subquery_insert_token = function (subsql, columns) {
  const columns_token = as_token(columns || subsql._returning_args.flat());
  const cudsql = Sql.new({ table_name: "D", _select: columns_token });
  this.with(`D(${columns_token})`, subsql);
  this._insert = `(${columns_token}) ${cudsql.statement()}`;
};
Sql.prototype._get_upsert_token = function (row, key, columns) {
  const [values_list, insert_columns] = this._get_insert_values_token(row, columns);
  const insert_token = `(${as_token(insert_columns)}) VALUES ${as_literal(values_list)} ON CONFLICT (${get_list_tokens(
    key,
  )})`;
  if ((Array.isArray(key) && key.length === insert_columns.length) || insert_columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(insert_columns, key, "EXCLUDED")}`;
  }
};
Sql.prototype._get_bulk_upsert_token = function (rows, key, columns) {
  [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
  const insert_token = `(${as_token(columns)}) VALUES ${as_token(rows)} ON CONFLICT (${get_list_tokens(key)})`;
  if ((Array.isArray(key) && key.length === columns.length) || columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(columns, key, "EXCLUDED")}`;
  }
};
Sql.prototype.align = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  const upsert_query = this.model.create_sql().upsert(rows, key, columns).returning(key);
  this.with("U", upsert_query)
    .where_not_in(key, Sql.new({ table_name: "U" })._base_select(key))
    .delete();
  return this;
};
Sql.prototype._get_upsert_query_token = function (rows, key, columns) {
  const columns_token = this._get_select_token(columns);
  const insert_token = `(${columns_token}) ${rows.statement()} ON CONFLICT (${this._get_select_token(key)})`;
  if ((Array.isArray(key) && key.length === columns.length) || columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(columns, key, "EXCLUDED")}`;
  }
};
Sql.prototype._get_in_token = function (cols, range, op) {
  cols = as_token(cols);
  op = op || "IN";
  if (typeof range === "object") {
    if (range instanceof Sql) {
      return `(${cols}) ${op} (${range.statement()})`;
    } else {
      return `(${cols}) ${op} ${as_literal(range)}`;
    }
  } else {
    return `(${cols}) ${op} ${range}`;
  }
};
Sql.prototype._base_get_update_query_token = function (subquery, columns) {
  const columns_token = get_list_tokens(columns || subquery._select_args?.flat());
  return `(${columns_token}) = (${subquery.statement()})`;
};
Sql.prototype._get_join_condition_from_key = function (key, left_table, right_table) {
  if (typeof key === "string") {
    return `${left_table}.${key} = ${right_table}.${key}`;
  }
  const res = [];
  for (const k of key) {
    res.push(`${left_table}.${k} = ${right_table}.${k}`);
  }
  return res.join(" AND ");
};
Sql.prototype._set_join_token = function (join_type, join_table, join_cond) {
  if (this._update) {
    this._base_from(join_table);
    this._base_where(join_cond);
  } else if (this._delete) {
    this._base_using(join_table);
    this._base_where(join_cond);
  } else {
    this._base_join_raw(join_type || "INNER", join_table, join_cond);
  }
};
Sql.prototype._get_select_column = function (key) {
  if (typeof key !== "string") {
    return key;
  } else {
    return this._parse_column(key, true)[0];
  }
};
Sql.prototype._handle_where_token = function (where_token, tpl) {
  if (where_token === "") {
    return this;
  } else if (this._where === undefined) {
    this._where = where_token;
  } else {
    this._where = string_format(tpl, this._where, where_token);
  }
  return this;
};
Sql.prototype._get_condition_token_from_table = function (kwargs, logic) {
  const tokens = [];
  for (const [k, value] of Object.entries(kwargs)) {
    tokens.push(this._get_expr_token(value, ...this._parse_column(k)));
  }
  if (logic === undefined) {
    return tokens.join(" AND ");
  } else {
    return tokens.join(" " + logic + " ");
  }
};
Sql.prototype._get_condition_token = function (cond, op, dval) {
  if (op === undefined) {
    if (typeof cond === "object") {
      return Sql.prototype._get_condition_token_from_table.call(this, cond);
    } else {
      return Sql.prototype._base_get_condition_token.call(this, cond);
    }
  } else if (dval === undefined) {
    return `${this._get_column(cond)} = ${as_literal(op)}`;
  } else {
    return `${this._get_column(cond)} ${op} ${as_literal(dval)}`;
  }
};
Sql.prototype._get_condition_token_or = function (cond, op, dval) {
  if (typeof cond === "object") {
    return this._get_condition_token_from_table(cond, "OR");
  } else {
    return this._get_condition_token(cond, op, dval);
  }
};
Sql.prototype._get_condition_token_not = function (cond, op, dval) {
  let token;
  if (typeof cond === "object") {
    token = this._get_condition_token_from_table(cond, "OR");
  } else {
    token = this._get_condition_token(cond, op, dval);
  }
  return (token !== "" && `NOT (${token})`) || "";
};
Sql.prototype._handle_set_option = function (other_sql, set_operation_attr) {
  if (!this[set_operation_attr]) {
    this[set_operation_attr] = other_sql.statement();
  } else {
    this[set_operation_attr] = `(${this[set_operation_attr]}) ${
      PG_SET_MAP[set_operation_attr]
    } (${other_sql.statement()})`;
  }
  // if (this !== Sql) {
  //   this.statement = this._statement_for_set;
  // } else {
  //   throw new Error("don't call _handle_set_option directly on Sql class");
  // }
  this.statement = this._statement_for_set;
  return this;
};
Sql.prototype._statement_for_set = function () {
  let statement = Sql.prototype.statement.call(this);
  if (this._intersect) {
    statement = `(${statement}) INTERSECT (${this._intersect})`;
  } else if (this._intersect_all) {
    statement = `(${statement}) INTERSECT ALL (${this._intersect_all})`;
  } else if (this._union) {
    statement = `(${statement}) UNION (${this._union})`;
  } else if (this._union_all) {
    statement = `${statement} UNION ALL (${this._union_all})`;
  } else if (this._except) {
    statement = `(${statement}) EXCEPT (${this._except})`;
  } else if (this._except_all) {
    statement = `(${statement}) EXCEPT ALL (${this._except_all})`;
  }
  return statement;
};
Sql.prototype.prepend = function (...varargs) {
  if (!this._prepend) {
    this._prepend = [];
  }
  const n = varargs.length;
  for (let i = n - 1; i >= 0; i = i - 1) {
    const e = varargs[i];
    this._prepend.unshift(e);
  }
  return this;
};
Sql.prototype.append = function (...varargs) {
  if (!this._append) {
    this._append = [];
  }
  for (const statement of varargs) {
    this._append.push(statement);
  }
  return this;
};
Sql.prototype.statement = function () {
  let statement = assemble_sql({
    table_name: this.table_name,
    as: this._as,
    with: this._with,
    with_recursive: this._with_recursive,
    distinct: this._distinct,
    distinct_on: this._distinct_on,
    returning: this._returning,
    insert: this._insert,
    update: this._update,
    delete: this._delete,
    using: this._using,
    select: this._select,
    from: this._from,
    join_args: this._join_args,
    where: this._where,
    group: this._group,
    having: this._having,
    order: this._order,
    limit: this._limit,
    offset: this._offset,
  });
  if (this._prepend) {
    const res = [];
    for (const sql of this._prepend) {
      if (typeof sql === "string") {
        res.push(sql);
      } else {
        res.push(sql.statement());
      }
    }
    statement = res.join(";") + (";" + statement);
  }
  if (this._append) {
    const res = [];
    for (const sql of this._append) {
      if (typeof sql === "string") {
        res.push(sql);
      } else {
        res.push(sql.statement());
      }
    }
    statement = statement + (";" + res.join(";"));
  }
  return statement;
};
Sql.prototype.with = function (name, token) {
  const with_token = this._get_with_token(name, token);
  if (this._with) {
    this._with = `${this._with}, ${with_token}`;
  } else {
    this._with = with_token;
  }
  return this;
};
Sql.prototype.with_recursive = function (name, token) {
  const with_token = this._get_with_token(name, token);
  if (this._with_recursive) {
    this._with_recursive = `${this._with_recursive}, ${with_token}`;
  } else {
    this._with_recursive = with_token;
  }
  return this;
};
Sql.prototype.union = function (other_sql) {
  return this._handle_set_option(other_sql, "_union");
};
Sql.prototype.union_all = function (other_sql) {
  return this._handle_set_option(other_sql, "_union_all");
};
Sql.prototype.except = function (other_sql) {
  return this._handle_set_option(other_sql, "_except");
};
Sql.prototype.except_all = function (other_sql) {
  return this._handle_set_option(other_sql, "_except_all");
};
Sql.prototype.intersect = function (other_sql) {
  return this._handle_set_option(other_sql, "_intersect");
};
Sql.prototype.intersect_all = function (other_sql) {
  return this._handle_set_option(other_sql, "_intersect_all");
};
Sql.prototype.as = function (table_alias) {
  this._as = table_alias;
  return this;
};
Sql.prototype.with_values = function (name, rows) {
  let columns = get_keys(rows);
  [rows, columns] = this._get_cte_values_literal(rows, columns, true);
  const cte_name = `${name}(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(rows)})`;
  return this.with(cte_name, cte_values);
};
Sql.prototype.get_merge = function (rows, key) {
  let columns = get_keys(rows);
  [rows, columns] = this._get_cte_values_literal(rows, columns, true);
  const join_cond = this._get_join_condition_from_key(key, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(rows)})`;
  this._base_select("V.*").with(cte_name, cte_values)._base_join("RIGHT", "V", join_cond);
  return this;
};
Sql.prototype.copy = function () {
  const copy_sql = {};
  for (const [key, value] of Object.entries(this)) {
    if (typeof value === "object") {
      copy_sql[key] = clone(value);
    } else {
      copy_sql[key] = value;
    }
  }
  return Sql.new(copy_sql);
};
Sql.prototype.clear = function () {
  const model = this.model;
  const table_name = this.table_name;
  const as = this._as;
  for (const key of this) {
    delete this[key];
  }
  this.model = model;
  this.table_name = table_name;
  this._as = as;
  return this;
};
Sql.prototype.delete = function (cond, op, dval) {
  this._delete = true;
  if (cond !== undefined) {
    this.where(cond, op, dval);
  }
  return this;
};
Sql.prototype.distinct = function () {
  this._distinct = true;
  return this;
};
Sql.prototype.select = function (a, b, ...varargs) {
  const s = this._get_select_token(a, b, ...varargs);
  if (s === "") {
  } else if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + ", " + s;
  }
  this._keep_args("_select_args", a, b, ...varargs);
  return this;
};
Sql.prototype.select_as = function (key, alias) {
  const col = this._parse_column(key, true, true)[0] + (" AS " + alias);
  if (!this._select) {
    this._select = col;
  } else {
    this._select = this._select + (", " + col);
  }
  return this;
};
Sql.prototype.select_literal = function (a, b, ...varargs) {
  const s = this._get_select_literal(a, b, ...varargs);
  if (s === "") {
  } else if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + (", " + s);
  }
  this._keep_args("_select_literal_args", a, b, ...varargs);
  return this;
};
Sql.prototype.returning = function (a, b, ...varargs) {
  const s = this._get_select_token(a, b, ...varargs);
  if (s === "") {
  } else if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  this._keep_args("_returning_args", a, b, ...varargs);
  return this;
};
Sql.prototype.returning_literal = function (a, b, ...varargs) {
  const s = this._get_select_literal(a, b, ...varargs);
  if (s === "") {
  } else if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  this._keep_args("_returning_literal_args", a, b, ...varargs);
  return this;
};
Sql.prototype.group = function (a, ...varargs) {
  const s = this._get_select_token(a, ...varargs);
  if (s === "") {
  } else if (!this._group) {
    this._group = s;
  } else {
    this._group = this._group + (", " + s);
  }
  return this;
};
Sql.prototype.group_by = function (...varargs) {
  return this.group(...varargs);
};
Sql.prototype._get_order_column = function (key) {
  if (typeof key !== "string") {
    return key;
  } else {
    const matched = key.match(/^([-+]?)([\w_]+)$/);
    if (matched) {
      return `${this._parse_column(matched[2])[0]} ${(matched[1] === "-" && "DESC") || "ASC"}`;
    } else {
      throw new Error(`invalid order arg format: ${key}`);
    }
  }
};
Sql.prototype._get_order_token = function (a, b, ...varargs) {
  if (b === undefined) {
    if (Array.isArray(a)) {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = this._get_order_column(a[i]);
      }
      return as_token(tokens);
    } else if (typeof a === "string") {
      return this._get_order_column(a);
    } else if (typeof a === "function") {
      const order_args = a(this._create_context());
      if (typeof order_args === "string") {
        return order_args;
      } else if (Array.isArray(order_args)) {
        return order_args.join(", ");
      } else {
        throw new Error("wrong type:" + typeof order_args);
      }
    } else {
      return as_token(a);
    }
  } else {
    const res = [];
    for (const name of [a, b, ...varargs]) {
      res.push(as_token(this._get_order_column(name)));
    }
    return res.join(", ");
  }
};
Sql.prototype.order = function (a, ...varargs) {
  const s = this._get_order_token(a, ...varargs);
  if (s === "") {
  } else if (!this._order) {
    this._order = s;
  } else {
    this._order = this._order + (", " + s);
  }
  return this;
};
Sql.prototype.order_by = function (...varargs) {
  return this.order(...varargs);
};
Sql.prototype.using = function (...varargs) {
  return this._base_using(...varargs);
};
Sql.prototype.from = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (s === "") {
  } else if (!this._from) {
    this._from = s;
  } else {
    this._from = this._from + (", " + s);
  }
  return this;
};
Sql.prototype.get_table = function () {
  //TODO: when will return undefined on self.table_name is undefined ?
  // if (this.table_name === undefined) {
  //   return undefined;
  // } else
  if (this._as) {
    return this.table_name + (" " + this._as);
  } else {
    return this.table_name;
  }
};
Sql.prototype.join = function (join_args, key, op, val) {
  return this._base_join("INNER", join_args, key, op, val);
};
Sql.prototype.inner_join = function (join_args, key, op, val) {
  return this._base_join("INNER", join_args, key, op, val);
};
Sql.prototype.left_join = function (join_args, key, op, val) {
  return this._base_join("LEFT", join_args, key, op, val);
};
Sql.prototype.right_join = function (join_args, key, op, val) {
  return this._base_join("RIGHT", join_args, key, op, val);
};
Sql.prototype.full_join = function (join_args, key, op, val) {
  return this._base_join("FULL", join_args, key, op, val);
};
Sql.prototype.cross_join = function (join_args, key, op, val) {
  return this._base_join("CROSS", join_args, key, op, val);
};
Sql.prototype.limit = function (n) {
  this._limit = n;
  return this;
};
Sql.prototype.offset = function (n) {
  this._offset = n;
  return this;
};
Sql.prototype.where = function (cond, op, dval) {
  const where_token = this._get_condition_token(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
const logic_priority = {
  ["init"]: 0,
  ["or"]: 1,
  ["and"]: 2,
  ["not"]: 3,
  ["OR"]: 1,
  ["AND"]: 2,
  ["NOT"]: 3,
};
Sql.prototype._parse_where_exp = function (cond, father_op) {
  const logic_op = cond[0];
  const tokens = [];
  for (let i = 1; i < cond.length; i = i + 1) {
    const value = cond[i];
    if (Array.isArray(value)) {
      tokens.push(this._parse_where_exp(value, logic_op));
    } else {
      for (const [k, v] of Object.entries(value)) {
        tokens.push(this._get_expr_token(v, ...this._parse_column(k)));
      }
    }
  }
  let where_token;
  if (logic_op === "not" || logic_op === "NOT") {
    where_token = "NOT " + tokens.join(" AND NOT ");
  } else {
    where_token = tokens.join(` ${logic_op} `);
  }
  if (logic_priority[logic_op] < logic_priority[father_op]) {
    return "(" + where_token + ")";
  } else {
    return where_token;
  }
};
Sql.prototype.where_exp = function (cond) {
  const where_token = this._parse_where_exp(cond, "init");
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype.where_or = function (cond, op, dval) {
  const where_token = this._get_condition_token_or(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype.or_where_or = function (cond, op, dval) {
  const where_token = this._get_condition_token_or(cond, op, dval);
  return this._handle_where_token(where_token, "%s OR %s");
};
Sql.prototype.where_not = function (cond, op, dval) {
  const where_token = this._get_condition_token_not(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype.or_where = function (cond, op, dval) {
  const where_token = this._get_condition_token(cond, op, dval);
  return this._handle_where_token(where_token, "%s OR %s");
};
Sql.prototype.or_where_not = function (cond, op, dval) {
  const where_token = this._get_condition_token_not(cond, op, dval);
  return this._handle_where_token(where_token, "%s OR %s");
};
Sql.prototype.where_exists = function (builder) {
  if (this._where) {
    this._where = `(${this._where}) AND EXISTS (${builder})`;
  } else {
    this._where = `EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.where_not_exists = function (builder) {
  if (this._where) {
    this._where = `(${this._where}) AND NOT EXISTS (${builder})`;
  } else {
    this._where = `NOT EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.where_in = function (cols, range) {
  if (typeof cols === "string") {
    return Sql.prototype._base_where_in.call(this, this._get_column(cols), range);
  } else {
    const res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._get_column(cols[i]);
    }
    return Sql.prototype._base_where_in.call(this, res, range);
  }
};
Sql.prototype.where_not_in = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._get_column(cols);
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._get_column(cols[i]);
    }
  }
  return Sql.prototype._base_where_not_in.call(this, cols, range);
};
Sql.prototype.where_null = function (col) {
  return Sql.prototype._base_where_null.call(this, this._get_column(col));
};
Sql.prototype.where_not_null = function (col) {
  return Sql.prototype._base_where_not_null.call(this, this._get_column(col));
};
Sql.prototype.where_between = function (col, low, high) {
  return Sql.prototype._base_where_between.call(this, this._get_column(col), low, high);
};
Sql.prototype.where_not_between = function (col, low, high) {
  return Sql.prototype._base_where_not_between.call(this, this._get_column(col), low, high);
};
Sql.prototype.or_where_in = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._get_column(cols);
    return Sql.prototype._base_or_where_in.call(this, cols, range);
  } else {
    const res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._get_column(cols[i]);
    }
    return Sql.prototype._base_or_where_in.call(this, res, range);
  }
};
Sql.prototype.or_where_not_in = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._get_column(cols);
    return Sql.prototype._base_or_where_not_in.call(this, cols, range);
  } else {
    const res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._get_column(cols[i]);
    }
    return Sql.prototype._base_or_where_not_in.call(this, res, range);
  }
};
Sql.prototype.or_where_null = function (col) {
  return Sql.prototype._base_or_where_null.call(this, this._get_column(col));
};
Sql.prototype.or_where_not_null = function (col) {
  return Sql.prototype._base_or_where_not_null.call(this, this._get_column(col));
};
Sql.prototype.or_where_between = function (col, low, high) {
  return Sql.prototype._base_or_where_between.call(this, this._get_column(col), low, high);
};
Sql.prototype.or_where_not_between = function (col, low, high) {
  return Sql.prototype._base_or_where_not_between.call(this, this._get_column(col), low, high);
};
Sql.prototype.or_where_exists = function (builder) {
  if (this._where) {
    this._where = `${this._where} OR EXISTS (${builder})`;
  } else {
    this._where = `EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.or_where_not_exists = function (builder) {
  if (this._where) {
    this._where = `${this._where} OR NOT EXISTS (${builder})`;
  } else {
    this._where = `NOT EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.having = function (cond, op, dval) {
  if (this._having) {
    this._having = `(${this._having}) AND (${this._get_condition_token(cond, op, dval)})`;
  } else {
    this._having = this._get_condition_token(cond, op, dval);
  }
  return this;
};
Sql.prototype.having_not = function (cond, op, dval) {
  if (this._having) {
    this._having = `(${this._having}) AND (${this._get_condition_token_not(cond, op, dval)})`;
  } else {
    this._having = this._get_condition_token_not(cond, op, dval);
  }
  return this;
};
Sql.prototype.having_exists = function (builder) {
  if (this._having) {
    this._having = `(${this._having}) AND EXISTS (${builder})`;
  } else {
    this._having = `EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.having_not_exists = function (builder) {
  if (this._having) {
    this._having = `(${this._having}) AND NOT EXISTS (${builder})`;
  } else {
    this._having = `NOT EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.having_in = function (cols, range) {
  const in_token = this._get_in_token(cols, range);
  if (this._having) {
    this._having = `(${this._having}) AND ${in_token}`;
  } else {
    this._having = in_token;
  }
  return this;
};
Sql.prototype.having_not_in = function (cols, range) {
  const not_in_token = this._get_in_token(cols, range, "NOT IN");
  if (this._having) {
    this._having = `(${this._having}) AND ${not_in_token}`;
  } else {
    this._having = not_in_token;
  }
  return this;
};
Sql.prototype.having_null = function (col) {
  if (this._having) {
    this._having = `(${this._having}) AND ${col} IS NULL`;
  } else {
    this._having = col + " IS NULL";
  }
  return this;
};
Sql.prototype.having_not_null = function (col) {
  if (this._having) {
    this._having = `(${this._having}) AND ${col} IS NOT NULL`;
  } else {
    this._having = col + " IS NOT NULL";
  }
  return this;
};
Sql.prototype.having_between = function (col, low, high) {
  if (this._having) {
    this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype.having_not_between = function (col, low, high) {
  if (this._having) {
    this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype.or_having = function (cond, op, dval) {
  if (this._having) {
    this._having = `${this._having} OR ${this._get_condition_token(cond, op, dval)}`;
  } else {
    this._having = this._get_condition_token(cond, op, dval);
  }
  return this;
};
Sql.prototype.or_having_not = function (cond, op, dval) {
  if (this._having) {
    this._having = `${this._having} OR ${this._get_condition_token_not(cond, op, dval)}`;
  } else {
    this._having = this._get_condition_token_not(cond, op, dval);
  }
  return this;
};
Sql.prototype.or_having_exists = function (builder) {
  if (this._having) {
    this._having = `${this._having} OR EXISTS (${builder})`;
  } else {
    this._having = `EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.or_having_not_exists = function (builder) {
  if (this._having) {
    this._having = `${this._having} OR NOT EXISTS (${builder})`;
  } else {
    this._having = `NOT EXISTS (${builder})`;
  }
  return this;
};
Sql.prototype.or_having_in = function (cols, range) {
  const in_token = this._get_in_token(cols, range);
  if (this._having) {
    this._having = `${this._having} OR ${in_token}`;
  } else {
    this._having = in_token;
  }
  return this;
};
Sql.prototype.or_having_not_in = function (cols, range) {
  const not_in_token = this._get_in_token(cols, range, "NOT IN");
  if (this._having) {
    this._having = `${this._having} OR ${not_in_token}`;
  } else {
    this._having = not_in_token;
  }
  return this;
};
Sql.prototype.or_having_null = function (col) {
  if (this._having) {
    this._having = `${this._having} OR ${col} IS NULL`;
  } else {
    this._having = col + " IS NULL";
  }
  return this;
};
Sql.prototype.or_having_not_null = function (col) {
  if (this._having) {
    this._having = `${this._having} OR ${col} IS NOT NULL`;
  } else {
    this._having = col + " IS NOT NULL";
  }
  return this;
};
Sql.prototype.or_having_between = function (col, low, high) {
  if (this._having) {
    this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype.or_having_not_between = function (col, low, high) {
  if (this._having) {
    this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Sql.prototype.distinct_on = function (a, b, ...varargs) {
  const s = this._get_select_token(a, b, ...varargs);
  this._distinct_on = s;
  this._order = s;
  return this;
};
// modelsql methods
Sql.prototype.increase = function (name, amount) {
  return this.update({ [name]: Sql.token(`${name} + ${amount || 1}`) });
};
Sql.prototype.decrease = function (name, amount) {
  return this.update({ [name]: Sql.token(`${name} - ${amount || 1}`) });
};
Sql.prototype._base_get_multiple = function (keys, columns) {
  if (keys.length === 0) {
    throw new Error("empty keys passed to get_multiple");
  }
  columns = columns || get_keys(keys[0]);
  [keys, columns] = this._get_cte_values_literal(keys, columns, false);
  const join_cond = this._get_join_condition_from_key(columns, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(keys)})`;
  return this.with(cte_name, cte_values).right_join("V", join_cond);
};
Sql.prototype._get_cte_values_literal = function (rows, columns, no_check) {
  columns = columns || get_keys(rows);
  rows = this._rows_to_array(rows, columns);
  const first_row = rows[0];
  for (const [i, col] of columns.entries()) {
    const [field] = this._find_field_model(col);
    if (field) {
      first_row[i] = `${as_literal(first_row[i])}::${field.db_type}`;
    } else if (no_check) {
      first_row[i] = as_literal(first_row[i]);
    } else {
      throw new Error("invalid field name: " + col);
    }
  }
  const res = [];
  res[0] = "(" + (as_token(first_row) + ")");
  for (let i = 1; i < rows.length; i = i + 1) {
    res[i] = as_literal(rows[i]);
  }
  return [res, columns];
};
Sql.prototype._find_field_model = function (col) {
  const field = this.model.fields[col];
  if (field) {
    return [field, this.model, this._as || this.table_name];
  }
};
Sql.prototype._parse_column = function (key, as_select, disable_alias) {
  let a = key.indexOf("__");
  if (a === -1) {
    if (as_select) {
      return [this._get_column(key)];
    } else {
      return [this._get_column(key), "eq", key, this.model];
    }
  }
  let token = key.slice(0, a);
  let [field, model, prefix] = this._find_field_model(token);
  if (!field) {
    throw new Error(`${token} is not a valid field name for ${this.table_name}`);
  }
  let i, fk_model, join_key, op;
  let field_name = token;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    i = a + 2;
    a = key.indexOf("__", i);
    if (a === -1) {
      token = key.slice(i);
    } else {
      token = key.slice(i, a);
    }
    if (field.reference) {
      fk_model = field.reference;
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
          join_key = field_name;
        } else {
          join_key = join_key + ("__" + field_name);
        }
        if (!this._join_keys) {
          this._join_keys = {};
        }
        const alias = this._join_keys[join_key];
        if (!alias) {
          prefix = this._handle_manual_join(
            this._join_type || "INNER",
            [field.reference],
            (ctx) =>
              `${ctx[model.table_name][field_name]} = ${ctx[field.reference.table_name][field.reference_column]}`,
            join_key,
          );
        } else {
          prefix = alias;
        }
        field = fk_model_field;
        model = fk_model;
        field_name = token;
      }
    } else if (field.model) {
      const table_field = field.model.fields[token];
      if (!table_field) {
        throw new Error(`invalid table field name ${token} of ${field.name}`);
      }
      op = function (value) {
        if (typeof value === "string" && value.includes("'")) {
          value = value.replaceAll("'", "''");
        }
        return `@> '[{"${token}":${JSON.stringify(value)}}]'`;
      };
      break;
    } else {
      op = token;
      break;
    }
    if (a === -1) {
      break;
    }
  }
  const final_key = prefix + "." + field_name;
  if (as_select && !disable_alias) {
    assert(fk_model, `should contains foreignkey field name: ${key}`);
    assert(op === undefined, `invalid field name: ${op}`);
    return [final_key + " AS " + key];
  } else {
    return [final_key, op || "eq", field_name, model];
  }
};
Sql.prototype._get_column = function (key) {
  // TODO: add strict here?
  if (this.model.fields[key]) {
    if (this._as) {
      return this._as + "." + key;
    } else {
      return this.model.name_cache[key];
    }
  }
  if (key === "*") {
    return "*";
  }
  const table_name = key.match(/^([\w_]+)[.][\w_]+$/);
  if (table_name) {
    return key;
  }
  throw new Error(`invalid field name: '${key}'`);
  // if (strict) {
  //   throw new Error(`invalid field name: '${key}'`);
  // } else {
  //   return key;
  // }
};
const string_db_types = { varchar: true, text: true, char: true, bpchar: true };
const string_operators = {
  contains: true,
  startswith: true,
  endswith: true,
  regex: true,
  regex_insensitive: true,
  regex_sensitive: true,
};
Sql.prototype._get_expr_token = function (value, key, op, raw_key, model) {
  const field = (model || this.model).fields[raw_key];
  if (field && !string_db_types[field.db_type] && string_operators[op]) {
    key = key + "::varchar";
  }
  if (op === "eq") {
    return `${key} = ${as_literal(value)}`;
  } else if (op === "in") {
    return `${key} IN ${as_literal(value)}`;
  } else if (op === "notin") {
    return `${key} NOT IN ${as_literal(value)}`;
  } else if (COMPARE_OPERATORS[op]) {
    return `${key} ${COMPARE_OPERATORS[op]} ${as_literal(value)}`;
  } else if (op === "contains") {
    return `${key} LIKE '%${value.replaceAll("'", "''")}%'`;
  } else if (op === "startswith") {
    return `${key} LIKE '${value.replaceAll("'", "''")}%'`;
  } else if (op === "endswith") {
    return `${key} LIKE '%${value.replaceAll("'", "''")}'`;
  } else if (op === "regex" || op === "regex_sensitive") {
    return `${key} ~ '%${value.replaceAll("'", "''")}'`;
  } else if (op === "regex_insensitive") {
    return `${key} ~* '%${value.replaceAll("'", "''")}'`;
  } else if (op === "null") {
    if (value) {
      return `${key} IS NULL`;
    } else {
      return `${key} IS NOT NULL`;
    }
  } else if (typeof op === "function") {
    return `${key} ${op(value)}`;
  } else {
    throw new Error("invalid sql op: " + String(op));
  }
};
Sql.prototype.insert = function (rows, columns) {
  if (!(rows instanceof Sql)) {
    if (!this._skip_validate) {
      [rows, columns] = this.model.validate_create_data(rows, columns);
    }
    [rows, columns] = this.model.prepare_db_rows(rows, columns);
    return Sql.prototype._base_insert.call(this, rows, columns);
  } else {
    return Sql.prototype._base_insert.call(this, rows, columns);
  }
};
Sql.prototype.update = function (row, columns) {
  if (typeof row === "string") {
    return Sql.prototype._base_update.call(this, row);
  } else if (!(row instanceof Sql)) {
    if (!this._skip_validate) {
      row = this.model.validate_update(row, columns);
    }
    [row, columns] = this.model.prepare_db_rows(row, columns, true);
    return Sql.prototype._base_update.call(this, row, columns);
  } else {
    return Sql.prototype._base_update.call(this, row, columns);
  }
};
Sql.prototype._get_bulk_key = function (columns) {
  if (this.model.unique_together && this.model.unique_together[0]) {
    return this.model.unique_together[0];
  }
  for (const name of columns) {
    const f = this.model.fields[name];
    if (f && f.unique) {
      return name;
    }
  }
  const pk = this.model.primary_key;
  if (pk && columns.includes(pk)) {
    return pk;
  }
  return pk;
};
Sql.prototype._clean_bulk_params = function (rows, key, columns) {
  if (next(rows) === undefined) {
    throw new Error("empty rows passed to merge");
  }
  if (!Array.isArray(rows)) {
    rows = [rows];
  }
  if (columns === undefined) {
    columns = [];
    for (const k of Object.keys(rows[0])) {
      if (this.model.fields[k]) {
        columns.push(k);
      }
    }
    if (columns.length === 0) {
      throw new Error("no columns provided for bulk");
    }
  }
  if (key === undefined) {
    key = this._get_bulk_key(columns);
  }
  if (typeof key === "string") {
    if (!columns.includes(key)) {
      columns = [key, ...columns];
    }
  } else if (typeof key === "object") {
    for (const k of key) {
      if (!columns.includes(k)) {
        columns = [k, ...columns];
      }
    }
  } else {
    throw new Error("invalid key type for bulk:" + typeof key);
  }
  return [rows, key, columns];
};
Sql.prototype.merge = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  return Sql.prototype._base_merge.call(this, rows, key, columns);
};
Sql.prototype.upsert = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_create_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, false);
  return Sql.prototype._base_upsert.call(this, rows, key, columns);
};
Sql.prototype.updates = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  if (!this._skip_validate) {
    [rows, key, columns] = this.model.validate_update_rows(rows, key, columns);
  }
  [rows, columns] = this.model.prepare_db_rows(rows, columns, true);
  return Sql.prototype._base_updates.call(this, rows, key, columns);
};
Sql.prototype.get_multiple = function (keys, columns) {
  return Sql.prototype._base_get_multiple.call(this, keys, columns);
};
Sql.prototype.exec_statement = async function (statement) {
  const records = assert(await this.model.query(statement, this._compact));
  // let multiple_records;
  // if (this._prepend) {
  //   multiple_records = records;
  //   records = records[this._prepend.length];
  // } else if (this._append) {
  //   multiple_records = records;
  //   records = records[0];
  // }
  if (this._raw || this._raw === undefined || this._compact || this._update || this._insert || this._delete) {
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
Sql.prototype.exec = async function () {
  return await this.exec_statement(this.statement());
};
Sql.prototype.count = async function (cond, op, dval) {
  let res;
  if (cond !== undefined) {
    res = await this._base_select("count(*)").where(cond, op, dval).compact().exec();
  } else {
    res = await this._base_select("count(*)").compact().exec();
  }
  if (res && res[0]) {
    return res[0][0];
  } else {
    return 0;
  }
};
Sql.prototype.create = async function (rows, columns) {
  return await this.insert(rows, columns).execr();
};
Sql.prototype.exists = async function () {
  const statement = `SELECT EXISTS (${this.select(1).limit(1).compact().statement()})`;
  const res = await this.model.query(statement, this._compact);
  return res;
};
Sql.prototype.compact = function () {
  this._compact = true;
  return this;
};
Sql.prototype.raw = function (is_raw) {
  if (is_raw === undefined || is_raw) {
    this._raw = true;
  } else {
    this._raw = false;
  }
  return this;
};
Sql.prototype.commit = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._commit = bool;
  return this;
};
Sql.prototype.join_type = function (jtype) {
  this._join_type = jtype;
  return this;
};
Sql.prototype.skip_validate = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._skip_validate = bool;
  return this;
};
Sql.prototype.flat = async function (col) {
  if (col) {
    if (this._update || this._delete || this._insert) {
      return await this.returning(col).compact().execr().flat();
    } else {
      return await this.select(col).compact().execr().flat();
    }
  } else {
    return await this.compact().execr().flat();
  }
};
Sql.prototype.try_get = async function (cond, op, dval) {
  if (this._raw === undefined) {
    this._raw = false;
  }
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
Sql.prototype.get = async function (cond, op, dval) {
  try {
    return await this.try_get(cond, op, dval);
  } catch (error) {
    throw new Error(`failed to get: ${error.message} returned`);
  }
};
Sql.prototype.as_set = async function () {
  return await this.compact().execr().flat().as_set();
};
Sql.prototype.execr = async function () {
  return await this.raw().exec();
};
Sql.prototype.load_fk_labels = function (names) {
  for (const name of names || this.model.names) {
    const field = this.model.fields[name];
    if (field && field.type === "foreignkey" && field.reference_label_column !== field.reference_column) {
      this.load_fk(field.name, field.reference_label_column);
    }
  }
  return this;
};
Sql.prototype.load_fk = function (fk_name, select_names, ...varargs) {
  const fk = this.model.foreign_keys[fk_name];
  if (fk === undefined) {
    throw new Error(fk_name + (" is not a valid forein key name for " + this.table_name));
  }
  const fk_model = fk.reference;
  if (!this._load_fk) {
    this._load_fk = {};
  }
  this._load_fk[fk_name] = fk_model;
  this.select(fk_name);
  if (!select_names) {
    return this;
  }
  const fks = [];
  if (Array.isArray(select_names)) {
    for (const fkn of select_names) {
      fks.push(`${fk_name}__${fkn}`);
    }
  } else if (select_names === "*") {
    for (const fkn of fk_model.field_names) {
      fks.push(`${fk_name}__${fkn}`);
    }
  } else if (typeof select_names === "string") {
    for (const fkn of [select_names, ...varargs]) {
      fks.push(`${fk_name}__${fkn}`);
    }
  } else {
    throw new Error(`invalid argument type ${typeof select_names} for load_fk`);
  }
  return this.select(fks);
};
Sql.prototype.where_recursive = function (name, value, select_names) {
  const fk = this.model.foreign_keys[name];
  if (fk === undefined) {
    throw new Error(name + (" is not a valid forein key name for " + this.table_name));
  }
  const fkc = fk.reference_column;
  const table_name = this.model.table_name;
  const t_alias = table_name + "_recursive";
  const seed_sql = this.model.create_sql().select(fkc, name).where(name, value);
  const join_cond = `${table_name}.${name} = ${t_alias}.${fkc}`;
  const recursive_sql = this.model.create_sql().select(fkc, name)._base_join("INNER", t_alias, join_cond);
  if (select_names) {
    seed_sql.select(select_names);
    recursive_sql.select(select_names);
  }
  this.with_recursive(t_alias, seed_sql.union_all(recursive_sql));
  return this.from(t_alias + (" AS " + table_name));
};

// Model class defination
const DEFAULT_PRIMARY_KEY = "id";
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
const base_model = {
  abstract: true,
  field_names: [DEFAULT_PRIMARY_KEY, "ctime", "utime"],
  fields: {
    [DEFAULT_PRIMARY_KEY]: { type: "integer", primary_key: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", auto_now_add: true },
    utime: { label: "更新时间", type: "datetime", auto_now: true },
  },
};
const API_TABLE_NAMES = { T: true, D: true, U: true, V: true };
function check_reserved(name) {
  assert(typeof name === "string", `name must be string, not ${typeof name} (${name})`);
  assert(!name.includes("__"), "don't use __ in a table or column name");
  assert(
    !IS_PG_KEYWORDS[name.toUpperCase()],
    `${name} is a postgresql reserved word, can't be used as a table or column name`,
  );
  assert(!API_TABLE_NAMES[name], "don't use " + (name + " as a table or column name"));
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
function make_record_meta(ModelClass) {
  class RecordClass extends Object {
    constructor(data) {
      super(data);
      for (const [k, v] of Object.entries(data)) {
        this[k] = v;
      }
      return this;
    }
  }
  Object.defineProperty(RecordClass, "name", {
    value: `${ModelClass.name}Record`,
  });
  RecordClass.prototype.delete = async function (key) {
    key = ModelClass.check_unique_key(key || ModelClass.primary_key);
    if (this[key] === undefined) {
      throw new Error("empty value for delete key:" + key);
    }
    return await ModelClass.create_sql()
      .delete({ [key]: this[key] })
      .returning(key)
      .exec();
  };
  RecordClass.prototype.save = async function (names, key) {
    return await ModelClass.save(this, names, key);
  };
  RecordClass.prototype.save_create = async function (names, key) {
    return await ModelClass.save_create(this, names, key);
  };
  RecordClass.prototype.save_update = async function (names, key) {
    return await ModelClass.save_update(this, names, key);
  };
  RecordClass.prototype.validate = async function (names, key) {
    return await ModelClass.validate(this, names, key);
  };
  RecordClass.prototype.validate_update = async function (names) {
    return await ModelClass.validate_update(this, names);
  };
  RecordClass.prototype.validate_create = async function (names) {
    return await ModelClass.validate_create(this, names);
  };
  return RecordClass;
}

function create_model_proxy(ModelClass) {
  return new Proxy(ModelClass, {
    get(obj, k) {
      if (ModelClass[k]) {
        return ModelClass[k];
      }
      const sql_k = Sql.prototype[k];
      if (typeof sql_k === "function") {
        return function (...varargs) {
          return sql_k.call(ModelClass.create_sql(), ...varargs);
        };
      }
    },
    set(obj, prop, value) {
      obj[prop] = value;
    },
  });
}

class Xodel {
  static ValidateError = ValidateError;
  static ValidateBatchError = ValidateBatchError;
  static base_model = base_model;
  static DEFAULT_PRIMARY_KEY = DEFAULT_PRIMARY_KEY;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static token = make_token;
  static as_token = as_token;
  static as_literal = as_literal;
  static http_model_cache = {};
  toString() {
    return `Model[${this.name}]`;
  }
}
Xodel.set_class_name = function (table_name) {
  Object.defineProperty(this, "name", {
    value: `${capitalize(table_name)}Model`,
  });
};
Xodel.get_defaults = function () {
  return Object.fromEntries(this.names.map((k) => [k, this.fields[k].default]));
};
Xodel.to_form_value = function (values, names) {
  const res = {};
  for (const name of names || this.field_names) {
    const field = this.fields[name];
    if (!field) {
      throw `invalid name ${name}`;
    }
    const value = field.to_form_value(values[name], values);
    if (value !== undefined) {
      res[name] = value;
    }
  }
  return res;
};
Xodel.to_post_value = function (values, names) {
  const data = {};
  for (const name of names || this.field_names) {
    const field = this.fields[name];
    const value = field.to_post_value(values[name], values);
    if (value !== undefined) {
      // 为了modelform的{...values, ...model.to_post_value(formdata)}不会把values覆盖掉
      data[name] = value;
    }
  }
  return data;
};
Xodel._resolve_choices_url = async function ({ field, options, fetch }) {
  const fetch_choices = async (opts = {}) => {
    const choices_url = field.choices_url;
    const keyword = opts.keyword;
    const suffix = `${choices_url.includes("?") ? "&" : "?"}${field.keyword_query_name}=${keyword}`;
    const url = choices_url + (keyword ? suffix : "");
    const { data: choices } = await this.Http[field.choices_url_method || "post"](url);
    const res = options.choices_callback ? options.choices_callback(choices, field) : choices;
    return res;
  };
  if (field.preload || fetch) {
    field.choices = await fetch_choices();
  } else {
    field.choices = fetch_choices;
  }
};
Xodel.create_model_async = async function (options) {
  if (typeof options == "string") {
    const { data } = await this.Http.get(options);
    options = data;
  }
  for (const name of options.field_names || Object.keys(options.fields)) {
    const field = options.fields[name];
    if (field.type == "array") {
      if (field.field) {
        // dynamic array
        if (field.field.choices_url && !field.field.choices) {
          await this._resolve_choices_url({ field: field.field, options, fetch: true });
        }
      } else if (field.choices_url && !field.choices) {
        // static array (checkbox)
        await this._resolve_choices_url({ field, options, fetch: true });
      }
    } else if (field.type == "foreignkey") {
      if (field.choices_url && !field.choices) {
        await this._resolve_choices_url({ field, options });
      }
      if (typeof field.reference == "string") {
        if (field.reference == field.table_name) {
          field.reference = "self";
        } else {
          const model_url = field.reference_url || field.reference;
          field.reference = await this.get_http_model(model_url);
        }
      }
    } else if (field.type == "table") {
      if (!field.model.__is_model_class__) {
        const model_key = field.model.table_name;
        if (!this.http_model_cache[model_key]) {
          this.http_model_cache[model_key] = await Xodel.create_model_async(field.model);
        }
        field.model = this.http_model_cache[model_key];
      }
    } else {
      if (field.choices_url && !field.choices) {
        await this._resolve_choices_url({ field, options });
      }
    }
  }
  return this.create_model(options);
};
Xodel.get_http_model = async function (model_key) {
  if (!this.http_model_cache[model_key]) {
    const model_url = model_key.match(/^https?:/) || model_key.match(/^\//) ? model_key : `/admin/model/${model_key}`;
    const { data } = await this.Http.get(model_url);
    this.http_model_cache[model_key] = await Xodel.create_model_async(data);
  } else {
    console.log("cached:" + model_key);
  }
  return this.http_model_cache[model_key];
};
Xodel.create_model = function (options) {
  return this._make_model_class(this.normalize(options));
};
Xodel.create_sql = function () {
  return Sql.new({ model: this, table_name: this.table_name }).as("T");
};
Xodel.create_sql_as = function (table_name, rows) {
  const alias_sql = Sql.new({ model: this, table_name }).as(table_name);
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
  if (
    name !== "name" &&
    name !== "apply" &&
    name !== "call" &&
    (Object.prototype.hasOwnProperty.call(this, name) || Object.prototype.hasOwnProperty.call(this.prototype, name))
  ) {
    throw new Error(`field name '${name}' conflicts with model class attributes`);
  }
};
Xodel._make_model_class = function (opts) {
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
    static auto_primary_key = opts.auto_primary_key == undefined ? false : Xodel.auto_primary_key;
    static referenced_label_column = opts.referenced_label_column;
    static preload = opts.preload;
    constructor(data) {
      super(data);
      return ModelClass.create_record(data);
    }
  }
  if (ModelClass.preload === undefined) {
    ModelClass.preload = true;
  }
  if (opts.db_options) {
    ModelClass.query = Xodel.Query(opts.db_options);
  } else if (this.db_options) {
    ModelClass.query = Xodel.Query(this.db_options);
  } else if (process.env.NODE_ENV !== "production" && Xodel.Query) {
    // https://www.npmjs.com/package/postgres#connection-details
    const default_query = Xodel.Query({
      host: getenv("PGHOST") || "127.0.0.1",
      port: getenv("PGPORT") || 5432,
      database: getenv("PGDATABASE") || "test",
      user: getenv("PGUSER") || "postgres",
      password: getenv("PGPASSWORD") || "postgres",
      idle_timeout: getenv("PG_IDLE_TIMEOUT") || 20,
      connect_timeout: getenv("PG_CONNECT_TIMEOUT") || 2,
    });
    ModelClass.query = default_query;
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
      if (!field.serial) {
        ModelClass.names.push(pk_name);
      }
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
  const proxy = create_model_proxy(ModelClass);
  Xodel.resolve_self_foreignkey.call(proxy);
  return proxy;
};
const EXTEND_ATTRS = ["table_name", "label", "referenced_label_column", "preload"];
Xodel.normalize = function (options) {
  const _extends = options.extends;
  const model = {
    admin: clone(options.admin || {}),
  };
  for (const extend_attr of EXTEND_ATTRS) {
    if (options[extend_attr] === undefined) {
      if (options.extends) {
        model[extend_attr] = options.extends[extend_attr];
      }
    } else {
      model[extend_attr] = options[extend_attr];
    }
  }
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
    } else if (_extends && _extends.fields[name]) {
      // !(field instanceof Fields.basefield) &&
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
Xodel.make_field_from_json = function (options) {
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
  res.get_model = () => this;
  return res;
};
Xodel.set_label_name_dict = function () {
  this.label_to_name = {};
  this.name_to_label = {};
  for (const [name, field] of Object.entries(this.fields)) {
    this.label_to_name[field.label] = name;
    this.name_to_label[name] = field.label;
  }
};
const compound_types = {
  array: true,
  json: true,
  table: true,
  password: true,
  text: true,
  alioss_list: true,
  alioss_image_list: true,
};
function get_admin_list_names(model) {
  const names = [];
  for (const name of model.names) {
    const field = model.fields[name];
    if (!compound_types[field.type]) {
      names.push(name);
    }
  }
  return names;
}
Xodel.ensure_admin_list_names = function () {
  this.admin.list_names = clone(this.admin.list_names || []);
  if (this.admin.list_names.length === 0) {
    this.admin.list_names = get_admin_list_names(this);
  }
};
Xodel.ensure_ctime_list_names = function (ctime_name) {
  const admin = assert(this.admin);
  if (!admin.list_names.includes(ctime_name)) {
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
  return this._make_model_class(this.merge_models([...varargs]));
};
Xodel.merge_models = function (models) {
  if (models.length < 2) {
    throw new Error("provide at least two models to merge");
  } else if (models.length === 2) {
    return this.merge_model(...models);
  } else {
    let merged = models[0];
    for (let i = 1; i < models.length; i = i + 1) {
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
  return this.make_field_from_json(options);
};
Xodel.to_json = function (names) {
  if (!names) {
    return {
      table_name: this.table_name,
      class_name: this.class_name,
      primary_key: this.primary_key,
      admin: clone(this.admin),
      unique_together: clone(this.unique_together),
      label: this.label || this.table_name,
      names: clone(this.names),
      field_names: clone(this.field_names),
      label_to_name: clone(this.label_to_name),
      name_to_label: clone(this.name_to_label),
      fields: Object.fromEntries(this.field_names.map((name) => [name, this.fields[name].json()])),
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
      fields: fields,
    };
  }
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
  const all_columns_token = as_token(unique([...(columns || [this.primary_key]), ...insert_columns]));
  const insert_sql = `(INSERT INTO ${this.table_name}(${insert_columns_token}) SELECT ${as_literal_without_brackets(
    values_list,
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
  const uk = key || this.primary_key;
  // TODO: need check recursive here. lua code: rawget(input, key)
  if (input[uk] !== undefined) {
    return await this.save_update(input, names, uk);
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
      `expect 1 but ${updated.length} records are updated(model:${this.table_name}, key:${key}, value:${look_value})`,
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
  if (!this.clean) {
    return data;
  } else {
    return this.clean(data);
  }
};
Xodel.validate_update = function (input, names) {
  const data = {};
  // let value;
  for (const name of names || this.names) {
    const field = this.fields[name];
    if (!field) {
      throw new Error(`invalid field name '${name}' for model '${this.table_name}'`);
    }
    let value = input[name];
    if (value !== undefined) {
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
          return this.make_field_error({
            name: key,
            message: key + "不能为空",
            batch_index: i,
          });
        }
      }
    } else {
      for (const [i, row] of rows.entries()) {
        for (const k of key) {
          if (row[k] === undefined || row[k] === "") {
            return this.make_field_error({
              name: k,
              message: k + "不能为空",
              batch_index: i,
            });
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
Xodel.make_field_error = function ({ name, message, index, batch_index, value }) {
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
    cleaned = [];
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
  } else {
    cleaned = this.validate_create(rows, columns);
  }
  return [cleaned, columns];
};
Xodel.validate_update_data = function (rows, columns) {
  let cleaned;
  columns = columns || this.names;
  if (rows instanceof Array) {
    cleaned = [];
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
  } else {
    cleaned = this.validate_update(rows, columns);
  }
  return [cleaned, columns];
};
Xodel.validate_create_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key);
  const [cleaned_rows, cleaned_columns] = this.validate_create_data(checked_rows, columns);
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.validate_update_rows = function (rows, key, columns) {
  const [checked_rows, checked_key] = this.check_upsert_key(rows, key);
  const [cleaned_rows, cleaned_columns] = this.validate_update_data(checked_rows, columns);
  return [cleaned_rows, checked_key, cleaned_columns];
};
Xodel.prepare_db_rows = function (rows, columns, is_update) {
  let cleaned;
  columns = columns || get_keys(rows);
  if (rows instanceof Array) {
    cleaned = [];
    for (const [i, row] of rows.entries()) {
      try {
        cleaned[i] = this.prepare_for_db(row, columns, is_update);
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
  const records = this.create_sql().load_fk_labels().where(kwargs);
  return await records.exec();
};
Xodel.create_record = function (data) {
  return new this.RecordClass(data);
};
const whitelist = {
  new: true,
};
for (const [k, v] of Object.entries(Sql)) {
  if (typeof v === "function" && !whitelist[k]) {
    assert(Xodel[k] === undefined, "same function name appears:" + k);
  }
}
export const Model = Xodel;
export default Xodel;
