/* eslint-disable no-constant-condition */
import {
  PG_OPERATORS,
  clone,
  assert,
  next,
  NULL,
  DEFAULT,
  as_token,
  as_literal,
  as_literal_without_brackets,
  get_keys,
  string_format,
  _prefix_with_V,
  get_foreign_object,
  smart_quote,
} from "./utils.mjs";
import F from "./F.mjs";

const encode = JSON.stringify;

const json_operators = {
  eq: true,
  has_key: true,
  has_keys: true,
  contains: true,
  contained_by: true,
  has_any_keys: true,
};
const NON_OPERATOR_CONTEXTS = {
  select: true,
  returning: true,
  aggregate: true,
  group_by: true,
  order_by: true,
  distinct: true,
};
const PG_SET_MAP = {
  _union: "UNION",
  _union_all: "UNION ALL",
  _except: "EXCEPT",
  _except_all: "EXCEPT ALL",
  _intersect: "INTERSECT",
  _intersect_all: "INTERSECT ALL",
};
const EXPR_OPERATORS = {
  eq: (key, value) => `${key} = ${as_literal(value)}`,
  lt: (key, value) => `${key} < ${as_literal(value)}`,
  lte: (key, value) => `${key} <= ${as_literal(value)}`,
  gt: (key, value) => `${key} > ${as_literal(value)}`,
  gte: (key, value) => `${key} >= ${as_literal(value)}`,
  ne: (key, value) => `${key} <> ${as_literal(value)}`,
  ["in"]: (key, value) => `${key} IN ${as_literal(value)}`,
  notin: (key, value) => `${key} NOT IN ${as_literal(value)}`,
  contains: (key, value) => `${key} LIKE '%${value.gsub("'", "''")}%'`,
  icontains: (key, value) => `${key} ILIKE '%${value.gsub("'", "''")}%'`,
  startswith: (key, value) => `${key} LIKE '${value.gsub("'", "''")}%'`,
  istartswith: (key, value) => `${key} ILIKE '${value.gsub("'", "''")}%'`,
  endswith: (key, value) => `${key} LIKE '%${value.gsub("'", "''")}'`,
  iendswith: (key, value) => `${key} ILIKE '%${value.gsub("'", "''")}'`,
  range: (key, value) => `${key} BETWEEN ${as_literal(value[0])} AND ${as_literal(value[1])}`,
  year: (key, value) => `${key} BETWEEN '${value}-01-01' AND '${value}-12-31'`,
  month: (key, value) => `EXTRACT('month' FROM ${key}) = '${value}'`,
  day: (key, value) => `EXTRACT('day' FROM ${key}) = '${value}'`,
  regex: (key, value) => `${key} ~ '%${value.gsub("'", "''")}'`,
  iregex: (key, value) => `${key} ~* '%${value.gsub("'", "''")}'`,
  null: function (key, value) {
    if (value) {
      return `${key} IS NULL`;
    } else {
      return `${key} IS NOT NULL`;
    }
  },
  isnull: function (key, value) {
    if (value) {
      return `${key} IS NULL`;
    } else {
      return `${key} IS NOT NULL`;
    }
  },
  has_key: (key, value) => `(${key}) ? ${value}`,
  has_keys: (key, value) => `(${key}) ?& [${as_literal_without_brackets(value)}]`,
  has_any_keys: (key, value) => `(${key}) ?| [${as_literal_without_brackets(value)}]`,
  json_contains: (key, value) => `(${key}) @> '${encode(value)}'`,
  json_eq: (key, value) => `(${key}) = '${encode(value)}'`,
  contained_by: (key, value) => `(${key}) <@ '${encode(value)}'`,
};
const extract_column_name = (sql_part) => {
  // 1. T.col, user.name 格式
  const table_column_match = sql_part.match(/^(\w+)\.(\w+)$/);
  if (table_column_match) {
    return table_column_match[2]; // 返回列名部分
  }

  // 2. T.col AS alias, col AS alias 格式
  const alias_match = sql_part.match(/[Aa][Ss]\s+(\w+)\s*$/);
  if (alias_match) {
    return alias_match[1]; // 返回别名
  }

  // 3. 忽略函数调用（包含括号的情况）
  if (sql_part.match(/\([^)]*\)/)) {
    return null;
  }

  // 4. 直接的列名
  const direct_column_match = sql_part.match(/^(\w+)$/);
  return direct_column_match ? direct_column_match[1] : null;
};
function extract_column_names(sql_text) {
  const columns = [];
  const parts = sql_text.split(", ");
  for (const part of parts) {
    const col = extract_column_name(part);
    if (col) {
      columns.push(col);
    }
  }
  return columns;
}

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
  if (opts[key] && opts[key] !== "") {
    froms = [opts[key]];
  } else {
    froms = [];
  }
  let wheres;
  if (opts.where && opts.where !== "") {
    wheres = [opts.where];
  } else {
    wheres = [];
  }
  if (opts.join_args) {
    for (const [i, args] of opts.join_args.entries()) {
      if (i === 1) {
        froms.push(args[1] + (" AS " + args[2]));
        wheres.push(args[3]);
      } else {
        froms.push(`${args[0]} JOIN ${args[1] + (" " + args[2])} ON (${args[3]})`);
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
      froms.push(`${args[0]} JOIN ${args[1] + (" " + args[2])} ON (${args[3]})`);
    }
  }
  return froms.join(" ");
}
function assemble_sql(opts) {
  let statement;
  if (opts.update) {
    const [from, where] = get_join_table_condition(opts, "from");
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    let table_name;
    if (opts.as) {
      table_name = opts.table_name + (" " + opts.as);
    } else {
      table_name = opts.table_name;
    }
    statement = `UPDATE ${table_name} SET ${opts.update}${
      (from && " FROM " + from) || ""
    }${(where && " WHERE " + where) || ""}${returning}`;
  } else if (opts.insert) {
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    let table_name;
    if (opts.as) {
      table_name = opts.table_name + (" AS " + opts.as);
    } else {
      table_name = opts.table_name;
    }
    statement = `INSERT INTO ${table_name} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    const [using, where] = get_join_table_condition(opts, "using");
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    let table_name;
    if (opts.as) {
      table_name = opts.table_name + (" " + opts.as);
    } else {
      table_name = opts.table_name;
    }
    statement = `DELETE FROM ${table_name}${
      (using && " USING " + using) || ""
    }${(where && " WHERE " + where) || ""}${returning}`;
  } else {
    let from;
    if (opts.from) {
      from = opts.from;
    } else if (opts.as) {
      from = opts.table_name + (" " + opts.as);
    } else {
      from = opts.table_name;
    }
    from = get_join_table_condition_select(opts, from);
    const where = (opts.where && " WHERE " + opts.where) || "";
    const group = (opts.group && " GROUP BY " + opts.group) || "";
    const having = (opts.having && " HAVING " + opts.having) || "";
    const order = (opts.order && " ORDER BY " + opts.order) || "";
    const limit = (opts.limit && " LIMIT " + opts.limit) || "";
    const offset = (opts.offset && " OFFSET " + opts.offset) || "";
    const distinct =
      (opts.distinct && "DISTINCT ") ||
      (opts.distinct_on && `DISTINCT ON(${opts.distinct_on}) `) ||
      "";
    const select = opts.select || "*";
    // eslint-disable-next-line max-len
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

function debug(...varargs) {
  if (process.env.DEBUG === "on") {
    console.log(...varargs);
  }
}

class Sql {
  static as_token = as_token;
  static as_literal = as_literal;
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
Sql.prototype.__tostring = function () {
  return this.statement();
};
Sql.prototype._keep_args = function (method_name, ...varargs) {
  if (this[method_name]) {
    this[method_name] = [this[method_name], ...varargs];
  } else {
    this[method_name] = [...varargs];
  }
  return this;
};
Sql.prototype._base_insert = function (rows, columns) {
  if (rows instanceof Sql) {
    if (rows._returning) {
      this._set_cud_subquery_insert_token(rows, columns);
    } else if (rows._select) {
      this._set_select_subquery_insert_token(rows, columns);
    } else {
      throw new Error(
        "select or returning args should be provided when inserting from a sub query",
      );
    }
  } else if (Array.isArray(rows)) {
    this._insert = this._get_bulk_insert_token(rows, columns);
  } else {
    this._insert = this._get_insert_token(rows, columns);
  }
  return this;
};
Sql.prototype._base_update = function (row, columns) {
  if (typeof row === "object") {
    this._update = this._get_update_token(row, columns);
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
  if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype._get_cte_values_literal = function (rows, columns, no_check) {
  rows = this._rows_to_array(rows, columns);
  const res = [this._array_to_values(rows[0], columns, no_check, true)];
  for (let i = 2; i <= rows.length; i = i + 1) {
    res[i] = this._array_to_values(rows[i], columns, no_check, false);
  }
  return res;
};
Sql.prototype._base_merge = function (rows, key, columns) {
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(this._get_cte_values_literal(rows, columns))})`;
  const join_cond = this._get_join_condition_from_key(key, "V", "W");
  const vals_columns = columns.map(_prefix_with_V);
  const insert_subquery = Sql.new({
    table_name: "V",
    _where: `W.${key[0] || key} IS NULL`,
  })
    ._base_select(vals_columns)
    ._base_join_raw("LEFT", "U AS W", join_cond);
  let intersect_subquery;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    intersect_subquery = Sql.new({ table_name: "V" })
      ._base_select(vals_columns)
      ._base_join_raw("INNER", this.table_name + " AS W", join_cond);
  } else {
    intersect_subquery = Sql.new({ table_name: this.table_name, _as: "W" })
      ._base_update(this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond)
      ._base_returning(vals_columns);
  }
  this.with(cte_name, cte_values).with("U", intersect_subquery);
  return Sql.prototype._base_insert.call(this, insert_subquery, columns);
};
Sql.prototype._base_upsert = function (rows, key, columns) {
  assert(key, "you must provide key (string or table) for upsert");
  if (rows instanceof Sql) {
    if (rows._returning) {
      this._set_cud_subquery_upsert_token(rows, key, columns);
    } else if (rows._select) {
      this._set_select_subquery_upsert_token(rows, key, columns);
    } else {
      throw new Error(
        "select or returning args should be provided when inserting from a sub query",
      );
    }
  } else if (Array.isArray(rows)) {
    this._insert = this._get_bulk_upsert_token(rows, key, columns);
  } else {
    this._insert = this._get_upsert_token(rows, key, columns);
  }
  return this;
};
Sql.prototype._base_updates = function (rows, key, columns) {
  if (rows instanceof Sql) {
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
    rows = this._get_cte_values_literal(rows, columns);
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
  if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  return this;
};
Sql.prototype._base_from = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (!this._from) {
    this._from = s;
  } else {
    this._from = this._from + (", " + s);
  }
  return this;
};
Sql.prototype._base_using = function (...varargs) {
  const s = get_list_tokens(...varargs);
  if (!this._using) {
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
  }
};
Sql.prototype._handle_manual_join = function (join_type, fk_model, callback, join_key) {
  this._ensure_context();
  if (!this._join_args) {
    this._join_args = [];
  }
  if (!this._join_keys) {
    this._join_keys = {};
  }
  const right_alias = "T" + this._join_proxy_models.length;
  const proxy = this._create_join_proxy(fk_model, right_alias);
  this._join_proxy_models[this._join_proxy_models.length + 1] = proxy;
  this._join_proxy_models[join_key || right_alias] = proxy;
  this._join_alias[this._join_alias.length + 1] = right_alias;
  this._join_keys[join_key || right_alias] = right_alias;
  const join_conds = callback(this._join_proxy_models);
  this._join_args[this._join_args.length + 1] = [
    join_type,
    fk_model._table_name_token,
    right_alias,
    join_conds,
  ];
  return this._join_alias[this._join_alias.length];
};
Sql.prototype._base_join = function (join_type, join_args, key, op, val) {
  if (typeof join_args === "object") {
    this._handle_manual_join(join_type, join_args, key);
    return this;
  } else {
    const fk = this.model.foreignkey_fields[join_args];
    if (fk) {
      return this._base_join(
        "INNER",
        fk.reference,
        (ctx) =>
          `${ctx[this.model.table_name][join_args]} = ${
            ctx[fk.reference.table_name][fk.reference_column]
          }`,
      );
    } else {
      return this._base_join_raw(join_type, join_args, key, op, val);
    }
  }
};
Sql.prototype._base_where = function (cond, op, dval) {
  const where_token = this._base_get_condition_token(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype._get_in_token = function (cols, op, range) {
  if (range instanceof Sql) {
    return `(${as_token(cols)}) ${op} (${range.statement()})`;
  } else {
    return `(${as_token(cols)}) ${op} ${as_literal(range)}`;
  }
};
Sql.prototype._base_where_in = function (cols, range) {
  const in_token = this._get_in_token(cols, "IN", range);
  if (this._where) {
    this._where = `(${this._where}) AND ${in_token}`;
  } else {
    this._where = in_token;
  }
  return this;
};
Sql.prototype.where_in = function (cols, range) {
  if (typeof cols === "string") {
    return Sql.prototype._base_where_in.call(this, this._parse_column(cols), range);
  } else {
    const res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._parse_column(cols[i]);
    }
    return Sql.prototype._base_where_in.call(this, res, range);
  }
};
Sql.prototype._base_where_not_in = function (cols, range) {
  const not_in_token = this._get_in_token(cols, "NOT IN", range);
  if (this._where) {
    this._where = `(${this._where}) AND ${not_in_token}`;
  } else {
    this._where = not_in_token;
  }
  return this;
};
Sql.prototype.where_not_in = function (cols, range) {
  if (typeof cols === "string") {
    return Sql.prototype._base_where_not_in.call(this, this._parse_column(cols), range);
  } else {
    const res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._parse_column(cols[i]);
    }
    return Sql.prototype._base_where_not_in.call(this, res, range);
  }
};
Sql.prototype._base_get_condition_token = function (cond, op, dval) {
  if (op === undefined) {
    const argtype = typeof cond;
    if (argtype === "object") {
      return Sql.prototype._base_get_condition_token_from_table.call(this, cond);
    } else if (argtype === "string") {
      return cond;
    } else if (argtype === "function") {
      return cond(this._join_proxy_models);
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
    return tokens.join(" " + (logic + " "));
  }
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
    const sets = [];
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
Sql.prototype._get_column_tokens = function (context, a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = this._get_column_token(a[i], context);
      }
      return as_token(tokens);
    } else if (typeof a === "string") {
      return this._get_column_token(a, context);
    } else if (typeof a === "function") {
      const select_callback_args = a(this._join_proxy_models);
      if (typeof select_callback_args === "string") {
        return select_callback_args;
      } else if (typeof select_callback_args === "object") {
        return select_callback_args.join(", ");
      } else {
        throw new Error("wrong type:" + typeof select_callback_args);
      }
    } else {
      return as_token(a);
    }
  } else {
    const res = [];
    for (const name of [a, b, ...varargs]) {
      res.push(as_token(this._get_column_token(name, context)));
    }
    return res.join(", ");
  }
};
Sql.prototype._get_select_literal = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = as_literal(a[i]);
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
      if (v !== undefined) {
        kv.push(`${k} = ${as_literal(v)}`);
      }
    }
  }
  return kv.join(", ");
};
Sql.prototype._get_with_token = function (name, token) {
  if (typeof token === "string") {
    return `${name} AS ${token}`;
  } else {
    return `${name} AS (${token.statement()})`;
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
  let insert_columns = columns;
  if (!insert_columns) {
    if (!subsql._select) {
      throw new Error("subquery must have select clause");
    }
    insert_columns = extract_column_names(subsql._select);
  }
  const columns_token = as_token(insert_columns);
  this._insert = `(${columns_token}) ${subsql.statement()}`;
};
Sql.prototype._set_cud_subquery_insert_token = function (subsql, columns) {
  let returning_columns = columns;
  if (!returning_columns) {
    if (!subsql._returning) {
      throw new Error("subquery must have returning clause");
    }
    returning_columns = extract_column_names(subsql._returning);
  }
  const columns_token = as_token(returning_columns);
  const cudsql = Sql.new({ table_name: "D", _select: columns_token });
  this.with(`D(${columns_token})`, subsql);
  this._insert = `(${columns_token}) ${cudsql.statement()}`;
};
Sql.prototype._get_upsert_token = function (row, key, columns) {
  const [values_list, insert_columns] = this._get_insert_values_token(row, columns);
  const insert_token = `(${as_token(insert_columns)}) VALUES ${as_literal(
    values_list,
  )} ON CONFLICT (${as_token(key)})`;
  if (
    (typeof key === "object" && key.length === insert_columns.length) ||
    insert_columns.length === 1
  ) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(
      insert_columns,
      key,
      "EXCLUDED",
    )}`;
  }
};
Sql.prototype._get_bulk_upsert_token = function (rows, key, columns) {
  [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
  const insert_token = `(${as_token(columns)}) VALUES ${as_token(
    rows,
  )} ON CONFLICT (${as_token(key)})`;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(
      columns,
      key,
      "EXCLUDED",
    )}`;
  }
};
Sql.prototype._set_select_subquery_upsert_token = function (rows, key, columns) {
  const insert_token = `(${as_token(columns)}) ${rows.statement()} ON CONFLICT (${as_token(key)})`;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    this._insert = `${insert_token} DO NOTHING`;
  } else {
    this._insert = `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(
      columns,
      key,
      "EXCLUDED",
    )}`;
  }
};
Sql.prototype._set_cud_subquery_upsert_token = function (rows, key, columns) {
  const cte_name = `V(${columns.join(", ")})`;
  this.with(cte_name, rows);
  const insert_token = `(${as_token(columns)}) ${Sql.new({
    table_name: "V",
    _select: as_token(columns),
  }).statement()} ON CONFLICT (${as_token(key)})`;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    this._insert = `${insert_token} DO NOTHING`;
  } else {
    this._insert = `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(
      columns,
      key,
      "EXCLUDED",
    )}`;
  }
};
Sql.prototype._base_get_update_query_token = function (subquery, columns) {
  const columns_token = as_token(columns || extract_column_names(subquery._select));
  return `(${columns_token}) = (${subquery.statement()})`;
};
Sql.prototype._get_join_condition_from_key = function (key, A, B) {
  if (typeof key === "string") {
    return `${A}.${key} = ${B}.${key}`;
  }
  const res = [];
  for (const k of key) {
    res.push(`${A}.${k} = ${B}.${k}`);
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
Sql.prototype._get_column_token = function (key, context) {
  const field = this.model.fields[key];
  if (field) {
    const column_token = field._column_token || smart_quote(key);
    if (this._as) {
      return this._as + ("." + column_token);
    } else {
      return this.model._table_name_token + ("." + column_token);
    }
  } else if (typeof key !== "string" || key === "*") {
    return key;
  } else {
    const column = this._parse_column(key, context);
    if (context === "select" || context === "returning") {
      return column + (" AS " + smart_quote(key));
    } else {
      return column;
    }
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
    tokens.push(this._get_expr_token(value, this._parse_column(k)));
  }
  if (logic === undefined) {
    return tokens.join(" AND ");
  } else {
    return tokens.join(" " + (logic + " "));
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
    return `${this._parse_column(cond, "select")} = ${as_literal(op)}`;
  } else {
    assert(PG_OPERATORS[op.upper()], "invalid PostgreSQL operator: " + op);
    return `${this._parse_column(cond, "select")} ${op} ${as_literal(dval)}`;
  }
};
Sql.prototype._get_having_condition_token = function (cond) {
  if (cond.__IS_LOGICAL_BUILDER__) {
    return this._resolve_Q(cond, "having");
  }
  const tokens = [];
  for (const [key, value] of Object.entries(cond)) {
    tokens.push(this._get_expr_token(value, this._parse_having_column(key)));
  }
  return tokens.join(" AND ");
};
Sql.prototype._handle_set_operation = function (other_sql, set_operation_attr) {
  if (!this[set_operation_attr]) {
    this[set_operation_attr] = other_sql.statement();
  } else {
    this[set_operation_attr] = `(${this[set_operation_attr]}) ${
      PG_SET_MAP[set_operation_attr]
    } (${other_sql.statement()})`;
  }
  this._set_operation = true;
  return this;
};
Sql.prototype._resolve_F = function (value) {
  if (typeof value === "object" && value.__IS_FIELD_BUILDER__) {
    const exp_token = this._resolve_field_builder(value);
    return () => exp_token;
  }
  return value;
};
Sql.prototype._get_bulk_key = function (columns) {
  if (this.model.unique_together && this.model.unique_together[0]) {
    return clone(this.model.unique_together[0]);
  }
  for (const name of columns || this.model.names) {
    const f = this.model.fields[name];
    if (f && f.unique) {
      return name;
    }
  }
  const pk = this.model.primary_key;
  return pk;
};
Sql.prototype._clean_bulk_params = function (rows, key, columns, is_update) {
  if (!Array.isArray(rows)) {
    rows = [rows];
  } else if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  if (columns === undefined) {
    columns = get_keys(rows, (is_update && [this.model.auto_now_name]) || []);
    if (columns.length === 0) {
      throw new Error("no columns provided for bulk");
    }
  }
  if (key === undefined) {
    key = this._get_bulk_key((is_update && columns) || undefined);
  }
  if (typeof key === "string") {
    assert(this.model.fields[key], "invalid key for bulk operation: " + key);
    if (!Array.includes(columns, key)) {
      columns = [key, ...columns];
    }
  } else if (typeof key === "object") {
    for (const k of key) {
      assert(this.model.fields[k], "invalid key for bulk operation: " + k);
      if (!Array.includes(columns, k)) {
        columns = [k, ...columns];
      }
    }
  } else {
    throw new Error("invalid key type for bulk:" + typeof key);
  }
  return [rows, key, columns];
};
Sql.prototype._get_expr_token = function (value, key, op) {
  value = this._resolve_F(value);
  const handler = EXPR_OPERATORS[op];
  if (!handler) {
    throw new Error("invalid sql op: " + String(op));
  }
  return handler(key, value);
};
Sql.prototype._get_order_column = function (key) {
  if (typeof key !== "string") {
    return key;
  } else {
    const [a, b] = key.match("^([-+]?)([%w_]+)$");
    if (a || b) {
      return `${this._parse_column(b, "order_by")} ${(a === "-" && "DESC") || "ASC"}`;
    } else {
      throw new Error(`invalid order arg format: ${key}`);
    }
  }
};
Sql.prototype._get_order_columns = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = this._get_order_column(a[i]);
      }
      return as_token(tokens);
    } else if (typeof a === "string") {
      return this._get_order_column(a);
    } else if (typeof a === "function") {
      const select_callback_args = a(this._join_proxy_models);
      if (typeof select_callback_args === "string") {
        return select_callback_args;
      } else if (typeof select_callback_args === "object") {
        return select_callback_args.join(", ");
      } else {
        throw new Error("wrong type:" + typeof select_callback_args);
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
Sql.prototype._resolve_Q = function (q, context) {
  if (q.logic === "NOT") {
    return `NOT (${this._resolve_Q(q.left)})`;
  } else if (q.left && q.right) {
    const left_token = this._resolve_Q(q.left);
    const right_token = this._resolve_Q(q.right);
    return `(${left_token}) ${q.logic} (${right_token})`;
  } else if (context === undefined || context === "where") {
    return this._get_condition_token_from_table(q.cond, q.logic);
  } else if (context === "having") {
    return this._get_having_condition_token(q.cond);
  } else {
    throw new Error("invalid context: " + String(context));
  }
};
Sql.prototype._base_gets = function (keys, columns) {
  columns = columns || get_keys(keys);
  keys = this.model._prepare_db_rows(keys, columns);
  keys = this._get_cte_values_literal(keys, columns);
  const join_cond = this._get_join_condition_from_key(columns, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(keys)})`;
  return this.with(cte_name, cte_values).right_join("V", join_cond);
};
Sql.prototype._array_to_values = function (row, columns, no_check, type_suffix) {
  for (const [i, col] of columns.entries()) {
    const field = this.model.fields[col];
    if (field) {
      if (type_suffix) {
        row[i] = `${as_literal(row[i])}::${field.db_type}`;
      } else {
        row[i] = as_literal(row[i]);
      }
    } else if (no_check) {
      row[i] = as_literal(row[i]);
    } else {
      throw new Error("error constructing cte values literal, invalid field name: " + col);
    }
  }
  return "(" + (as_token(row) + ")");
};
Sql.prototype._parse_column = function (key, context) {
  let i = 1;
  let model = this.model;
  let op = "eq";
  let a,
    b,
    token,
    join_key,
    prefix,
    column,
    final_column,
    last_field,
    last_token,
    last_model,
    last_join_key,
    json_keys;
  while (true) {
    [a, b] = key.find("__", i, true);
    if (!a) {
      token = key.sub(i);
    } else {
      token = key.sub(i, a - 1);
    }
    debug("token", token, this.model.table_name);
    let field = model.fields[token];
    if (field) {
      if (!last_field) {
        debug("1.1", model.class_name, token);
        column = token;
        prefix = this._as || model._table_name_token;
      } else if (json_keys) {
        debug("1.2", model.class_name, token);
        if (json_operators[token]) {
          op = token;
        } else {
          json_keys.push(token);
        }
      } else if (last_model.reversed_fields[last_token]) {
        debug("1.3", model.class_name, token);
        column = token;
      } else if (last_field.reference) {
        if (token === last_field.reference_column) {
          debug("1.4.1", model.class_name, token);
          column = last_token;
          token = last_token;
        } else {
          debug("1.4.2", model.class_name, last_token || "/", token);
          column = token;
          if (!join_key) {
            join_key = last_token;
          } else {
            last_join_key = join_key;
            join_key = join_key + ("__" + last_token);
          }
          if (!this._join_keys) {
            this._join_keys = [];
          }
          prefix = this._join_keys[join_key];
          if (!prefix) {
            const join_cond_cb = (ctx) => {
              const left_column = ctx[last_join_key || 1][last_token];
              if (!left_column) {
                throw new Error(
                  last_token + (" is a invalid column for " + ctx[last_join_key || 1][0]),
                );
              }
              const right_column = ctx[join_key][last_field.reference_column];
              return `${left_column} = ${right_column}`;
            };
            prefix = this._handle_manual_join(
              this._join_type || "INNER",
              model,
              join_cond_cb,
              join_key,
            );
          }
        }
      } else {
        throw new Error("1.5 invalid field name: " + token);
      }
      last_model = model;
      if (field.reference) {
        model = field.reference;
      }
      if (field.model) {
        json_keys = [];
      }
    } else if (this._annotate && this._annotate[token]) {
      debug("2", model.class_name, token);
      final_column = this._annotate[token];
    } else if (json_keys) {
      debug("3", model.class_name, token);
      if (json_operators[token]) {
        op = token;
      } else {
        json_keys.push(token);
      }
    } else {
      const reversed_field = model.reversed_fields[token];
      if (reversed_field) {
        debug("4", model.class_name, token);
        const reversed_model = reversed_field.get_model();
        if (!join_key) {
          join_key = token;
        } else {
          join_key = join_key + ("__" + token);
        }
        if (!this._join_keys) {
          this._join_keys = [];
        }
        prefix = this._join_keys[join_key];
        if (!prefix) {
          const join_cond_cb = (ctx) => {
            let left_model_index;
            if (token === join_key) {
              left_model_index = 1;
            } else {
              left_model_index = ctx.length - 1;
            }
            return `${
              ctx[left_model_index][reversed_field.reference_column]
            } = ${ctx[ctx.length][reversed_field.name]}`;
          };
          let join_type;
          if (context === "aggregate") {
            join_type = "LEFT";
          } else {
            join_type = this._join_type || "INNER";
          }
          prefix = this._handle_manual_join(join_type, reversed_model, join_cond_cb, join_key);
        }
        column = reversed_model.primary_key;
        field = reversed_field;
        last_model = model;
        model = reversed_model;
      } else if (last_token) {
        debug("5", model.class_name, token);
        if (context === undefined || !NON_OPERATOR_CONTEXTS[context]) {
          assert(EXPR_OPERATORS[token], "5.1 invalid operator: " + token);
        } else {
          throw new Error("5.2 invalid column: " + token);
        }
        op = token;
        column = last_token;
        break;
      } else {
        throw new Error("parse column error, invalid name: " + token);
      }
    }
    if (!a) {
      break;
    }
    last_token = token;
    last_field = field;
    i = b + 1;
  }
  if (json_keys) {
    if (json_keys.length > 0) {
      final_column = `${
        prefix + ("." + smart_quote(column))
      } #> [${as_literal_without_brackets(json_keys)}]`;
    }
    if (op === "contains") {
      op = "json_contains";
    } else if (op === "eq") {
      op = "json_eq";
    }
  }
  return [final_column || prefix + ("." + smart_quote(column)), op];
};
Sql.prototype._parse_having_column = function (key) {
  const [a, b] = key.find("__", 1, true);
  if (!a) {
    return [this._get_having_column(key), "eq"];
  }
  const token = key.sub(1, a - 1);
  const op = key.sub(b + 1);
  return [this._get_having_column(token), op];
};
Sql.prototype._get_having_column = function (key) {
  if (this._annotate) {
    const res = this._annotate[key];
    if (res !== undefined) {
      return res;
    }
  }
  throw new Error(`invalid alias for having: '${key}'`);
};
Sql.prototype._resolve_field_builder = function (f) {
  if (typeof f !== "object") {
    return as_literal(f);
  } else if (f.column) {
    return this._parse_column(f.column);
  } else {
    return `(${this._resolve_field_builder(f.left)} ${
      f.operator
    } ${this._resolve_field_builder(f.right)})`;
  }
};
Sql.prototype.prepend = function (...varargs) {
  if (!this._prepend) {
    this._prepend = [];
  }
  const n = varargs.length;
  for (let i = n; i >= 1; i = i + -1) {
    const e = varargs[i];
    this._prepend.unshift(e);
  }
  return this;
};
Sql.prototype.append = function (...varargs) {
  if (!this._append) {
    this._append = [];
  }
  for (const statement of [...varargs]) {
    this._append[this._append.length + 1] = statement;
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
  if (this._set_operation) {
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
  }
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
  return this._handle_set_operation(other_sql, "_union");
};
Sql.prototype.union_all = function (other_sql) {
  return this._handle_set_operation(other_sql, "_union_all");
};
Sql.prototype.except = function (other_sql) {
  return this._handle_set_operation(other_sql, "_except");
};
Sql.prototype.except_all = function (other_sql) {
  return this._handle_set_operation(other_sql, "_except_all");
};
Sql.prototype.intersect = function (other_sql) {
  return this._handle_set_operation(other_sql, "_intersect");
};
Sql.prototype.intersect_all = function (other_sql) {
  return this._handle_set_operation(other_sql, "_intersect_all");
};
Sql.prototype.as = function (table_alias) {
  this._as = smart_quote(table_alias);
  return this;
};
Sql.prototype.with_values = function (name, rows) {
  const columns = get_keys(rows);
  rows = this.model._prepare_db_rows(rows, columns);
  const cte_rows = this._get_cte_values_literal(rows, columns, true);
  const cte_name = `${name}(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(cte_rows)})`;
  return this.with(cte_name, cte_values);
};
Sql.prototype.merge_gets = function (rows, key, columns) {
  columns = columns || get_keys(rows);
  rows = this.model._prepare_db_rows(rows, columns);
  const cte_rows = this._get_cte_values_literal(rows, columns, true);
  const join_cond = this._get_join_condition_from_key(key, "V", this._as || this.table_name);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(cte_rows)})`;
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
  for (const key in this) {
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
Sql.prototype.select = function (a, b, ...varargs) {
  const s = this._get_column_tokens("select", a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype.select_as = function (kwargs, as) {
  if (typeof kwargs === "string") {
    kwargs = { [kwargs]: as };
  }
  const cols = [];
  for (const [key, alias] of Object.entries(kwargs)) {
    const col = this._parse_column(key) + (" AS " + alias);
    cols.push(col);
  }
  if (cols.length > 0) {
    if (!this._select) {
      this._select = cols.join(", ");
    } else {
      this._select = this._select + (", " + cols.join(", "));
    }
  }
  return this;
};
Sql.prototype.select_literal = function (a, b, ...varargs) {
  const s = this._get_select_literal(a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype.select_literal_as = function (kwargs) {
  const cols = [];
  for (const [key, alias] of Object.entries(kwargs)) {
    const col = as_literal(key) + (" AS " + alias);
    cols.push(col);
  }
  if (cols.length > 0) {
    if (!this._select) {
      this._select = cols.join(", ");
    } else {
      this._select = this._select + (", " + cols.join(", "));
    }
  }
  return this;
};
Sql.prototype.returning = function (a, b, ...varargs) {
  const s = this._get_column_tokens("returning", a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  return this;
};
Sql.prototype.returning_literal = function (a, b, ...varargs) {
  const s = this._get_select_literal(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else {
    this._returning = this._returning + (", " + s);
  }
  return this;
};
Sql.prototype.group = function (a, ...varargs) {
  const s = this._get_column_tokens("group_by", a, ...varargs);
  if (!this._group) {
    this._group = s;
  } else {
    this._group = this._group + (", " + s);
  }
  this.select(a, ...varargs);
  return this;
};
Sql.prototype.group_by = function (...varargs) {
  return this.group(...varargs);
};
Sql.prototype.order = function (a, ...varargs) {
  const s = this._get_order_columns(a, ...varargs);
  if (!this._order) {
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
  if (!this._from) {
    this._from = s;
  } else {
    this._from = this._from + (", " + s);
  }
  return this;
};
Sql.prototype.get_table = function () {
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
  if (n === undefined) {
    return this;
  }
  if (typeof n === "string") {
    n = Number(n);
    if (n === undefined) {
      throw new Error("invalid limit value: not a valid number");
    }
  }
  if (typeof n !== "number" || n !== Math.floor(n) || n <= 0) {
    throw new Error("invalid limit value: " + String(n));
  }
  this._limit = n;
  return this;
};
Sql.prototype.offset = function (n) {
  if (n === undefined) {
    return this;
  }
  if (typeof n === "string") {
    n = Number(n);
    if (n === undefined) {
      throw new Error("invalid offset value: not a valid number");
    }
  }
  if (typeof n !== "number" || n !== Math.floor(n) || n < 0) {
    throw new Error("invalid offset value: " + String(n));
  }
  this._offset = n;
  return this;
};
Sql.prototype.where = function (cond, op, dval) {
  if (typeof cond === "object" && cond.__IS_LOGICAL_BUILDER__) {
    const where_token = this._resolve_Q(cond);
    if (this._where === undefined) {
      this._where = where_token;
    } else {
      this._where = `(${this._where}) AND (${where_token})`;
    }
    return this;
  } else {
    const where_token = this._get_condition_token(cond, op, dval);
    return this._handle_where_token(where_token, "(%s) AND (%s)");
  }
};
Sql.prototype.having = function (cond) {
  if (this._having) {
    this._having = `(${this._having}) AND (${this._get_having_condition_token(cond)})`;
  } else {
    this._having = this._get_having_condition_token(cond);
  }
  return this;
};
Sql.prototype.distinct = function (...varargs) {
  if (varargs.length === 0) {
    this._distinct = true;
  } else {
    const distinct_token = this._get_column_tokens("distinct", ...varargs);
    this._distinct_on = distinct_token;
  }
  return this;
};
Sql.prototype.increase = function (name, amount) {
  if (typeof name === "object") {
    const update_pairs = [];
    for (const [k, v] of Object.entries(name)) {
      update_pairs[k] = F(k) + (v || 1);
    }
    return this.update(update_pairs);
  }
  return this.update({ [name]: F(name) + (amount || 1) });
};
Sql.prototype.decrease = function (name, amount) {
  if (typeof name === "object") {
    const update_pairs = [];
    for (const [k, v] of Object.entries(name)) {
      update_pairs[k] = F(k) - (v || 1);
    }
    return this.update(update_pairs);
  }
  return this.update({ [name]: F(name) - (amount || 1) });
};
Sql.prototype.annotate = function (kwargs) {
  if (!this._annotate) {
    this._annotate = [];
  }
  for (let [alias, func] of Object.entries(kwargs)) {
    if (typeof alias === "number") {
      alias = func.column + func.suffix;
    }
    if (this.model.fields[alias]) {
      throw new Error(`annotate name '${alias}' is conflict with model field`);
    } else if (func.__IS_FUNCTION__) {
      const prefixed_column = this._parse_column(func.column, "aggregate");
      const func_token = `${func.name}(${prefixed_column})`;
      this._annotate[alias] = func_token;
      this._base_select(`${func_token} AS ${alias}`);
    } else if (func.__IS_FIELD_BUILDER__) {
      const exp_token = this._resolve_field_builder(func);
      this._annotate[alias] = exp_token;
      this._base_select(`${exp_token} AS ${alias}`);
    }
  }
  return this;
};
Sql.prototype.insert = function (rows, columns) {
  if (!(rows instanceof Sql)) {
    if (!columns) {
      columns = this.model.names;
    }
    if (!this._skip_validate) {
      rows = this.model._validate_create_data(rows, columns);
    }
    rows = this.model._prepare_db_rows(rows, columns);
    return Sql.prototype._base_insert.call(this, rows, columns);
  } else {
    return Sql.prototype._base_insert.call(this, rows, columns);
  }
};
Sql.prototype.align = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  const upsert_query = this.model.create_sql();
  if (!this._skip_validate) {
    rows = this.model._validate_create_rows(rows, key, columns);
  }
  rows = this.model._prepare_db_rows(rows, columns);
  upsert_query.returning(key);
  Sql._base_upsert(upsert_query, rows, key, columns);
  this.with("U", upsert_query)
    .where_not_in(key, Sql.new({ table_name: "U" })._base_select(key))
    .delete();
  return this;
};
Sql.prototype.update = function (row, columns) {
  if (!(row instanceof Sql)) {
    if (!columns) {
      columns = this.model.names;
    }
    for (const [k, v] of Object.entries(row)) {
      row[k] = this._resolve_F(v);
    }
    if (!this._skip_validate) {
      row = this.model.validate_update(row, columns);
    }
    row = this.model._prepare_db_rows(row, columns);
    return Sql.prototype._base_update.call(this, row, columns);
  } else {
    return Sql.prototype._base_update.call(this, row, columns);
  }
};
Sql.prototype.merge = function (rows, key, columns) {
  [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
  if (!this._skip_validate) {
    rows = this.model._validate_create_rows(rows, key, columns);
  }
  rows = this.model._prepare_db_rows(rows, columns);
  return Sql.prototype._base_merge.call(this, rows, key, columns);
};
Sql.prototype.upsert = function (rows, key, columns) {
  if (rows instanceof Sql) {
    if (columns === undefined) {
      const select_text = rows._select || rows._returning;
      if (select_text) {
        columns = extract_column_names(select_text);
      } else {
        throw new Error("subquery must have select or returning clause");
      }
    }
    if (key === undefined) {
      key = this._get_bulk_key();
    }
    return Sql.prototype._base_upsert.call(this, rows, key, columns);
  } else {
    [rows, key, columns] = this._clean_bulk_params(rows, key, columns);
    if (!this._skip_validate) {
      rows = this.model._validate_create_rows(rows, key, columns);
    }
    rows = this.model._prepare_db_rows(rows, columns);
    return Sql.prototype._base_upsert.call(this, rows, key, columns);
  }
};
Sql.prototype.updates = function (rows, key, columns) {
  if (rows instanceof Sql) {
    if (columns === undefined) {
      const select_text = rows._select || rows._returning;
      if (select_text) {
        columns = extract_column_names(select_text);
      } else {
        throw new Error("subquery must have select or returning clause");
      }
    }
    if (key === undefined) {
      key = this._get_bulk_key(columns);
    }
    return Sql.prototype._base_updates.call(this, rows, key, columns);
  } else {
    [rows, key, columns] = this._clean_bulk_params(rows, key, columns, true);
    if (!this._skip_validate) {
      rows = this.model._validate_update_rows(rows, key, columns);
    }
    rows = this.model._prepare_db_rows(rows, columns);
    return Sql.prototype._base_updates.call(this, rows, key, columns);
  }
};
Sql.prototype.gets = function (keys, columns) {
  if (keys.length === 0) {
    throw new Error("empty keys passed to gets");
  }
  return Sql.prototype._base_gets.call(this, keys, columns);
};
Sql.prototype.exec_statement = function (statement) {
  let records = this.model.query(statement, this._compact);
  let all_results;
  if (this._prepend) {
    all_results = records;
    records = records[this._prepend.length + 1];
  } else if (this._append) {
    all_results = records;
    records = records[0];
  }
  const is_cud = this._update || this._insert || this._delete;
  if (this._raw === undefined || this._raw || this._compact || is_cud) {
    if (is_cud && this._returning) {
      records.affected_rows = undefined;
    }
    if (this._return_all) {
      return all_results || records;
    } else {
      return records;
    }
  } else {
    const model = this.model;
    if (!this._select_related) {
      for (const [i, record] of records.entries()) {
        records[i] = model.load(record);
      }
    } else {
      const fields = model.fields;
      const field_names = model.field_names;
      for (const [i, record] of records.entries()) {
        for (const name of field_names) {
          const field = fields[name];
          const value = record[name];
          if (value !== undefined) {
            const fk_model = this._select_related[name];
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
        records[i] = model.create_record(record);
      }
    }
    if (this._return_all) {
      return all_results || records;
    } else {
      return records;
    }
  }
};
Sql.prototype.exec = function () {
  return this.exec_statement(this.statement());
};
Sql.prototype.count = function (cond, op, dval) {
  let res;
  if (cond !== undefined) {
    res = this._base_select("count(*)").where(cond, op, dval).compact().exec();
  } else {
    res = this._base_select("count(*)").compact().exec();
  }
  if (res && res[0]) {
    return res[0][0];
  } else {
    return 0;
  }
};
Sql.prototype.exists = function () {
  const statement = `SELECT EXISTS (${this.select(1).limit(1).compact().statement()})`;
  const [res, err] = this.model.query(statement, this._compact);
  if (res === undefined) {
    throw new Error(err);
  } else {
    return res[0][0];
  }
};
Sql.prototype.return_all = function () {
  this._return_all = true;
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
Sql.prototype.flat = function (col) {
  if (col) {
    if (this._update || this._delete || this._insert) {
      return this.returning(col).compact().execr().flat();
    } else {
      return this.select(col).compact().execr().flat();
    }
  } else {
    return this.compact().execr().flat();
  }
};
Sql.prototype.try_get = function (cond, op, dval) {
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
    return false;
  }
};
Sql.prototype.get = function (cond, op, dval) {
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
  } else if (records.length === 0) {
    throw new Error("record not found");
  } else {
    throw new Error(`multiple records returned: ${records.length}`);
  }
};
Sql.prototype.as_set = function () {
  return this.compact().execr().flat().as_set();
};
Sql.prototype.execr = function () {
  return this.raw().exec();
};
Sql.prototype.select_related_labels = function (names) {
  this.join_type("LEFT");
  for (const name of names || this.model.names) {
    const field = this.model.fields[name];
    if (
      field &&
      field.type === "foreignkey" &&
      field.reference_label_column !== field.reference_column
    ) {
      this.select_related(field.name, field.reference_label_column);
    }
  }
  return this;
};
Sql.prototype.select_related = function (fk_name, select_names, more_name, ...varargs) {
  let foreignfield;
  if (typeof fk_name === "string") {
    foreignfield = this.model.foreignkey_fields[fk_name];
  } else {
    foreignfield = fk_name;
    fk_name = foreignfield.name;
  }
  if (foreignfield === undefined) {
    throw new Error(fk_name + (" is not a valid forein key name for " + this.table_name));
  }
  const fk_model = foreignfield.reference;
  if (!this._select_related) {
    this._select_related = [];
  }
  this._select_related[fk_name] = fk_model;
  this.select(fk_name);
  if (!select_names) {
    return this;
  }
  const fks = [];
  if (!more_name) {
    if (typeof select_names === "object") {
      for (const fkn of select_names) {
        fks.push(`${fk_name}__${fkn}`);
      }
    } else if (select_names === "*") {
      for (const fkn of fk_model.field_names) {
        fks.push(`${fk_name}__${fkn}`);
      }
    } else {
      fks.push(`${fk_name}__${select_names}`);
    }
  } else {
    for (const fkn of [select_names, more_name, ...varargs]) {
      fks.push(`${fk_name}__${fkn}`);
    }
  }
  return this.select(fks);
};
Sql.prototype.where_recursive = function (name, value, select_names) {
  const fk = this.model.foreignkey_fields[name];
  if (fk === undefined) {
    throw new Error(name + (" is not a valid forein key name for " + this.table_name));
  }
  const fkc = fk.reference_column;
  const table_name = this.model.table_name;
  const t_alias = table_name + "_recursive";
  const seed_sql = this.model.create_sql().select(fkc, name).where(name, value);
  const join_cond = `${table_name}.${name} = ${t_alias}.${fkc}`;
  const recursive_sql = this.model
    .create_sql()
    .select(fkc, name)
    ._base_join("INNER", t_alias, join_cond);
  if (select_names) {
    seed_sql.select(select_names);
    recursive_sql.select(select_names);
  }
  this.with_recursive(t_alias, seed_sql.union_all(recursive_sql));
  return this.from(t_alias + (" AS " + table_name));
};

export default Sql;
