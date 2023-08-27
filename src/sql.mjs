// ([a-z])([A-Z]) => $1_\L$2
// \[_, (\w+)\] of ([\w.]+)\.entries\(\) => $1 of $2
// rows[0] 替换为Array.isArray(rows)
// is_sql_instance\((\w+)\) => $1 instanceof Sql
// lua混合array和object, js只能分别处理:
//  _base_get_condition_token_from_table
//  _get_condition_token_from_table
// foo.bar = undefined => delete foo.bar
// table_new(n, 0); =>  new Array(n);
// key:find("__", 1, true) => key.indexOf("__")
// key:sub => key.slice
// key:gsub => key.replaceAll
// _get_expr_token接收_parse_column返回值时要用...
// foo = [] 要注意是否应该为 foo = {}, 如get_keys
// match(key, ...) => key.match
// lua循环起始值为2时js的处理, 例如:parse_where_exp
// lua: type(obj)=='table', js要考虑是不是Array.isArray(obj)
import { clone, string_format, assert, next, make_token, NULL, DEFAULT, _prefix_with_V } from "./utils.mjs";

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
function assemble_sql(opts) {
  let statement;
  if (opts.update) {
    const from = (opts.from && " FROM " + opts.from) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    statement = `UPDATE ${opts.table_name} SET ${opts.update}${from}${where}${returning}`;
  } else if (opts.insert) {
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    statement = `INSERT INTO ${opts.table_name} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    const using = (opts.using && " USING " + opts.using) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = (opts.returning && " RETURNING " + opts.returning) || "";
    statement = `DELETE FROM ${opts.table_name}${using}${where}${returning}`;
  } else {
    const from = opts.from || opts.table_name;
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
  return (opts.with && `WITH ${opts.with} ${statement}`) || statement;
}
class Sql {
  static token = make_token;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static as_token = as_token;
  static as_literal = as_literal;
  static as_literal_without_brackets = as_literal_without_brackets;

  static new(args) {
    if (typeof args === "string") {
      return new this({ table_name: args });
    } else {
      return new this(args);
    }
  }
  static get_keys(rows) {
    const columns = [];
    if (rows instanceof Array) {
      const d = {};
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
  constructor(attrs) {
    Object.assign(this, attrs);
  }
  toString() {
    return this.statement();
  }
}
Sql.prototype._base_select = function (a, b, ...varargs) {
  const s = this._base_get_select_token(a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype._base_get_select_token = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      return Sql.prototype._base_get_select_token.call(this, ...a);
    } else {
      return as_token(a);
    }
  } else {
    let s = as_token(a) + (", " + as_token(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      s = s + (", " + as_token(varargs[i]));
    }
    return s;
  }
};
Sql.prototype._base_insert = function (rows, columns) {
  if (typeof rows === "object") {
    if (rows instanceof Sql) {
      if (rows._select) {
        this._set_select_subquery_insert_token(rows, columns);
      } else if (rows._returning_args) {
        this._set_cud_subquery_insert_token(rows, columns);
      } else {
        throw new Error("select or returning args should be provided when inserting from a sub query");
      }
    } else if (rows instanceof Array) {
      this._insert = this._get_bulk_insert_token(rows, columns);
    } else if (next(rows) !== undefined) {
      this._insert = this._get_insert_token(rows, columns);
    } else {
      throw new Error("can't pass empty table to Sql._base_insert");
    }
  } else if (typeof rows === "string") {
    this._insert = rows;
  } else {
    throw new Error("invalid value type to Sql._base_insert:" + typeof rows);
  }
  return this;
};
Sql.prototype._base_update = function (row, columns) {
  if (row instanceof Sql) {
    this._update = this._base_get_update_query_token(row, columns);
  } else if (typeof row === "object") {
    this._update = this._get_update_token(row, columns);
  } else {
    this._update = row;
  }
  return this;
};
Sql.prototype._base_merge = function (rows, key, columns) {
  [rows, columns] = this._get_cte_values_literal(rows, columns, false);
  const cte_name = `V(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(rows)})`;
  const join_cond = this._get_join_conditions(key, "V", "T");
  const vals_columns = columns.map(_prefix_with_V);
  const insert_subquery = Sql.new({ table_name: "V" })
    ._base_select(vals_columns)
    ._base_join("LEFT", "U AS T", join_cond)
    ._base_where_null("T." + (Array.isArray(key) ? key[0] : key));
  let updated_subquery;
  if ((typeof key === "object" && key.length === columns.length) || columns.length === 1) {
    updated_subquery = Sql.new({ table_name: "V" })
      ._base_select(vals_columns)
      ._base_join("INNER", this.table_name + " AS T", join_cond);
  } else {
    updated_subquery = Sql.new({ table_name: this.table_name, _as: "T" })
      ._base_update(this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond)
      ._base_returning(vals_columns);
  }
  this.with(cte_name, cte_values).with("U", updated_subquery);
  return Sql.prototype._base_insert.call(this, insert_subquery, columns);
};
Sql.prototype._base_upsert = function (rows, key, columns) {
  assert(key, "you must provide key for upsert(string or table)");
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
    const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
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
    const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
    this.with(cte_name, cte_values);
    return Sql.prototype._base_update
      .call(this, this._get_update_token_with_prefix(columns, key, "V"))
      ._base_from("V")
      ._base_where(join_cond);
  }
};
Sql.prototype._base_returning = function (a, b, ...varargs) {
  const s = this._base_get_select_token(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  } else {
    return this;
  }
  if (this._returning_args) {
    this._returning_args = [this._returning_args, ...varargs];
  } else {
    this._returning_args = [...varargs];
  }
  return this;
};
Sql.prototype._base_from = function (a, ...varargs) {
  if (!this._from) {
    this._from = this._base_get_select_token(a, ...varargs);
  } else {
    this._from = this._from + (", " + this._base_get_select_token(a, ...varargs));
  }
  return this;
};
Sql.prototype._base_join = function (join_type, right_table, key, op, val) {
  const join_token = this._get_join_token(join_type || "INNER", right_table, key, op, val);
  this._from = `${this._from || this.get_table()} ${join_token}`;
  return this;
};
Sql.prototype._base_where = function (cond, op, dval) {
  const where_token = this._base_get_condition_token(cond, op, dval);
  return this._handle_where_token(where_token, "(%s) AND (%s)");
};
Sql.prototype._base_get_condition_token_from_table = function (kwargs, logic) {
  const tokens = [];
  if (Array.isArray(kwargs)) {
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
    return tokens.join(" " + (logic + " "));
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
// Sql.prototype.pcall = function () {
//   this._pcall = true;
//   return this;
// };
// Sql.prototype.error = function (err, level) {
//   if (this._pcall) {
//     throw new Error(err);
//   } else {
//     throw new Error(err);
//   }
// };
Sql.prototype._rows_to_array = function (rows, columns) {
  const c = columns.length;
  const n = rows.length;
  const res = new Array(n);
  for (let i = 0; i < n; i = i + 1) {
    res[i] = new Array(c);
  }
  for (const [i, col] of columns.entries()) {
    for (let j = 0; j < n; j = j + 1) {
      const v = rows[j][col];
      if (v !== undefined && v !== "") {
        res[j][i] = v;
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
    for (const [_, col] of Object.entries(columns)) {
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
  columns = columns || Sql.get_keys(rows);
  rows = this._rows_to_array(rows, columns);
  return [rows.map(as_literal), columns];
};
Sql.prototype._get_update_token_with_prefix = function (columns, key, table_name) {
  const tokens = [];
  if (typeof key === "string") {
    for (const [i, col] of columns.entries()) {
      if (col !== key) {
        tokens.push(`${col} = ${table_name}.${col}`);
      }
    }
  } else {
    const sets = {};
    for (const [i, k] of key.entries()) {
      sets[k] = true;
    }
    for (const [i, col] of columns.entries()) {
      if (!sets[col]) {
        tokens.push(`${col} = ${table_name}.${col}`);
      }
    }
  }
  return tokens.join(", ");
};
Sql.prototype._get_select_token = function (a, b, ...varargs) {
  if (b === undefined) {
    if (Array.isArray(a)) {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = this._get_select_column(a[i]);
      }
      return as_token(tokens);
    } else if (typeof a === "string") {
      return this._get_select_column(a);
    } else {
      return as_token(a);
    }
  } else {
    a = this._get_select_column(a);
    b = this._get_select_column(b);
    let s = as_token(a) + (", " + as_token(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      const name = varargs[i];
      s = s + (", " + as_token(this._get_select_column(name)));
    }
    return s;
  }
};
Sql.prototype._get_select_token_literal = function (a, b, ...varargs) {
  if (b === undefined) {
    if (Array.isArray(a)) {
      const tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = as_literal(a[i]);
      }
      return as_token(tokens);
    } else {
      return as_literal(a);
    }
  } else {
    let s = as_literal(a) + (", " + as_literal(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      const name = varargs[i];
      s = s + (", " + as_literal(name));
    }
    return s;
  }
};
Sql.prototype._get_update_token = function (row, columns) {
  const kv = [];
  if (!columns) {
    for (const [k, v] of Object.entries(row)) {
      kv.push(`${k} = ${as_literal(v)}`);
    }
  } else {
    for (const [_, k] of columns.entries()) {
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
Sql.prototype._set_select_subquery_insert_token = function (sub_query, columns) {
  const columns_token = as_token(columns || sub_query._select || "");
  if (columns_token !== "") {
    this._insert = `(${columns_token}) ${sub_query.statement()}`;
  } else {
    this._insert = sub_query.statement();
  }
};
Sql.prototype._set_cud_subquery_insert_token = function (sub_query, columns) {
  const insert_columns = columns || sub_query._returning_args.flat();
  const cud_select_query = Sql.new({ table_name: "d" })._base_select(insert_columns);
  this.with(`d(${as_token(insert_columns)})`, sub_query);
  this._insert = `(${as_token(insert_columns)}) ${cud_select_query.statement()}`;
};
Sql.prototype._get_upsert_token = function (row, key, columns) {
  const [values_list, insert_columns] = this._get_insert_values_token(row, columns);
  const insert_token = `(${as_token(insert_columns)}) VALUES ${as_literal(
    values_list
  )} ON CONFLICT (${this._get_select_token(key)})`;
  if ((Array.isArray(key) && key.length === insert_columns.length) || insert_columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(insert_columns, key, "EXCLUDED")}`;
  }
};
Sql.prototype._get_bulk_upsert_token = function (rows, key, columns) {
  [rows, columns] = this._get_bulk_insert_values_token(rows, columns);
  const insert_token = `(${as_token(columns)}) VALUES ${as_token(rows)} ON CONFLICT (${this._base_get_select_token(
    key
  )})`;
  if ((Array.isArray(key) && key.length === columns.length) || columns.length === 1) {
    return `${insert_token} DO NOTHING`;
  } else {
    return `${insert_token} DO UPDATE SET ${this._get_update_token_with_prefix(columns, key, "EXCLUDED")}`;
  }
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
Sql.prototype._get_join_expr = function (key, op, val) {
  if (op === undefined) {
    return key;
  } else if (val === undefined) {
    return `${key} = ${op}`;
  } else {
    return `${key} ${op} ${val}`;
  }
};
Sql.prototype._get_join_token = function (join_type, right_table, key, op, val) {
  if (key !== undefined) {
    return `${join_type} JOIN ${right_table} ON (${this._get_join_expr(key, op, val)})`;
  } else {
    return `${join_type} JOIN ${right_table}`;
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
Sql.prototype._get_update_query_token = function (sub_select, columns) {
  const columns_token = (columns && this._get_select_token(columns)) || sub_select._select;
  return `(${columns_token}) = (${sub_select.statement()})`;
};
Sql.prototype._base_get_update_query_token = function (sub_select, columns) {
  const columns_token = (columns && this._base_get_select_token(columns)) || sub_select._select;
  return `(${columns_token}) = (${sub_select.statement()})`;
};
Sql.prototype._get_join_conditions = function (key, left_table, right_table) {
  if (typeof key === "string") {
    return `${left_table}.${key} = ${right_table}.${key}`;
  }
  const res = [];
  for (const [_, k] of key.entries()) {
    res.push(`${left_table}.${k} = ${right_table}.${k}`);
  }
  return res.join(" AND ");
};
Sql.prototype._get_cte_values_literal = function (rows, columns, no_check) {
  columns = columns || Sql.get_keys(rows);
  rows = this._rows_to_array(rows, columns);
  const res = new Array(rows.length);
  for (let i = 0; i < rows.length; i = i + 1) {
    res[i] = as_literal(rows[i]);
  }
  return [res, columns];
};
Sql.prototype._handle_join = function (join_type, join_table, join_cond) {
  if (this._update) {
    this._base_from(join_table);
    this._base_where(join_cond);
  } else if (this._delete) {
    this._using = join_table;
    this._base_where(join_cond);
  } else {
    this._base_join(join_type, join_table, join_cond);
  }
};
Sql.prototype._parse_column = function (key, as_select, strict, disable_alias) {
  const a = key.indexOf("__");
  if (a === -1) {
    return [key, "eq"];
  }
  const e = key.slice(0, a);
  const op = key.slice(a + 2);
  return [e, op];
};
Sql.prototype._get_column = function (key) {
  return key;
};
Sql.prototype._get_select_column = function (key) {
  if (typeof key !== "string") {
    return key;
  } else {
    return this._parse_column(key, true, true)[0];
  }
};
Sql.prototype._get_expr_token = function (value, key, op) {
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
  } else if (op === "null") {
    if (value) {
      return `${key} IS NULL`;
    } else {
      return `${key} IS NOT NULL`;
    }
  } else {
    throw new Error("invalid sql op: " + String(op));
  }
};
Sql.prototype._get_join_number = function () {
  if (this._join_keys) {
    return Object.keys(this._join_keys).length + 1;
  } else {
    return 1;
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
  if (Array.isArray(kwargs)) {
    for (const value of kwargs) {
      const token = this._get_condition_token(value);
      if (token !== undefined && token !== "") {
        tokens.push("(" + token + ")");
      }
    }
  } else {
    for (const [k, value] of Object.entries(kwargs)) {
      tokens.push(this._get_expr_token(value, ...this._parse_column(k, false, true)));
    }
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
Sql.prototype.statement = function () {
  const table_name = this.get_table();
  const statement = assemble_sql({
    table_name,
    with: this._with,
    join: this._join,
    distinct: this._distinct,
    distinct_on: this._distinct_on,
    returning: this._returning,
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
  let columns = Sql.get_keys(rows[0]);
  [rows, columns] = this._get_cte_values_literal(rows, columns, true);
  const cte_name = `${name}(${columns.join(", ")})`;
  const cte_values = `(VALUES ${as_token(rows)})`;
  return this.with(cte_name, cte_values);
};
Sql.prototype.insert = function (rows, columns) {
  return Sql.prototype._base_insert.call(this, rows, columns);
};
Sql.prototype.update = function (row, columns) {
  if (typeof row === "string") {
    return Sql.prototype._base_update.call(this, row);
  } else {
    return Sql.prototype._base_update.call(this, row, columns);
  }
};
Sql.prototype.merge = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  this._base_merge(rows, key, columns);
  return this;
};
Sql.prototype.upsert = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  this._base_upsert(rows, key, columns);
  return this;
};
Sql.prototype.updates = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  this._base_updates(rows, key, columns);
  return this;
};
Sql.prototype.get_merge = function (rows, key) {
  let columns = Sql.get_keys(rows[0]);
  [rows, columns] = this._get_cte_values_literal(rows, columns, true);
  const join_cond = this._get_join_conditions(key, "V", this._as || this.table_name);
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
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype.select_as = function (key, alias) {
  const col = this._parse_column(key, true, true, true)[0] + (" AS " + alias);
  if (!this._select) {
    this._select = col;
  } else {
    this._select = this._select + (", " + col);
  }
  return this;
};
Sql.prototype.select_literal = function (a, b, ...varargs) {
  const s = this._get_select_token_literal(a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Sql.prototype.returning = function (a, b, ...varargs) {
  const s = this._get_select_token(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  } else {
    return this;
  }
  if (this._returning_args) {
    this._returning_args = [this._returning_args, a, b, ...varargs];
  } else {
    this._returning_args = [a, b, ...varargs];
  }
  return this;
};
Sql.prototype.returning_literal = function (a, b, ...varargs) {
  const s = this._get_select_token_literal(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  }
  if (this._returning_args) {
    this._returning_args = [this._returning_args, a, b, ...varargs];
  } else {
    this._returning_args = [a, b, ...varargs];
  }
  return this;
};
Sql.prototype.group = function (...varargs) {
  if (!this._group) {
    this._group = this._get_select_token(...varargs);
  } else {
    this._group = this._group + (", " + this._get_select_token(...varargs));
  }
  return this;
};
Sql.prototype.group_by = function (...varargs) {
  return this.group(...varargs);
};
Sql.prototype._get_order_column = function (key) {
  if (typeof key !== "string") {
    return this._get_select_column(key);
  } else {
    const matched = key.match(/^([-+])?([\w_.]+)$/);
    if (matched) {
      return `${this._get_select_column(matched[2])} ${(matched[1] === "-" && "DESC") || "ASC"}`;
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
    } else {
      return as_token(a);
    }
  } else {
    a = this._get_order_column(a);
    b = this._get_order_column(b);
    let s = as_token(a) + (", " + as_token(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      const name = varargs[i];
      s = s + (", " + as_token(this._get_order_column(name)));
    }
    return s;
  }
};
Sql.prototype.order = function (...varargs) {
  if (!this._order) {
    this._order = this._get_order_token(...varargs);
  } else {
    this._order = this._order + (", " + this._get_order_token(...varargs));
  }
  return this;
};
Sql.prototype.order_by = function (...varargs) {
  return this.order(...varargs);
};
Sql.prototype.using = function (a, ...varargs) {
  this._delete = true;
  this._using = this._get_select_token(a, ...varargs);
  return this;
};
Sql.prototype.from = function (a, ...varargs) {
  if (!this._from) {
    this._from = this._get_select_token(a, ...varargs);
  } else {
    this._from = this._from + (", " + this._get_select_token(a, ...varargs));
  }
  return this;
};
Sql.prototype.get_table = function () {
  return (this._as === undefined && this.table_name) || this.table_name + (" AS " + this._as);
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
Sql.prototype.parse_where_exp = function (cond, father_op) {
  const logic_op = cond[0];
  const tokens = [];
  for (let i = 1; i <= cond.length; i = i + 1) {
    const value = cond[i];
    if (Array.isArray(value)) {
      tokens.push(this.parse_where_exp(value, logic_op));
    } else {
      for (const [k, v] of Object.entries(value)) {
        tokens.push(self._get_expr_token(v, ...self._parse_column(k, false, true)));
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
    return "(" + (where_token + ")");
  } else {
    return where_token;
  }
};
Sql.prototype.where_exp = function (cond) {
  const where_token = this.parse_where_exp(cond, "init");
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
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._get_column(cols[i]);
    }
  }
  return Sql.prototype._base_or_where_in.call(this, cols, range);
};
Sql.prototype.or_where_not_in = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._get_column(cols);
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._get_column(cols[i]);
    }
  }
  return Sql.prototype._base_or_where_not_in.call(this, cols, range);
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
export default Sql;
