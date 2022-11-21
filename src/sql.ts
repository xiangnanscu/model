type DBValue = string | number | bigint | boolean | null | undefined | (() => string) | DBValue[];
type Row = { [key: string]: DBValue };
type SqlValue = DBValue | Sql;
type SqlSerializer = (value: SqlValue) => string;
type KeyExist = { [key: string]: boolean };
type CteReturningOpts = { columns: string[]; literals: DBValue[]; literalColumns: string[] };
type ConditionTable = { [s: string]: DBValue };
type Condition = ConditionTable | string | (() => string | Sql);
type InnerSetProperty = "_union" | "_unionAll" | "_except" | "_exceptAll" | "_intersect" | "_intersectAll";
type SqlAssembleOpts = {
  tableName: string;
  with?: string;
  join?: string;
  distinct?: boolean;
  returning?: string;
  cteReturning?: CteReturningOpts;
  insert?: string;
  update?: string;
  delete?: boolean;
  using?: string;
  select?: string;
  from?: string;
  where?: string;
  group?: string;
  having?: string;
  order?: string;
  limit?: number;
  offset?: number;
};

function makeRawToken(s: string) {
  function rawToken() {
    return s;
  }
  return rawToken;
}
const DEFAULT = makeRawToken("DEFAULT");
const NULL = makeRawToken("NULL");

const stringFormat = (s: string, ...varargs: string[]): string => {
  let status = 0;
  const res: string[] = [];
  let j = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "%") {
      if (status === 0) {
        status = 1;
      } else if (status === 1) {
        status = 0;
        res.push("%");
      }
    } else if (c === "s" && status === 1) {
      j = j + 1;
      res.push(varargs[j]);
      status = 0;
    } else {
      res.push(c);
    }
  }
  return res.join("");
};

function _prefixWithV(column: string) {
  return "V." + column;
}

function _escapeFactory(isLiteral: boolean, isBracket: boolean): SqlSerializer {
  function asSqlToken(value: SqlValue): string {
    if ("string" === typeof value) {
      if (isLiteral) {
        return "'" + value.replaceAll("'", "''") + "'";
      } else {
        return value;
      }
    } else if ("number" === typeof value || "bigint" === typeof value) {
      return String(value);
    } else if ("boolean" === typeof value) {
      return value === true ? "TRUE" : "FALSE";
    } else if ("function" === typeof value) {
      return value();
    } else if (null === value) {
      return "NULL";
    } else if (value instanceof Sql) {
      return "(" + value.statement() + ")";
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new Error("empty array as Sql value is not allowed");
      }
      const token = value.map(asSqlToken).join(", ");
      if (isBracket) {
        return "(" + token + ")";
      } else {
        return token;
      }
    } else {
      throw new Error(`don't know how to escape value: ${value} (${typeof value})`);
    }
  }
  return asSqlToken;
}
const asLiteral = _escapeFactory(true, true);
const asToken = _escapeFactory(false, false);

function getCteReturningValues(opts: CteReturningOpts) {
  const values: string[] = [];
  for (const col of opts.columns) {
    values.push(asToken(col));
  }
  if (opts.literals) {
    for (const e of opts.literals) {
      values.push(asLiteral(e));
    }
  }
  return values;
}

function getReturningToken(opts: { cteReturning?: CteReturningOpts; returning?: string }) {
  if (opts.cteReturning) {
    return " RETURNING " + asToken(getCteReturningValues(opts.cteReturning));
  } else if (opts.returning) {
    return " RETURNING " + opts.returning;
  } else {
    return "";
  }
}

function assembleSql(opts: SqlAssembleOpts): string {
  let statement;
  if (opts.update) {
    const from = (opts.from && " FROM " + opts.from) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = getReturningToken(opts);
    statement = `UPDATE ${opts.tableName} SET ${opts.update}${from}${where}${returning}`;
  } else if (opts.insert) {
    const returning = getReturningToken(opts);
    statement = `INSERT INTO ${opts.tableName} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    const using = (opts.using && " USING " + opts.using) || "";
    const where = (opts.where && " WHERE " + opts.where) || "";
    const returning = getReturningToken(opts);
    statement = `DELETE FROM ${opts.tableName} ${using}${where}${returning}`;
  } else {
    const from = opts.from || opts.tableName;
    const where = (opts.where && " WHERE " + opts.where) || "";
    const group = (opts.group && " GROUP BY " + opts.group) || "";
    const having = (opts.having && " HAVING " + opts.having) || "";
    const order = (opts.order && " ORDER BY " + opts.order) || "";
    const limit = (opts.limit && " LIMIT " + opts.limit) || "";
    const offset = (opts.offset && " OFFSET " + opts.offset) || "";
    statement = `SELECT ${(opts.distinct && "DISTINCT ") || ""}${opts.select || "*"
      } FROM ${from}${where}${group}${having}${order}${limit}${offset}`;
  }
  return (opts.with && `WITH ${opts.with} ${statement}`) || statement;
}

export class Sql {
  static r = makeRawToken;
  static DEFAULT = DEFAULT;
  static NULL = NULL;
  static asToken = asToken;
  static asLiteral = asLiteral;
  static new(tableName: string) {
    return new this(tableName);
  }
  tableName: string;
  _as?: string;
  _with?: string;
  _join?: string;
  _distinct?: boolean;
  _returning?: string;
  _cteReturning?: CteReturningOpts;
  _returningArgs?: DBValue[];
  _insert?: string;
  _update?: string;
  _delete?: boolean;
  _using?: string;
  _select?: string;
  _from?: string;
  _where?: string;
  _group?: string;
  _having?: string;
  _order?: string;
  _limit?: number;
  _offset?: number;
  _union?: Sql | string;
  _unionAll?: Sql | string;
  _except?: Sql | string;
  _exceptAll?: Sql | string;
  _intersect?: Sql | string;
  _intersectAll?: Sql | string;
  constructor(tableName: string) {
    this.tableName = tableName;
  }
  toString() {
    return this.statement();
  }
  error(errMsg: string | Error | object): never {
    if (typeof errMsg == "string") {
      throw new Error(errMsg);
    } else if (errMsg instanceof Error) {
      throw errMsg;
    } else {
      throw errMsg;
    }
  }
  _getKeys(rows: Row[] | Row) {
    const columns: string[] = [];
    if (rows instanceof Array) {
      const d: KeyExist = {};
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
  _rowsToArray(rows: Row[], columns: string[], fallback = DEFAULT): DBValue[][] {
    const c = columns.length;
    const n = rows.length;
    const res: DBValue[][] = new Array(n);
    for (let r = 0; r < n; r = r + 1) {
      res[r] = new Array(c);
    }
    for (const [i, col] of columns.entries()) {
      for (let j = 0; j < n; j = j + 1) {
        const v = rows[j][col];
        if (v !== undefined) {
          res[j][i] = v;
        } else {
          res[j][i] = fallback;
        }
      }
    }
    return res;
  }
  _getInsertValuesToken(row: Row, columns?: string[]): [string, string[]] {
    const valueList: DBValue[] = [];
    if (!columns) {
      columns = [];
      for (const [k, v] of Object.entries(row)) {
        columns.push(k);
        valueList.push(v);
      }
    } else {
      for (const col of columns) {
        const e = row[col];
        if (e !== undefined) {
          valueList.push(e);
        } else {
          valueList.push(DEFAULT);
        }
      }
    }
    return [asLiteral(valueList), columns];
  }
  _getBulkInsertValuesToken(rows: Row[], columns?: string[], fallback = DEFAULT): [string[], string[]] {
    columns = columns || this._getKeys(rows);
    return [this._rowsToArray(rows, columns, fallback).map(asLiteral), columns];
  }
  _getUpdateSetToken(columns: string[], key: string | string[], tableName: string) {
    const tokens = [];
    if (typeof key === "string") {
      for (const col of columns) {
        if (col !== key) {
          tokens.push(`${col} = ${tableName}.${col}`);
        }
      }
    } else {
      const sets: KeyExist = {};
      for (const k of key) {
        sets[k] = true;
      }
      for (const col of columns) {
        if (!sets[col]) {
          tokens.push(`${col} = ${tableName}.${col}`);
        }
      }
    }
    return tokens.join(", ");
  }
  _getSelectToken(a: DBValue, b?: DBValue, ...varargs: DBValue[]): string {
    if (a === undefined) {
      return this.error("augument is required for _get_select_token");
    } else if (b === undefined) {
      return asToken(a);
    } else {
      let s = asToken(a) + ", " + asToken(b);
      for (let i = 0; i < varargs.length; i = i + 1) {
        s = s + ", " + asToken(varargs[i]);
      }
      return s;
    }
  }
  _getSelectTokenLiteral(first: DBValue, second: DBValue, ...varargs: DBValue[]): string {
    if (first === undefined) {
      return this.error("arguments must be provided for _get_select_token_literal");
    } else if (second === undefined) {
      if (typeof first === "string") {
        return asLiteral(first);
      } else if (first instanceof Array) {
        const tokens = [];
        for (let i = 0; i < first.length; i = i + 1) {
          tokens[i] = asLiteral(first[i]);
        }
        return asToken(tokens);
      } else {
        return asLiteral(first);
      }
    } else {
      let s = asLiteral(first) + ", " + asLiteral(second);
      for (let i = 0; i < varargs.length; i = i + 1) {
        const name = varargs[i];
        s = s + ", " + asLiteral(name);
      }
      return s;
    }
  }
  _getUpdateToken(row: Row, columns?: string[]) {
    const kv: string[] = [];
    if (!columns) {
      for (const [k, v] of Object.entries(row)) {
        kv.push(`${k} = ${asLiteral(v)}`);
      }
    } else {
      for (const k of columns) {
        const v = row[k];
        kv.push(`${k} = ${(v !== undefined && asLiteral(v)) || "DEFAULT"}`);
      }
    }
    return kv.join(", ");
  }
  _getWithToken(name: string, token?: SqlValue) {
    if (token instanceof Sql) {
      return `${name} AS (${token.statement()})`;
    } else if (token !== undefined) {
      return `${name} AS ${token}`;
    } else {
      return asToken(name);
    }
  }
  _getInsertToken(row: Row, columns?: string[]) {
    const [insertValues, insertColumns] = this._getInsertValuesToken(row, columns);
    return `(${asToken(insertColumns)}) VALUES ${insertValues}`;
  }
  _getBulkInsertToken(rows: Row[], columns?: string[]) {
    const [insertValuesArray, insertColumns] = this._getBulkInsertValuesToken(rows, columns, DEFAULT);
    return `(${asToken(insertColumns)}) VALUES ${asToken(insertValuesArray)}`;
  }
  _setSelectSubqueryInsertToken(subQuery: Sql, columns?: string[]) {
    const columnsToken = asToken(columns || subQuery._select || "");
    if (columnsToken !== "") {
      this._insert = `(${columnsToken}) ${subQuery.statement()}`;
    } else {
      this._insert = subQuery.statement();
    }
  }
  _setCUDSubqueryInsertToken(subQuery: Sql) {
    if (subQuery._cteReturning) {
      const cr = subQuery._cteReturning;
      const cteColumns = cr.columns;
      const insertColumns = [...cteColumns, ...cr.literalColumns];
      const CUDSelectQuery = Sql.new("d").select(cteColumns).selectLiteral(cr.literals);
      this.with(`d(${asToken(cteColumns)})`, subQuery);
      this._insert = `(${asToken(insertColumns)}) ${CUDSelectQuery}`;
    } else if (subQuery._returningArgs) {
      const insertColumns = subQuery._returningArgs.flat();
      const CUDSelectQuery = Sql.new("d").select(insertColumns);
      this.with(`d(${asToken(insertColumns)})`, subQuery);
      this._insert = `(${asToken(insertColumns)}) ${CUDSelectQuery}`;
    }
  }
  _getUpsertToken(row: Row, key: string | string[], columns: string[]) {
    const [valuesToken, upsertColumns] = this._getInsertValuesToken(row, columns);
    const insertToken = `(${asToken(upsertColumns)}) VALUES ${valuesToken} ON CONFLICT (${this._getSelectToken(key)})`;
    if ((Array.isArray(key) && key.length === upsertColumns.length) || upsertColumns.length === 1) {
      return `${insertToken} DO NOTHING`;
    } else {
      return `${insertToken} DO UPDATE SET ${this._getUpdateSetToken(upsertColumns, key, "EXCLUDED")}`;
    }
  }
  _getBulkUpsertToken(rows: Row[], key: string | string[], columns: string[]) {
    const [insertValuesArray, insertColumns] = this._getBulkInsertValuesToken(rows, columns, DEFAULT);
    const insertToken = `(${asToken(insertColumns)}) VALUES ${asToken(
      insertValuesArray
    )} ON CONFLICT (${this._getSelectToken(key)})`;
    if ((Array.isArray(key) && key.length === insertColumns.length) || insertColumns.length === 1) {
      return `${insertToken} DO NOTHING`;
    } else {
      return `${insertToken} DO UPDATE SET ${this._getUpdateSetToken(insertColumns, key, "EXCLUDED")}`;
    }
  }
  _getUpsertQueryToken(rows: Sql, key: string | string[], columns: string[]) {
    const columnsToken = this._getSelectToken(columns);
    const insertToken = `(${columnsToken}) ${rows.statement()} ON CONFLICT (${this._getSelectToken(key)})`;
    if ((Array.isArray(key) && key.length === columns.length) || columns.length === 1) {
      return `${insertToken} DO NOTHING`;
    } else {
      return `${insertToken} DO UPDATE SET ${this._getUpdateSetToken(columns, key, "EXCLUDED")}`;
    }
  }
  _getJoinExpr(a: string, b?: DBValue, c?: DBValue) {
    if (a === undefined) {
      return this.error("auguments is required for _get_join_expr");
    } else if (b === undefined) {
      return a;
    } else if (c === undefined) {
      return `${a} = ${b}`;
    } else {
      return `${a} ${b} ${c}`;
    }
  }
  _getJoinToken(joinType: string, rightTable: string, conditions?: string, ...varargs: string[]) {
    if (conditions !== undefined) {
      return `${joinType} JOIN ${rightTable} ON (${this._getJoinExpr(conditions, ...varargs)})`;
    } else {
      return `${joinType} JOIN ${rightTable}`;
    }
  }
  _getInnerJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    return this._getJoinToken("INNER", rightTable, conditions, ...varargs);
  }
  _getLeftJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    return this._getJoinToken("LEFT", rightTable, conditions, ...varargs);
  }
  _getRightJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    return this._getJoinToken("RIGHT", rightTable, conditions, ...varargs);
  }
  _getFullJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    return this._getJoinToken("FULL", rightTable, conditions, ...varargs);
  }
  _getInToken(cols: string | string[], range: DBValue[] | Sql | string, operator: string = "IN") {
    cols = asToken(cols);
    if (typeof range === "object") {
      if (range instanceof Sql) {
        return `(${cols}) ${operator} (${range.statement()})`;
      } else {
        return `(${cols}) ${operator} ${asLiteral(range)}`;
      }
    } else {
      return `(${cols}) ${operator} ${range}`;
    }
  }
  _getUpdateQueryToken(subSelect: Sql, columns?: DBValue[]) {
    return `(${(columns && this._getSelectToken(columns)) || subSelect._select}) = (${subSelect.statement()})`;
  }
  _getJoinConditions(key: string | string[], leftTable: string, rightTable: string) {
    if (typeof key === "string") {
      return `${leftTable}.${key} = ${rightTable}.${key}`;
    }
    const res: string[] = [];
    for (const k of key) {
      res.push(`${leftTable}.${k} = ${rightTable}.${k}`);
    }
    return res.join(" AND ");
  }
  _getCteValuesLiteral(rows: Row[], columns?: string[]) {
    return this._getBulkInsertValuesToken(rows, columns, NULL);
  }
  _handleWhereToken(whereToken: string | undefined, tpl: string) {
    if (whereToken === undefined || whereToken === "") {
      return this;
    } else if (this._where === undefined) {
      this._where = whereToken;
    } else {
      this._where = stringFormat(tpl, this._where, whereToken);
    }
    return this;
  }
  _getConditionTokenFromTable(kwargs: ConditionTable, logic?: string): string {
    const tokens: string[] = [];
    for (const [k, value] of Object.entries(kwargs)) {
      tokens.push(`${k} = ${asLiteral(value)}`);
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + (logic + " "));
    }
  }
  _getConditionToken(cond: Condition, op?: DBValue, dval?: DBValue) {
    if (cond === undefined) {
      return this.error("arguments is required for _get_condition_token");
    } else if (op === undefined) {
      if (typeof cond === "object") {
        return this._getConditionTokenFromTable(cond);
      } else if (typeof cond === "string") {
        return cond;
      } else if (typeof cond === "function") {
        const _where = this._where;
        delete this._where;
        let res;
        try {
          res = cond.call(this);
          if (res instanceof Sql) {
            const groupWhere = this._where;
            this._where = _where;
            if (!groupWhere) {
              return this.error("no condition made from condition function");
            }
            return groupWhere;
          } else {
            this._where = _where;
            return res;
          }
        } catch (error: any) {
          return this.error("condition function raise error:" + error.message);
        }
      } else {
        return this.error("invalid condition type: " + typeof cond);
      }
    } else if (dval === undefined) {
      return `${cond} = ${asLiteral(op)}`;
    } else {
      return `${cond} ${op} ${asLiteral(dval)}`;
    }
  }
  _getConditionTokenOr(first: Condition, second?: DBValue, third?: DBValue) {
    if (typeof first === "object") {
      return this._getConditionTokenFromTable(first, "OR");
    } else {
      return this._getConditionToken(first, second, third);
    }
  }
  _getConditionTokenNot(first: Condition, second?: DBValue, third?: DBValue) {
    let token;
    if (typeof first === "object") {
      token = this._getConditionTokenFromTable(first, "OR");
    } else {
      token = this._getConditionToken(first, second, third);
    }
    return token !== "" ? `NOT (${token})` : "";
  }
  _handleSetOption(otherSql: Sql, innerAttr: InnerSetProperty) {
    if (!this[innerAttr]) {
      this[innerAttr] = otherSql;
    } else {
      this[innerAttr] = `(${this[innerAttr]}) ${innerAttr.slice(1).toUpperCase()} (${otherSql.statement()})`;
    }
    this.statement = this._statementForSet;
    return this;
  }
  _statementForSet() {
    let statement = Sql.prototype.statement.call(this);
    if (this._intersect) {
      statement = `(${statement}) INTERSECT (${this._intersect})`;
    } else if (this._intersectAll) {
      statement = `(${statement}) INTERSECT ALL (${this._intersectAll})`;
    } else if (this._union) {
      statement = `(${statement}) UNION (${this._union})`;
    } else if (this._unionAll) {
      statement = `(${statement}) UNION ALL (${this._unionAll})`;
    } else if (this._except) {
      statement = `(${statement}) EXCEPT (${this._except})`;
    } else if (this._exceptAll) {
      statement = `(${statement}) EXCEPT ALL (${this._exceptAll})`;
    }
    return statement;
  }
  statement() {
    const tableName = this.getTable();
    const statement = assembleSql({
      tableName: tableName,
      with: this._with,
      join: this._join,
      distinct: this._distinct,
      returning: this._returning,
      cteReturning: this._cteReturning,
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
  }
  with(name: string, token?: SqlValue) {
    const withToken = this._getWithToken(name, token);
    if (this._with) {
      this._with = `${this._with}, ${withToken}`;
    } else {
      this._with = withToken;
    }
    return this;
  }
  union(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_union");
  }
  unionAll(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_unionAll");
  }
  except(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_except");
  }
  exceptAll(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_exceptAll");
  }
  intersect(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_intersect");
  }
  intersectAll(otherSql: Sql) {
    return this._handleSetOption(otherSql, "_intersectAll");
  }
  as(tableAlias: string) {
    this._as = tableAlias;
    return this;
  }
  withValues(name: string, rows: Row[]) {
    const columns = this._getKeys(rows[0]);
    const [withRows, withColumns] = this._getCteValuesLiteral(rows, columns);
    const cteName = `${name}(${withColumns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(withRows)})`;
    return this.with(cteName, cteValues);
  }
  insert(rows: Row | Row[] | Sql, columns?: string[]) {
    if (rows instanceof Sql) {
      if (rows._select) {
        this._setSelectSubqueryInsertToken(rows, columns);
      } else {
        this._setCUDSubqueryInsertToken(rows);
      }
    } else if (rows instanceof Array) {
      this._insert = this._getBulkInsertToken(rows, columns);
    } else if (Object.keys(rows).length) {
      this._insert = this._getInsertToken(rows, columns);
    } else {
      return this.error("can't pass empty table to sql.insert");
    }
    return this;
  }
  update(row: Row | Sql | string, columns?: string[]) {
    if (typeof row == "string") {
      this._update = row;
    } else if (!(row instanceof Sql)) {
      this._update = this._getUpdateToken(row, columns);
    } else {
      this._update = this._getUpdateQueryToken(row, columns);
    }
    return this;
  }
  upsert(rows: Row | Row[] | Sql, key: string | string[], columns?: any) {
    if (!key) {
      throw new Error("you must provide key for upsert(string or table)");
    }
    if (rows instanceof Sql) {
      this._insert = this._getUpsertQueryToken(rows, key, columns);
    } else if (rows instanceof Array) {
      this._insert = this._getBulkUpsertToken(rows, key, columns);
    } else {
      this._insert = this._getUpsertToken(rows, key, columns);
    }
    return this;
  }
  isInstance(row: any) {
    return row instanceof Sql;
  }
  merge(rows: Row[], key: string | string[], columns?: string[]) {
    if (rows.length === 0) {
      return this.error("empty rows passed to merge");
    }
    const [mergeRows, mergeColumns] = this._getCteValuesLiteral(rows, columns);
    const cteName = `V(${mergeColumns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(mergeRows)})`;
    const joinCond = this._getJoinConditions(key, "V", "T");
    const valsColumns = mergeColumns.map(_prefixWithV);
    const insertSubquery = Sql.new("V")
      .select(valsColumns)
      .leftJoin("U AS T", joinCond)
      .whereNull("T." + (Array.isArray(key) ? key[0] : key));
    let updatedSubquery;
    if ((Array.isArray(key) && key.length === mergeColumns.length) || mergeColumns.length === 1) {
      updatedSubquery = Sql.new("V")
        .select(valsColumns)
        .join(this.tableName + " AS T", joinCond);
    } else {
      updatedSubquery = Sql.new(this.tableName)
        .as("T")
        .update(this._getUpdateSetToken(mergeColumns, key, "V"))
        .from("V")
        .where(joinCond)
        .returning(valsColumns);
    }
    this.with(cteName, cteValues).with("U", updatedSubquery);
    return Sql.prototype.insert.call(this, insertSubquery, columns);
  }
  updates(rows: Row[] | Sql, key: string | string[], columns?: string[]) {
    if (rows instanceof Sql) {
      const updatesColumns =
        columns || (rows._returningArgs?.flat().filter((e) => typeof e === "string") as string[]) || [];
      if (!updatesColumns.length) {
        throw new Error("columns is required when using subquery");
      }
      const cteName = `V(${updatesColumns.join(", ")})`;
      const joinCond = this._getJoinConditions(key, "V", this._as || this.tableName);
      this.with(cteName, rows);
      return Sql.prototype.update
        .call(this, this._getUpdateSetToken(updatesColumns, key, "V"))
        .from("V")
        .where(joinCond);
    } else if (rows.length === 0) {
      return this.error("empty rows passed to updates");
    } else {
      const [updatesRows, updatesColumns] = this._getCteValuesLiteral(rows, columns);
      const cteName = `V(${updatesColumns.join(", ")})`;
      const cteValues = `(VALUES ${asToken(updatesRows)})`;
      const joinCond = this._getJoinConditions(key, "V", this._as || this.tableName);
      this.with(cteName, cteValues);
      return Sql.prototype.update
        .call(this, this._getUpdateSetToken(updatesColumns, key, "V"))
        .from("V")
        .where(joinCond);
    }
  }
  gets(keys: Row[]) {
    if (keys.length === 0) {
      return this.error("empty keys passed to gets");
    }
    const columns = this._getKeys(keys[0]);
    const [getskeys, getsColumns] = this._getCteValuesLiteral(keys, columns);
    const joinCond = this._getJoinConditions(getsColumns, "V", this._as || this.tableName);
    const cteName = `V(${getsColumns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(getskeys)})`;
    return this.with(cteName, cteValues).rightJoin("V", joinCond);
  }
  mergeGets(rows: Row[], keys: string | string[]) {
    const columns = this._getKeys(rows[0]);
    const [getsRows, getsColumns] = this._getCteValuesLiteral(rows, columns);
    const joinCond = this._getJoinConditions(keys, "V", this._as || this.tableName);
    const cteName = `V(${getsColumns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(getsRows)})`;
    return Sql.prototype.select.call(this, "V.*").with(cteName, cteValues).rightJoin("V", joinCond);
  }
  copy(): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }
  delete(first: Condition, second?: DBValue, third?: DBValue) {
    this._delete = true;
    if (first) {
      this.where(first, second, third);
    }
    return this;
  }
  distinct() {
    this._distinct = true;
    return this;
  }
  select(first: DBValue, second?: DBValue, ...varargs: DBValue[]) {
    const s = this._getSelectToken(first, second, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + (", " + s);
    }
    return this;
  }
  selectLiteral(first: DBValue, second?: DBValue, ...varargs: DBValue[]) {
    const s = this._getSelectTokenLiteral(first, second, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + (", " + s);
    }
    return this;
  }
  returning(first: DBValue, second?: DBValue, ...varargs: DBValue[]) {
    const s = this._getSelectToken(first, second, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + (", " + s);
    } else {
      return this;
    }
    if (this._returningArgs) {
      this._returningArgs = [this._returningArgs, first, second, ...varargs];
    } else {
      this._returningArgs = [first, second, ...varargs];
    }
    return this;
  }
  returningLiteral(first: DBValue, second: DBValue, ...varargs: DBValue[]) {
    const s = this._getSelectTokenLiteral(first, second, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + (", " + s);
    }
    if (this._returningArgs) {
      this._returningArgs = [this._returningArgs, first, second, ...varargs];
    } else {
      this._returningArgs = [first, second, ...varargs];
    }
    return this;
  }
  cteReturning(opts: CteReturningOpts) {
    this._cteReturning = opts;
    return this;
  }
  group(first: string, second?: string, ...varargs: string[]) {
    if (!this._group) {
      this._group = this._getSelectToken(first, second, ...varargs);
    } else {
      this._group = this._group + (", " + this._getSelectToken(first, second, ...varargs));
    }
    return this;
  }
  groupBy(first: string, second?: string, ...varargs: string[]) {
    return this.group(first, second, ...varargs);
  }
  order(first: string, second?: string, ...varargs: string[]) {
    if (!this._order) {
      this._order = this._getSelectToken(first, second, ...varargs);
    } else {
      this._order = this._order + (", " + this._getSelectToken(first, second, ...varargs));
    }
    return this;
  }
  orderBy(first: string, second?: string, ...varargs: string[]) {
    return this.order(first, second, ...varargs);
  }
  _getArgsToken(first: string, second?: string, ...varargs: string[]) {
    return this._getSelectToken(first, second, ...varargs);
  }
  using(first: string, second?: string, ...varargs: string[]) {
    this._delete = true;
    this._using = this._getArgsToken(first, second, ...varargs);
    return this;
  }
  from(first: string, second?: string, ...varargs: string[]) {
    if (!this._from) {
      this._from = this._getArgsToken(first, second, ...varargs);
    } else {
      this._from = this._from + (", " + this._getArgsToken(first, second, ...varargs));
    }
    return this;
  }
  getTable() {
    return (this._as === undefined && this.tableName) || this.tableName + (" AS " + this._as);
  }
  join(rightTable: string, conditions?: string, ...varargs: string[]) {
    const joinToken = this._getInnerJoin(rightTable, conditions, ...varargs);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  innerJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    return this.join(rightTable, conditions, ...varargs);
  }
  leftJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    const joinToken = this._getLeftJoin(rightTable, conditions, ...varargs);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  rightJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    const joinToken = this._getRightJoin(rightTable, conditions, ...varargs);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  fullJoin(rightTable: string, conditions?: string, ...varargs: string[]) {
    const joinToken = this._getFullJoin(rightTable, conditions, ...varargs);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  limit(n: number) {
    this._limit = n;
    return this;
  }
  offset(n: number) {
    this._offset = n;
    return this;
  }
  where(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionToken(first, second, third);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  whereOr(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionTokenOr(first, second, third);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhereOr(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionTokenOr(first, second, third);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereNot(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionTokenNot(first, second, third);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhere(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionToken(first, second, third);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  orWhereNot(first: Condition, second?: DBValue, third?: DBValue) {
    const whereToken = this._getConditionTokenNot(first, second, third);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereExists(builder: Sql) {
    if (this._where) {
      this._where = `(${this._where}) AND EXISTS (${builder.statement()})`;
    } else {
      this._where = `EXISTS (${builder.statement()})`;
    }
    return this;
  }
  whereNotExists(builder: Sql) {
    if (this._where) {
      this._where = `(${this._where}) AND NOT EXISTS (${builder.statement()})`;
    } else {
      this._where = `NOT EXISTS (${builder.statement()})`;
    }
    return this;
  }
  whereIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `(${this._where}) AND ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  whereNotIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `(${this._where}) AND ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  whereNull(col: string) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  whereNotNull(col: string) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  whereBetween(col: string, low: number, high: number) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  whereNotBetween(col: string, low: number, high: number) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  whereRaw(whereToken: string) {
    if (whereToken === "") {
      return this;
    } else if (this._where) {
      this._where = `(${this._where}) AND (${whereToken})`;
    } else {
      this._where = whereToken;
    }
    return this;
  }
  orWhereExists(builder: Sql) {
    if (this._where) {
      this._where = `${this._where} OR EXISTS (${builder.statement()})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  orWhereNotExists(builder: Sql) {
    if (this._where) {
      this._where = `${this._where} OR NOT EXISTS (${builder.statement()})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  orWhereIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `${this._where} OR ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  orWhereNotIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `${this._where} OR ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  orWhereNull(col: string) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  orWhereNotNull(col: string) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  orWhereBetween(col: string, low: number, high: number) {
    if (this._where) {
      this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orWhereNotBetween(col: string, low: number, high: number) {
    if (this._where) {
      this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orWhereRaw(whereToken: string) {
    if (whereToken === "") {
      return this;
    } else if (this._where) {
      this._where = `${this._where} OR ${whereToken}`;
    } else {
      this._where = whereToken;
    }
    return this;
  }
  having(first: Condition, second?: DBValue, third?: DBValue) {
    if (this._having) {
      this._having = `(${this._having}) AND (${this._getConditionToken(first, second, third)})`;
    } else {
      this._having = this._getConditionToken(first, second, third);
    }
    return this;
  }
  havingNot(first: Condition, second?: DBValue, third?: DBValue) {
    if (this._having) {
      this._having = `(${this._having}) AND (${this._getConditionTokenNot(first, second, third)})`;
    } else {
      this._having = this._getConditionTokenNot(first, second, third);
    }
    return this;
  }
  havingExists(builder: Sql) {
    if (this._having) {
      this._having = `(${this._having}) AND EXISTS (${builder.statement()})`;
    } else {
      this._having = `EXISTS (${builder.statement()})`;
    }
    return this;
  }
  havingNotExists(builder: Sql) {
    if (this._having) {
      this._having = `(${this._having}) AND NOT EXISTS (${builder.statement()})`;
    } else {
      this._having = `NOT EXISTS (${builder.statement()})`;
    }
    return this;
  }
  havingIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `(${this._having}) AND ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  havingNotIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._having) {
      this._having = `(${this._having}) AND ${notInToken}`;
    } else {
      this._having = notInToken;
    }
    return this;
  }
  havingNull(col: string) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  havingNotNull(col: string) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  havingBetween(col: string, low: number, high: number) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  havingNotBetween(col: string, low: number, high: number) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  havingRaw(token: string) {
    if (this._having) {
      this._having = `(${this._having}) AND (${token})`;
    } else {
      this._having = token;
    }
    return this;
  }
  orHaving(first: Condition, second?: DBValue, third?: DBValue) {
    if (this._having) {
      this._having = `${this._having} OR ${this._getConditionToken(first, second, third)}`;
    } else {
      this._having = this._getConditionToken(first, second, third);
    }
    return this;
  }
  orHavingNot(first: Condition, second?: DBValue, third?: DBValue) {
    if (this._having) {
      this._having = `${this._having} OR ${this._getConditionTokenNot(first, second, third)}`;
    } else {
      this._having = this._getConditionTokenNot(first, second, third);
    }
    return this;
  }
  orHavingExists(builder: Sql) {
    if (this._having) {
      this._having = `${this._having} OR EXISTS (${builder.statement()})`;
    } else {
      this._having = `EXISTS (${builder.statement()})`;
    }
    return this;
  }
  orHavingNotExists(builder: Sql) {
    if (this._having) {
      this._having = `${this._having} OR NOT EXISTS (${builder.statement()})`;
    } else {
      this._having = `NOT EXISTS (${builder.statement()})`;
    }
    return this;
  }
  orHavingIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `${this._having} OR ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  orHavingNotIn(cols: string | string[], range: DBValue[] | Sql | string) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._having) {
      this._having = `${this._having} OR ${notInToken}`;
    } else {
      this._having = notInToken;
    }
    return this;
  }
  orHavingNull(col: string) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  orHavingNotNull(col: string) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  orHavingBetween(col: string, low: number, high: number) {
    if (this._having) {
      this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHavingNotBetween(col: string, low: number, high: number) {
    if (this._having) {
      this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHavingRaw(token: string) {
    if (this._having) {
      this._having = `${this._having} OR ${token}`;
    } else {
      this._having = token;
    }
    return this;
  }
}