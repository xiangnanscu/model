
import Field from '@xiangnanscu/field'

let DEFAULT_STRING_MAXLENGTH = 256;
let FOREIGN_KEY = 2;
let NON_FOREIGN_KEY = 3;
let END = 4;
let COMPARE_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  ne: "<>",
  eq: "=",
};
let IS_PG_KEYWORDS = {
  ALL: true,
  ANALYSE: true,
  ANALYZE: true,
  AND: true,
  ANY: true,
  ARRAY: true,
  AS: true,
  ASC: true,
  ASYMMETRIC: true,
  AUTHORIZATION: true,
  BINARY: true,
  BOTH: true,
  CASE: true,
  CAST: true,
  CHECK: true,
  COLLATE: true,
  COLLATION: true,
  COLUMN: true,
  CONCURRENTLY: true,
  CONSTRAINT: true,
  CREATE: true,
  CROSS: true,
  CURRENT_CATALOG: true,
  CURRENT_DATE: true,
  CURRENT_ROLE: true,
  CURRENT_SCHEMA: true,
  CURRENT_TIME: true,
  CURRENT_TIMESTAMP: true,
  CURRENT_USER: true,
  DEFAULT: true,
  DEFERRABLE: true,
  DESC: true,
  DISTINCT: true,
  DO: true,
  ELSE: true,
  END: true,
  EXCEPT: true,
  FALSE: true,
  FETCH: true,
  FOR: true,
  FOREIGN: true,
  FREEZE: true,
  FROM: true,
  FULL: true,
  GRANT: true,
  GROUP: true,
  HAVING: true,
  ILIKE: true,
  IN: true,
  INITIALLY: true,
  INNER: true,
  INTERSECT: true,
  INTO: true,
  IS: true,
  ISNULL: true,
  JOIN: true,
  LATERAL: true,
  LEADING: true,
  LEFT: true,
  LIKE: true,
  LIMIT: true,
  LOCALTIME: true,
  LOCALTIMESTAMP: true,
  NATURAL: true,
  NOT: true,
  NOTNULL: true,
  NULL: true,
  OFFSET: true,
  ON: true,
  ONLY: true,
  OR: true,
  ORDER: true,
  OUTER: true,
  OVERLAPS: true,
  PLACING: true,
  PRIMARY: true,
  REFERENCES: true,
  RETURNING: true,
  RIGHT: true,
  SELECT: true,
  SESSION_USER: true,
  SIMILAR: true,
  SOME: true,
  SYMMETRIC: true,
  TABLE: true,
  TABLESAMPLE: true,
  THEN: true,
  TO: true,
  TRAILING: true,
  TRUE: true,
  UNION: true,
  UNIQUE: true,
  USER: true,
  USING: true,
  VARIADIC: true,
  VERBOSE: true,
  WHEN: true,
  WHERE: true,
  WINDOW: true,
  WITH: true,
};
let NON_MERGE_NAMES = {
  sql: true,
  fields: true,
  fieldNames: true,
  _extends: true,
  mixins: true,
  __index: true,
  admin: true,
};
let baseModel = {
  abstract: true,
  fieldNames: Array(["id", "ctime", "utime"]),
  fields: {
    id: { type: "integer", primaryKey: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", autoNowAdd: true },
    utime: { label: "更新时间", type: "datetime", autoNow: true },
  },
};
function _prefixWith_V(column) {
  return "V." + column;
}
function map(tbl, func) {
  let res = [];
  for (let i = 0; i < tbl.length; i = i + 1) {
    res[i] = func(tbl[i]);
  }
  return res;
}
function flat(tbl) {
  let res = [];
  for (let i = 0; i < tbl.length; i = i + 1) {
    let t = tbl[i];
    if (typeof t !== "object") {
      res.push(t);
    } else {
      for (let [_, e] of flat(t).entries()) {
        res.push(e);
      }
    }
  }
  return res;
}
function list(t1, t2) {
  let res = clone(t1);
  if (t2) {
    for (let i = 0; i < t2.length; i = i + 1) {
      res.push(t2[i]);
    }
  }
  return res;
}
function dict(a, b) {
  let res = [];
  for (let [key, value] of Object.entries(a)) {
    res[key] = value;
  }
  for (let [key, value] of Object.entries(b)) {
    res[key] = value;
  }
  return res;
}
function checkReserved(name) {
  assert(
    typeof name === "string",
    `name must by string, not ${typeof name} (${name})`
  );
  assert(!name.find("__", 1, true), "don't use __ in a field name");
  assert(
    !IS_PG_KEYWORDS[name.upper()],
    `${name} is a postgresql reserved word`
  );
}
function normalizeArrayAndHashFields(fields) {
  assert(typeof fields === "object", "you must provide fields for a model");
  let alignedFields = [];
  for (let [name, field] of Object.entries(fields)) {
    if (typeof name === "number") {
      assert(
        field.name,
        "you must define name for a field when using array fields"
      );
      alignedFields[field.name] = field;
    } else {
      alignedFields[name] = field;
    }
  }
  return alignedFields;
}
function normalizeFieldNames(fieldNames) {
  assert(
    typeof fieldNames === "object",
    "you must provide field_names for a model"
  );
  for (let [_, name] of fieldNames.entries()) {
    assert(typeof name === "string", "element of field_names must be string");
  }
  return Array(fieldNames);
}
function isFieldClass(t) {
  return (
    typeof t === "object" && t.__isFieldClass__
  );
}
function getForeignObject(attrs, prefix) {
  let fk = {};
  let n = prefix.length;
  for (let [k, v] of Object.entries(attrs)) {
    if (k.slice(0, n) === prefix) {
      fk[k.slice(n)] = v;
      delete attrs[k];
    }
  }
  return fk;
}
function makeRecordMeta(model, cls) {
  function RecordMeta(attrs) {
    Object.assign(this, attrs)
  }
  RecordMeta.prototype.delete = function (key) {
    key = key || model.primaryKey;
    return cls.delete(model, { [key]: this[key] }).exec();
  };
  RecordMeta.prototype.save = function (names, key) {
    return cls.save(model, this, names, key);
  };
  RecordMeta.prototype.saveCreate = function (names, key) {
    return cls.saveCreate(model, this, names, key);
  };
  RecordMeta.prototype.saveUpdate = function (names, key) {
    return cls.saveUpdate(model, this, names, key);
  };
  RecordMeta.prototype.createFrom = function (key) {
    return cls.createFrom(model, this, key);
  };
  RecordMeta.prototype.updateFrom = function (key) {
    return cls.updateFrom(model, this, key);
  };
  RecordMeta.prototype.validate = function (names, key) {
    return cls.validate(model, this, names, key);
  };
  RecordMeta.prototype.validateUpdate = function (names) {
    return cls.validateUpdate(model, this, names);
  };
  RecordMeta.prototype.validateCreate = function (names) {
    return cls.validateCreate(model, this, names);
  };
  return RecordMeta
}
function assert(bool, errMsg) {
  if (!bool) {
    throw new Error(errMsg)
  } else {
    return bool
  }
}
class ValidateError extends Error {
  constructor({ name, message, label, httpCode }) {
    super(message)
    Object.assign(this, { name, label, httpCode, message })
  }
}
class ValidateBatchError extends ValidateError {
  constructor({ name, message, label, httpCode, index }) {
    super({ name, message, label, httpCode })
    this.index = index
  }
  toString() {
    return `FIELD ERROR: ${this.name}(${this.label})+${this.message}`
  }
}
function checkUpsertKey(rows, key) {
  assert(key, "no key for upsert");
  if (rows instanceof Array) {
    if (typeof key === "string") {
      for (let [i, row] of rows.entries()) {
        if (row[key] === undefined || row[key] === "") {
          throw new ValidateBatchError({
            message: "value of key is required for upsert/merge",
            index: i,
            name: key,
          });
        }
      }
    } else {
      for (let row of rows) {
        let emptyKeys = true;
        for (let k of key) {
          if (!(row[k] === undefined || row[k] === "")) {
            emptyKeys = false;
            break;
          }
        }
        if (emptyKeys) {
          throw new Error("empty keys for upsert");
        }
      }
    }
  } else if (typeof key === "string") {
    if (rows[key] === undefined || rows[key] === "") {
      throw new ValidateError({ name: key, message: "value of key is required" });
    }
  } else {
    for (let [_, k] of key.entries()) {
      if (rows[k] === undefined || rows[k] === "") {
        throw new ValidateError({ name: k, message: "value of key is required" });
      }
    }
  }
  return [rows, key];
}
function makeFieldFromJson(json, kwargs) {
  let options = { ...json, ...kwargs };
  if (!options.type) {
    if (options.reference) {
      options.type = "foreignkey";
    } else if (options.model || options.subfields) {
      options.type = "table";
    } else {
      options.type = "string";
    }
  }
  if (
    (options.type === "string" || options.type === "alioss") &&
    !options.maxlength
  ) {
    options.maxlength = DEFAULT_STRING_MAXLENGTH;
  }
  let fcls = Field[options.type];
  if (!fcls) {
    throw new Error("invalid field type:" + tostring(options.type));
  }
  return fcls.new(options);
}
function makeToken(s) {
  function rawToken() {
    return s;
  }
  return rawToken;
}
let DEFAULT = makeToken("DEFAULT");
let PG_SET_MAP = {
  _union: "UNION",
  _unionAll: "UNION ALL",
  _except: "EXCEPT",
  _exceptAll: "EXCEPT ALL",
  _intersect: "INTERSECT",
  _intersectAll: "INTERSECT ALL",
};
function isSqlInstance(row) {
  return row instanceof Model
}
function _escapeFactory(isLiteral, isBracket) {
  function asSqlToken(value) {
    let valueType = typeof value;
    if ("string" === valueType) {
      if (isLiteral) {
        return "'" + (value.gsub("'", "''") + "'");
      } else {
        return value;
      }
    } else if ("number" === valueType) {
      return tostring(value);
    } else if ("boolean" === valueType) {
      return (value && "TRUE") || "FALSE";
    } else if ("function" === valueType) {
      return value();
    } else if ("object" === valueType) {
      if (isSqlInstance(value)) {
        return "(" + (value.statement() + ")");
      } else if (value[0] !== undefined) {
        let token = map(value, asSqlToken).join(", ");
        if (isBracket) {
          return "(" + (token + ")");
        } else {
          return token;
        }
      } else {
        throw new Error("empty table as a Xodel value is not allowed");
      }
    } else if (NULL === value) {
      return "NULL";
    } else {
      throw new Error(
        `don't know how to escape value: ${value} (${valueType})`
      );
    }
  }
  return asSqlToken;
}
let asLiteral = _escapeFactory(true, true);
let asToken = _escapeFactory(false, false);
function getCteReturningValues(columns, literals) {
  let values = [];
  for (let [_, col] of columns.entries()) {
    values.push(asToken(col));
  }
  if (literals) {
    for (let [_, e] of literals.entries()) {
      values.push(asLiteral(e));
    }
  }
  return values;
}
function getReturningToken(opts) {
  if (opts.cteReturning) {
    return (
      " RETURNING " +
      asToken(
        getCteReturningValues(
          opts.cteReturning.columns,
          opts.cteReturning.literals
        )
      )
    );
  } else if (opts.returning) {
    return " RETURNING " + opts.returning;
  } else {
    return "";
  }
}
function assembleSql(opts) {
  let statement;
  if (opts.update) {
    let from = (opts.from && " FROM " + opts.from) || "";
    let where = (opts.where && " WHERE " + opts.where) || "";
    let returning = getReturningToken(opts);
    statement = `UPDATE ${opts.tableName} SET ${opts.update}${from}${where}${returning}`;
  } else if (opts.insert) {
    let returning = getReturningToken(opts);
    statement = `INSERT INTO ${opts.tableName} ${opts.insert}${returning}`;
  } else if (opts.delete) {
    let using = (opts.using && " USING " + opts.using) || "";
    let where = (opts.where && " WHERE " + opts.where) || "";
    let returning = getReturningToken(opts);
    statement = `DELETE FROM ${opts.tableName}${using}${where}${returning}`;
  } else {
    let from = opts.from || opts.tableName;
    let where = (opts.where && " WHERE " + opts.where) || "";
    let group = (opts.group && " GROUP BY " + opts.group) || "";
    let having = (opts.having && " HAVING " + opts.having) || "";
    let order = (opts.order && " ORDER BY " + opts.order) || "";
    let limit = (opts.limit && " LIMIT " + opts.limit) || "";
    let offset = (opts.offset && " OFFSET " + opts.offset) || "";
    let distinct = (opts.distinct && "DISTINCT ") || "";
    let select = opts.select || "*";
    statement = `SELECT ${distinct}${select} FROM ${from}${where}${group}${having}${order}${limit}${offset}`;
  }
  return (opts.with && `WITH ${opts.with} ${statement}`) || statement;
}
let XodelProxy = [];
XodelProxy.__index = XodelProxy;
XodelProxy.createProxy = function (modelclass) {
  return setmetatable(
    {
      modelclass: modelclass,
      tableName: modelclass.tableName,
      fieldNames: modelclass.fieldNames,
      fields: modelclass.fields,
      abstract: modelclass.abstract,
    },
    this
  );
};
XodelProxy.prototype.new = function (attr) {
  return this.modelclass.new(attr);
};
XodelProxy.prototype.all = function () {
  return this.modelclass.all();
};
XodelProxy.prototype.save = function (input, names, key) {
  return this.modelclass.save(input, names, key);
};
XodelProxy.prototype.saveCreate = function (input, names, key) {
  return this.modelclass.saveCreate(input, names, key);
};
XodelProxy.prototype.saveUpdate = function (input, names, key) {
  return this.modelclass.saveUpdate(input, names, key);
};
XodelProxy.prototype.validate = function (input, names, key) {
  return this.modelclass.validate(input, names, key);
};
XodelProxy.prototype.validateCreate = function (input, names) {
  return this.modelclass.validateCreate(input, names);
};
XodelProxy.prototype.validateUpdate = function (input, names) {
  return this.modelclass.validateUpdate(input, names);
};
XodelProxy.prototype.load = function (data) {
  return this.modelclass.load(data);
};
XodelProxy.prototype.count = function (cond, op, dval) {
  return this.modelclass.count(cond, op, dval);
};
XodelProxy.prototype.filter = function (kwargs) {
  return this.modelclass.filter(kwargs);
};
XodelProxy.prototype.getOrCreate = function (params, defaults) {
  return this.modelclass.newSql().getOrCreate(params, defaults);
};
XodelProxy.prototype.select = function (a, b, ...varargs) {
  return this.modelclass.newSql().select(a, b, ...varargs);
};
XodelProxy.prototype.as = function (tableAlias) {
  return this.modelclass.newSql().as(tableAlias);
};
XodelProxy.prototype.limit = function (n) {
  return this.modelclass.newSql().limit(n);
};
XodelProxy.prototype.offset = function (n) {
  return this.modelclass.newSql().offset(n);
};
XodelProxy.prototype.commit = function (bool) {
  return this.modelclass.newSql().commit(bool);
};
XodelProxy.prototype.skipValidate = function (bool) {
  return this.modelclass.newSql().skipValidate(bool);
};
XodelProxy.prototype.with = function (name, token) {
  return this.modelclass.newSql().with(name, token);
};
XodelProxy.prototype.withValues = function (name, rows) {
  return this.modelclass.newSql().withValues(name, rows);
};
XodelProxy.prototype.insert = function (rows, columns) {
  return this.modelclass.newSql().insert(rows, columns);
};
XodelProxy.prototype.get = function (cond, op, dval) {
  return this.modelclass.newSql().get(cond, op, dval);
};
XodelProxy.prototype.update = function (row, columns) {
  return this.modelclass.newSql().update(row, columns);
};
XodelProxy.prototype.delete = function (a, b, c) {
  return this.modelclass.newSql().delete(a, b, c);
};
XodelProxy.prototype.getMerge = function (rows, key) {
  return this.modelclass.newSql().getMerge(rows, key);
};
XodelProxy.prototype.getMultiple = function (keys, columns) {
  return this.modelclass.newSql().getMultiple(keys, columns);
};
XodelProxy.prototype.merge = function (rows, key, columns) {
  return this.modelclass.newSql().merge(rows, key, columns);
};
XodelProxy.prototype.upsert = function (rows, key, columns) {
  return this.modelclass.newSql().upsert(rows, key, columns);
};
XodelProxy.prototype.updates = function (rows, key, columns) {
  return this.modelclass.newSql().updates(rows, key, columns);
};
XodelProxy.prototype.group = function (...varargs) {
  return this.modelclass.newSql().group(...varargs);
};
XodelProxy.prototype.groupBy = function (...varargs) {
  return this.modelclass.newSql().groupBy(...varargs);
};
XodelProxy.prototype.order = function (...varargs) {
  return this.modelclass.newSql().order(...varargs);
};
XodelProxy.prototype.orderBy = function (...varargs) {
  return this.modelclass.newSql().orderBy(...varargs);
};
XodelProxy.prototype.join = function (joinArgs, key, op, val) {
  return this.modelclass.newSql().join(joinArgs, key, op, val);
};
XodelProxy.prototype.leftJoin = function (joinArgs, key, op, val) {
  return this.modelclass.newSql().leftJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.rightJoin = function (joinArgs, key, op, val) {
  return this.modelclass.newSql().rightJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.fullJoin = function (joinArgs, key, op, val) {
  return this.modelclass.newSql().fullJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.loadFk = function (fkName, selectNames, ...varargs) {
  return this.modelclass.newSql().loadFk(fkName, selectNames, ...varargs);
};
XodelProxy.prototype.where = function (cond, op, dval) {
  return this.modelclass.newSql().where(cond, op, dval);
};
XodelProxy.prototype.whereOr = function (cond, op, dval) {
  return this.modelclass.newSql().whereOr(cond, op, dval);
};
XodelProxy.prototype.whereNot = function (cond, op, dval) {
  return this.modelclass.newSql().whereNot(cond, op, dval);
};
XodelProxy.prototype.whereExists = function (builder) {
  return this.modelclass.newSql().whereExists(builder);
};
XodelProxy.prototype.whereNotExists = function (builder) {
  return this.modelclass.newSql().whereNotExists(builder);
};
XodelProxy.prototype.whereIn = function (cols, range) {
  return this.modelclass.newSql().whereIn(cols, range);
};
XodelProxy.prototype.whereNotIn = function (cols, range) {
  return this.modelclass.newSql().whereNotIn(cols, range);
};
XodelProxy.prototype.whereNull = function (col) {
  return this.modelclass.newSql().whereNull(col);
};
XodelProxy.prototype.whereNotNull = function (col) {
  return this.modelclass.newSql().whereNotNull(col);
};
XodelProxy.prototype.whereBetween = function (col, low, high) {
  return this.modelclass.newSql().whereBetween(col, low, high);
};
XodelProxy.prototype.whereNotBetween = function (col, low, high) {
  return this.modelclass.newSql().whereNotBetween(col, low, high);
};
let XodelMeta = [];
XodelMeta.__call = function (kwargs) {
  if (typeof kwargs === "string") {
    return setmetatable({ tableName: kwargs }, this);
  } else {
    return setmetatable(kwargs || [], this);
  }
};
let Model = {
  __SQL_BUILDER__: true,
  NULL: NULL,
  defaultQuery: defaultQuery,
  makeFieldFromJson: makeFieldFromJson,
  token: makeToken,
  DEFAULT: DEFAULT,
  asToken: asToken,
  asLiteral: asLiteral,
};
Model.__index = Model;
Model.__call = function (...varargs) {
  return this.prototype.new.call(this, ...varargs);
};
Model.prototype.__tostring = function () {
  return this.statement();
};
Model.prototype._baseSelect = function (a, b, ...varargs) {
  let s = Model.prototype._baseGetSelectToken.call(this, a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Model.prototype._baseGetSelectToken = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      return Model.prototype._baseGetSelectToken.call(this, unpack(a));
    } else {
      return asToken(a);
    }
  } else {
    let s = asToken(a) + (", " + asToken(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      s = s + (", " + asToken(varargs[i]));
    }
    return s;
  }
};
Model.prototype._baseInsert = function (rows, columns) {
  if (typeof rows === "object") {
    if (this.isInstance(rows)) {
      if (rows._select) {
        this._setSelectSubqueryInsertToken(rows, columns);
      } else {
        this._setCudSubqueryInsertToken(rows);
      }
    } else if (rows[0]) {
      this._insert = this._getBulkInsertToken(rows, columns);
    } else if (next(rows) !== undefined) {
      this._insert = this._getInsertToken(rows, columns);
    } else {
      throw new Error("can't pass empty table to Xodel._base_insert");
    }
  } else if (typeof rows === "string") {
    this._insert = rows;
  } else {
    throw new Error("invalid value type to Xodel._base_insert:" + typeof rows);
  }
  return this;
};
Model.prototype._baseUpdate = function (row, columns) {
  if (this.isInstance(row)) {
    this._update = this._baseGetUpdateQueryToken(row, columns);
  } else if (typeof row === "object") {
    this._update = this._getUpdateToken(row, columns);
  } else {
    this._update = row;
  }
  return this;
};
Model.prototype._baseMerge = function (rows, key, columns) {
  [rows, columns] = this._getCteValuesLiteral(rows, columns, false);
  let cteName = `V(${columns.join(", ")})`;
  let cteValues = `(VALUES ${asToken(rows)})`;
  let joinCond = this._getJoinConditions(key, "V", "T");
  let valsColumns = map(columns, _prefixWith_V);
  let insertSubquery = Model.new({ tableName: "V" })
    ._baseSelect(valsColumns)
    ._baseLeftJoin("U AS T", joinCond)
    ._baseWhereNull("T." + (key[0] || key));
  let updatedSubquery;
  if (
    (typeof key === "object" && key.length === columns.length) ||
    columns.length === 1
  ) {
    updatedSubquery = Model.new({ tableName: "V" })
      ._baseSelect(valsColumns)
      ._baseJoin(this.tableName + " AS T", joinCond);
  } else {
    updatedSubquery = Model.new({ tableName: this.tableName, _as: "T" })
      ._baseUpdate(this._getUpdateTokenWithPrefix(columns, key, "V"))
      ._baseFrom("V")
      ._baseWhere(joinCond)
      ._baseReturning(valsColumns);
  }
  this.with(cteName, cteValues).with("U", updatedSubquery);
  return Model.prototype._baseInsert.call(this, insertSubquery, columns);
};
Model.prototype._baseUpsert = function (rows, key, columns) {
  assert(key, "you must provide key for upsert(string or table)");
  if (this.isInstance(rows)) {
    assert(
      columns !== undefined,
      "you must specify columns when use subquery as values of upsert"
    );
    this._insert = this._getUpsertQueryToken(rows, key, columns);
  } else if (rows[0]) {
    this._insert = this._getBulkUpsertToken(rows, key, columns);
  } else {
    this._insert = this._getUpsertToken(rows, key, columns);
  }
  return this;
};
Model.prototype._baseUpdates = function (rows, key, columns) {
  if (this.isInstance(rows)) {
    columns = columns || flat(rows._returningArgs);
    let cteName = `V(${columns.join(", ")})`;
    let joinCond = this._getJoinConditions(
      key,
      "V",
      this._as || this.tableName
    );
    this.with(cteName, rows);
    return Model.prototype._baseUpdate
      .call(this, this._getUpdateTokenWithPrefix(columns, key, "V"))
      .from("V")
      .where(joinCond);
  } else if (rows.length === 0) {
    throw new Error("empty rows passed to updates");
  } else {
    [rows, columns] = this._getCteValuesLiteral(rows, columns, false);
    let cteName = `V(${columns.join(", ")})`;
    let cteValues = `(VALUES ${asToken(rows)})`;
    let joinCond = this._getJoinConditions(
      key,
      "V",
      this._as || this.tableName
    );
    this.with(cteName, cteValues);
    return Model.prototype._baseUpdate
      .call(this, this._getUpdateTokenWithPrefix(columns, key, "V"))
      .from("V")
      .where(joinCond);
  }
};
Model.prototype._baseGetMultiple = function (keys, columns) {
  if (keys.length === 0) {
    throw new Error("empty keys passed to get_multiple");
  }
  columns = columns || this._getKeys(keys[0]);
  [keys, columns] = this._getCteValuesLiteral(keys, columns, false);
  let joinCond = this._getJoinConditions(
    columns,
    "V",
    this._as || this.tableName
  );
  let cteName = `V(${columns.join(", ")})`;
  let cteValues = `(VALUES ${asToken(keys)})`;
  return this.with(cteName, cteValues).rightJoin("V", joinCond);
};
Model.prototype._baseReturning = function (a, b, ...varargs) {
  let s = this._baseGetSelectToken(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  } else {
    return this;
  }
  if (this._returningArgs) {
    this._returningArgs = [this._returningArgs, ...varargs];
  } else {
    this._returningArgs = [...varargs];
  }
  return this;
};
Model.prototype._baseFrom = function (a, ...varargs) {
  if (!this._from) {
    this._from = Model.prototype._baseGetSelectToken.call(this, a, ...varargs);
  } else {
    this._from =
      this._from +
      (", " + Model.prototype._baseGetSelectToken.call(this, a, ...varargs));
  }
  return this;
};
Model.prototype._baseJoin = function (rightTable, key, op, val) {
  let joinToken = this._getJoinToken("INNER", rightTable, key, op, val);
  this._from = `${this._from || this.getTable()} ${joinToken}`;
  return this;
};
Model.prototype._baseLeftJoin = function (rightTable, key, op, val) {
  let joinToken = this._getJoinToken("LEFT", rightTable, key, op, val);
  this._from = `${this._from || this.getTable()} ${joinToken}`;
  return this;
};
Model.prototype._baseRightJoin = function (rightTable, key, op, val) {
  let joinToken = this._getJoinToken("RIGHT", rightTable, key, op, val);
  this._from = `${this._from || this.getTable()} ${joinToken}`;
  return this;
};
Model.prototype._baseFullJoin = function (rightTable, key, op, val) {
  let joinToken = this._getJoinToken("FULL", rightTable, key, op, val);
  this._from = `${this._from || this.getTable()} ${joinToken}`;
  return this;
};
Model.prototype._baseWhere = function (cond, op, dval) {
  let whereToken = this._baseGetConditionToken(cond, op, dval);
  return this._handleWhereToken(whereToken, "(%s) AND (%s)");
};
Model.prototype._baseGetConditionTokenFromTable = function (kwargs, logic) {
  let tokens = [];
  for (let [k, value] of Object.entries(kwargs)) {
    if (typeof k === "string") {
      tokens.push(`${k} = ${asLiteral(value)}`);
    } else {
      let token = Model.prototype._baseGetConditionToken.call(this, value);
      if (token !== undefined && token !== "") {
        tokens.push("(" + (token + ")"));
      }
    }
  }
  if (logic === undefined) {
    return tokens.join(" AND ");
  } else {
    return tokens.join(" " + (logic + " "));
  }
};
Model.prototype._baseGetConditionToken = function (cond, op, dval) {
  if (op === undefined) {
    let argtype = typeof cond;
    if (argtype === "object") {
      return Model.prototype._baseGetConditionTokenFromTable.call(this, cond);
    } else if (argtype === "string") {
      return cond;
    } else if (argtype === "function") {
      let oldWhere = this._where;
      this._where = undefined;
      let [res, err] = cond.call(this);
      if (res !== undefined) {
        if (res === this) {
          let groupWhere = this._where;
          if (groupWhere === undefined) {
            throw new Error(
              "no where token generate after calling condition function"
            );
          } else {
            this._where = oldWhere;
            return groupWhere;
          }
        } else {
          this._where = oldWhere;
          return res;
        }
      } else {
        throw new Error(err || "nil returned in condition function");
      }
    } else {
      throw new Error("invalid condition type: " + argtype);
    }
  } else if (dval === undefined) {
    return `${cond} = ${asLiteral(op)}`;
  } else {
    return `${cond} ${op} ${asLiteral(dval)}`;
  }
};
Model.prototype._baseWhereIn = function (cols, range) {
  let inToken = this._getInToken(cols, range);
  if (this._where) {
    this._where = `(${this._where}) AND ${inToken}`;
  } else {
    this._where = inToken;
  }
  return this;
};
Model.prototype._baseWhereNotIn = function (cols, range) {
  let notInToken = this._getInToken(cols, range, "NOT IN");
  if (this._where) {
    this._where = `(${this._where}) AND ${notInToken}`;
  } else {
    this._where = notInToken;
  }
  return this;
};
Model.prototype._baseWhereNull = function (col) {
  if (this._where) {
    this._where = `(${this._where}) AND ${col} IS NULL`;
  } else {
    this._where = col + " IS NULL";
  }
  return this;
};
Model.prototype._baseWhereNotNull = function (col) {
  if (this._where) {
    this._where = `(${this._where}) AND ${col} IS NOT NULL`;
  } else {
    this._where = col + " IS NOT NULL";
  }
  return this;
};
Model.prototype._baseWhereBetween = function (col, low, high) {
  if (this._where) {
    this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype._baseWhereNotBetween = function (col, low, high) {
  if (this._where) {
    this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype._baseOrWhereIn = function (cols, range) {
  let inToken = this._getInToken(cols, range);
  if (this._where) {
    this._where = `${this._where} OR ${inToken}`;
  } else {
    this._where = inToken;
  }
  return this;
};
Model.prototype._baseOrWhereNotIn = function (cols, range) {
  let notInToken = this._getInToken(cols, range, "NOT IN");
  if (this._where) {
    this._where = `${this._where} OR ${notInToken}`;
  } else {
    this._where = notInToken;
  }
  return this;
};
Model.prototype._baseOrWhereNull = function (col) {
  if (this._where) {
    this._where = `${this._where} OR ${col} IS NULL`;
  } else {
    this._where = col + " IS NULL";
  }
  return this;
};
Model.prototype._baseOrWhereNotNull = function (col) {
  if (this._where) {
    this._where = `${this._where} OR ${col} IS NOT NULL`;
  } else {
    this._where = col + " IS NOT NULL";
  }
  return this;
};
Model.prototype._baseOrWhereBetween = function (col, low, high) {
  if (this._where) {
    this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype._baseOrWhereNotBetween = function (col, low, high) {
  if (this._where) {
    this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.new = function (self) {
  return setmetatable(self || [], this);
};
Model.createModel = function (options) {
  let XodelClass = this.makeModelClass(this.normalize(options));
  return XodelProxy.createProxy(XodelClass);
};
Model.normalize = function (options) {
  let _extends = options._extends;
  let model = [];
  let optsFields = normalizeArrayAndHashFields(options.fields || []);
  let optsNames = options.fieldNames;
  if (!optsNames) {
    let selfNames = Object.keys(optsFields);
    if (_extends) {
      optsNames = Array.concat(_extends.fieldNames, selfNames).uniq();
    } else {
      optsNames = selfNames;
    }
  }
  model.fieldNames = normalizeFieldNames(clone(optsNames));
  model.fields = [];
  for (let [_, name] of optsNames.entries()) {
    checkReserved(name);
    if (this[name]) {
      throw new Error(
        `field name \`${name}\` conflicts with model class attributes`
      );
    }
    let field = optsFields[name];
    if (!field) {
      let tname = options.tableName || "[abstract model]";
      if (_extends) {
        field = _extends.fields[name];
        if (!field) {
          throw new Error(
            `'${tname}' field name '${name}' is not in fields and parent fields`
          );
        }
      } else {
        throw new Error(`'${tname}' field name '${name}' is not in fields`);
      }
    } else if (!isFieldClass(field)) {
      if (_extends) {
        let pfield = _extends.fields[name];
        if (pfield) {
          field = dict(pfield.getOptions(), field);
          if (pfield.model && field.model) {
            field.model = this.createModel({
              abstract: true,
              _extends: pfield.model,
              fields: field.model.fields,
              fieldNames: field.model.fieldNames,
            });
          }
        }
      } else {
      }
    } else {
    }
    if (!isFieldClass(field)) {
      model.fields[name] = makeFieldFromJson(field, { name: name });
    } else {
      model.fields[name] = makeFieldFromJson(field.getOptions(), {
        name: name,
        type: field.type,
      });
    }
  }
  for (let [key, value] of Object.entries(options)) {
    if (model[key] === undefined && !NON_MERGE_NAMES[key]) {
      model[key] = value;
    }
  }
  let abstract;
  if (options.abstract !== undefined) {
    abstract = !!options.abstract;
  } else {
    abstract = options.tableName === undefined;
  }
  model.abstract = abstract;
  model.__normalized__ = true;
  if (options.mixins) {
    return this.mergeModels([model, unpack(options.mixins)]);
  } else {
    return model;
  }
};
Model.makeModelClass = function (opts) {
  let model = dict.call(this, {
    tableName: opts.tableName,
    fields: opts.fields,
    fieldNames: opts.fieldNames,
    mixins: opts.mixins,
    _extends: opts._extends,
    abstract: opts.abstract,
    primaryKey: opts.primaryKey,
    defaultPrimaryKey: opts.defaultPrimaryKey,
    disableAutoPrimaryKey: opts.disableAutoPrimaryKey,
  });
  if (opts.dbOptions) {
    let dbQuery = Query(opts.dbOptions);
    model.prototype.query = function (statement) {
      return dbQuery(statement, this._compact);
    };
  }
  setmetatable(model, XodelMeta);
  model.__index = model;
  if (!model.tableName) {
    let namesHint =
      (model.fieldNames && model.fieldNames.join(",")) || "no field_names";
    throw new Error(
      `you must define table_name for a non-abstract model (${namesHint})`
    );
  }
  checkReserved(model.tableName);
  let pkDefined = false;
  model.foreignKeys = [];
  model.names = Array([]);
  for (let [name, field] of Object.entries(model.fields)) {
    let fkModel = field.reference;
    if (fkModel === "self") {
      fkModel = model;
      field.reference = model;
    }
    if (fkModel) {
      model.foreignKeys[name] = field;
    }
    if (field.primaryKey) {
      let pkName = field.name;
      assert(
        !pkDefined,
        `duplicated primary key: "${pkName}" and "${pkDefined}"`
      );
      pkDefined = pkName;
      model.primaryKey = pkName;
    } else if (field.autoNow) {
      model.autoNowName = field.name;
    } else if (field.autoNowAdd) {
    } else {
      model.names.push(name);
    }
  }
  let pkName = model.defaultPrimaryKey || "id";
  model.primaryKey = pkName;
  model.fields[pkName] = Field.integer({
    name: pkName,
    primaryKey: true,
    serial: true,
  });
  model.fieldNames.unshift(pkName);
  model.nameCache = [];
  model.labelToName = [];
  model.nameToLabel = [];
  for (let [name, field] of Object.entries(model.fields)) {
    model.labelToName[field.label] = name;
    model.nameToLabel[name] = field.label;
    model.nameCache[name] = model.tableName + ("." + name);
    if (field.dbType === Field.basefield.NOT_DEFIEND) {
      field.dbType = model.fields[field.referenceColumn].dbType;
    }
  }
  model.__isModelClass__ = true;
  model.XodelInstanceMeta = makeRecordMeta(model, this);
  return model;
};
Model.mixWithBase = function (...varargs) {
  return this.mix(baseModel, ...varargs);
};
Model.mix = function (...varargs) {
  return this.makeModelClass(this.mergeModels([...varargs]));
};
Model.mergeModels = function (models) {
  if (models.length < 2) {
    throw new Error("provide at least two models to merge");
  } else if (models.length === 2) {
    return this.mergeModel(unpack(models));
  } else {
    let merged = models[0];
    for (let i = 2; i <= models.length; i = i + 1) {
      merged = this.mergeModel(merged, models[i]);
    }
    return merged;
  }
};
Model.mergeModel = function (a, b) {
  let A = (a.__normalized__ && a) || this.normalize(a);
  let B = (b.__normalized__ && b) || this.normalize(b);
  let C = [];
  let fieldNames = (A.fieldNames + B.fieldNames).uniq();
  let fields = [];
  for (let [i, name] of fieldNames.entries()) {
    let af = A.fields[name];
    let bf = B.fields[name];
    if (af && bf) {
      fields[name] = Model.mergeField(af, bf);
    } else if (af) {
      fields[name] = af;
    } else {
      fields[name] = assert(
        bf,
        `can't find field ${name} for model ${B.tableName}`
      );
    }
  }
  for (let [i, M] of [A, B].entries()) {
    for (let [key, value] of Object.entries(M)) {
      if (!NON_MERGE_NAMES[key]) {
        C[key] = value;
      }
    }
  }
  C.fieldNames = fieldNames;
  C.fields = fields;
  return this.normalize(C);
};
Model.mergeField = function (a, b) {
  let aopts = (a.__isFieldClass__ && a.getOptions()) || clone(a);
  let bopts = (b.__isFieldClass__ && b.getOptions()) || clone(b);
  let options = dict(aopts, bopts);
  if (aopts.model && bopts.model) {
    options.model = this.mergeModel(aopts.model, bopts.model);
  }
  return makeFieldFromJson(options);
};
Model.all = function () {
  let records = assert(this.query("SELECT * FROM " + this.tableName));
  for (let i = 0; i < records.length; i = i + 1) {
    records[i] = this.load(records[i]);
  }
  return setmetatable(records, Array);
};
Model.save = function (input, names, key) {
  key = key || this.primaryKey;
  if (rawget(input, key) !== undefined) {
    return this.saveUpdate(input, names, key);
  } else {
    return this.saveCreate(input, names, key);
  }
};
Model.saveCreate = function (input, names, key) {
  let [data, err] = this.validateCreate(input, names);
  if (data === undefined) {
    throw new Error(err);
  } else {
    return this.createFrom(data, key);
  }
};
Model.saveUpdate = function (input, names, key) {
  let [data, err] = this.validateUpdate(input, names);
  if (data === undefined) {
    throw new Error(err);
  } else {
    key = key || this.primaryKey;
    data[key] = input[key];
    return this.updateFrom(data, key);
  }
};
Model.createFrom = function (data, key) {
  key = key || this.primaryKey;
  let [prepared, err] = this.prepareForDb(data);
  if (prepared === undefined) {
    throw new Error(err);
  }
  let created = this._baseInsert(this.newSql(), prepared)
    ._baseReturning(key)
    .execr();
  data[key] = created[0][key];
  return this.newRecord(data);
};
Model.updateFrom = function (data, key) {
  key = key || this.primaryKey;
  let [prepared, err] = this.prepareForDb(data, undefined, true);
  if (prepared === undefined) {
    throw new Error(err);
  }
  let lookValue = assert(data[key], "no key provided for update");
  let res = this._baseUpdate(this.newSql(), prepared)
    .where({ [key]: lookValue })
    .execr();
  if (res.affectedRows === 1) {
    return this.newRecord(data);
  } else if (res.affectedRows === 0) {
    throw new Error(
      `update failed, record does not exist(model:${this.tableName}, key:${key}, value:${lookValue})`
    );
  } else {
    throw new Error(
      `not 1 record are updated(model:${this.tableName}, key:${key}, value:${lookValue})`
    );
  }
};
Model.prepareForDb = function (data, columns, isUpdate) {
  let prepared = [];
  for (let [_, name] of (columns || this.names).entries()) {
    let field = this.fields[name];
    if (!field) {
      throw new Error(
        `invalid field name '${name}' for model '${this.tableName}'`
      );
    }
    let value = data[name];
    if (field.prepareForDb && value !== undefined) {
      let [val, err] = field.prepareForDb(value, data);
      if (val === undefined && err) {
        throw new Error({ name: name, err: err, label: field.label });
      } else {
        prepared[name] = val;
      }
    } else {
      prepared[name] = value;
    }
  }
  if (isUpdate && this.autoNowName) {
    prepared[this.autoNowName] = ngxLocaltime();
  }
  return prepared;
};
Model.validate = function (input, names, key) {
  if (rawget(input, key || this.primaryKey) !== undefined) {
    return this.validateUpdate(input, names);
  } else {
    return this.validateCreate(input, names);
  }
};
Model.validateCreate = function (input, names) {
  let data = [];
  let value, err;
  for (let [_, name] of (names || this.names).entries()) {
    let field = this.fields[name];
    if (!field) {
      throw new Error(
        `invalid field name '${name}' for model '${this.tableName}'`
      );
    }
    [value, err] = field.validate(rawget(input, name), input);
    if (err !== undefined) {
      throw new Error({
        name: name,
        err: err,
        label: field.label,
        httpCode: 422,
      });
    } else if (field._jsDefault && (value === undefined || value === "")) {
      if (typeof field._jsDefault !== "function") {
        value = field._jsDefault;
      } else {
        [value, err] = field._jsDefault(input);
        if (value === undefined) {
          throw new Error({
            name: name,
            err: err,
            label: field.label,
            httpCode: 422,
          });
        }
      }
    }
    data[name] = value;
  }
  if (!this.clean) {
    return data;
  } else {
    let [res, cleanErr] = this.clean(data);
    if (res === undefined) {
      throw new Error(this.parseErrorMessage(cleanErr));
    } else {
      return res;
    }
  }
};
Model.validateUpdate = function (input, names) {
  let data = [];
  let value, err;
  for (let [_, name] of (names || this.names).entries()) {
    let field = this.fields[name];
    if (!field) {
      throw new Error(
        `invalid field name '${name}' for model '${this.tableName}'`
      );
    }
    value = rawget(input, name);
    if (value !== undefined) {
      [value, err] = field.validate(value, input);
      if (err !== undefined) {
        throw new Error({
          name: name,
          err: err,
          label: field.label,
          httpCode: 422,
        });
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
    let [res, cleanErr] = this.clean(data);
    if (res === undefined) {
      throw new Error(this.parseErrorMessage(cleanErr));
    } else {
      return res;
    }
  }
};
Model.parseErrorMessage = function (err) {
  if (typeof err === "object") {
    return err;
  }
  let captured = match(err, "^(?<name>.+?)~(?<message>.+?)$", "josui");
  if (!captured) {
    throw new Error("can't parse this model error message: " + err);
  } else {
    let name = captured.name;
    let message = captured.message;
    let label = this.nameToLabel[name];
    return { name: name, err: message, label: label, httpCode: 422 };
  }
};
Model.load = function (data) {
  let err;
  for (let [_, name] of this.names.entries()) {
    let field = this.fields[name];
    let value = data[name];
    if (value !== undefined) {
      if (!field.load) {
        data[name] = value;
      } else {
        [data[name], err] = field.load(value);
        if (err) {
          throw new Error(err);
        }
      }
    }
  }
  return this.newRecord(data);
};
Model.validateCreateData = function (rows, columns) {
  let errObj, cleaned;
  columns = columns || this._getKeys(rows);
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, errObj] = this.validateCreate(row, columns);
      if (errObj) {
        errObj.index = i;
        throw new Error(errObj);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, errObj] = this.validateCreate(rows, columns);
    if (errObj) {
      throw new Error(errObj);
    }
  }
  return [cleaned, columns];
};
Model.validateUpdateData = function (rows, columns) {
  let errObj, cleaned;
  columns = columns || this._getKeys(rows);
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, errObj] = this.validateUpdate(row, columns);
      if (errObj) {
        errObj.index = i;
        throw new Error(errObj);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, errObj] = this.validateUpdate(rows, columns);
    if (errObj) {
      throw new Error(errObj);
    }
  }
  return [cleaned, columns];
};
Model.validateCreateRows = function (rows, key, columns) {
  let [checkedRows, checkedKey] = checkUpsertKey(rows, key || this.primaryKey);
  if (checkedRows === undefined) {
    throw new Error(checkedKey);
  }
  let [cleanedRows, cleanedColumns] = this.validateCreateData(
    checkedRows,
    columns
  );
  if (cleanedRows === undefined) {
    throw new Error(cleanedColumns);
  }
  return [cleanedRows, cleanedColumns, checkedKey];
};
Model.validateUpdateRows = function (rows, key, columns) {
  let [checkedRows, checkedKey] = checkUpsertKey(rows, key || this.primaryKey);
  if (checkedRows === undefined) {
    throw new Error(checkedKey);
  }
  let [cleanedRows, cleanedColumns] = this.validateUpdateData(
    checkedRows,
    columns
  );
  if (cleanedRows === undefined) {
    throw new Error(cleanedColumns);
  }
  return [cleanedRows, cleanedColumns, checkedKey];
};
Model.prepareDbRows = function (rows, columns, isUpdate) {
  let err, cleaned;
  columns = columns || this._getKeys(rows);
  if (rows[0]) {
    cleaned = [];
    for (let [i, row] of rows.entries()) {
      [row, err] = this.prepareForDb(row, columns, isUpdate);
      if (err !== undefined) {
        throw new Error(err);
      }
      cleaned[i] = row;
    }
  } else {
    [cleaned, err] = this.prepareForDb(rows, columns, isUpdate);
    if (err !== undefined) {
      throw new Error(err);
    }
  }
  if (isUpdate) {
    let utime = this.autoNowName;
    if (utime && !Array(columns).includes(utime)) {
      columns.push(utime);
    }
    return [cleaned, columns];
  } else {
    return [cleaned, columns];
  }
};
Model._getKeys = function (rows) {
  let columns = [];
  if (rows[0]) {
    let d = [];
    for (let [_, row] of rows.entries()) {
      for (let [k, _] of Object.entries(row)) {
        if (!d[k]) {
          d[k] = true;
          columns.push(k);
        }
      }
    }
  } else {
    for (let [k, _] of Object.entries(rows)) {
      columns.push(k);
    }
  }
  return columns;
};
Model.prototype.pcall = function () {
  this._pcall = true;
  return this;
};
Model.prototype.error = function (err, level) {
  if (this._pcall) {
    throw new Error(err);
  } else {
    throw new Error(err);
  }
};
Model.prototype._rowsToArray = function (rows, columns) {
  let c = columns.length;
  let n = rows.length;
  let res = tableNew(n, 0);
  let fields = this.fields;
  for (let i = 0; i < n; i = i + 1) {
    res[i] = tableNew(c, 0);
  }
  for (let [i, col] of columns.entries()) {
    for (let j = 0; j < n; j = j + 1) {
      let v = rows[j][col];
      if (v !== undefined && v !== "") {
        res[j][i] = v;
      } else if (fields[col]) {
        let _jsDefault = fields[col]._jsDefault;
        if (_jsDefault !== undefined) {
          res[j][i] = fields[col].getDefault(rows[j]);
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
Model.prototype._getInsertValuesToken = function (row, columns) {
  let valueList = [];
  if (!columns) {
    columns = [];
    for (let [k, v] of Object.entries(row)) {
      columns.push(k);
      valueList.push(v);
    }
  } else {
    for (let [_, col] of Object.entries(columns)) {
      let v = row[col];
      if (v !== undefined) {
        valueList.push(v);
      } else {
        valueList.push(DEFAULT);
      }
    }
  }
  return [asLiteral(valueList), columns];
};
Model.prototype._getBulkInsertValuesToken = function (rows, columns) {
  columns = columns || this._getKeys(rows);
  rows = this._rowsToArray(rows, columns);
  return [map(rows, asLiteral), columns];
};
Model.prototype._getUpdateTokenWithPrefix = function (columns, key, tableName) {
  let tokens = [];
  if (typeof key === "string") {
    for (let [i, col] of columns.entries()) {
      if (col !== key) {
        tokens.push(`${col} = ${tableName}.${col}`);
      }
    }
  } else {
    let sets = [];
    for (let [i, k] of key.entries()) {
      sets[k] = true;
    }
    for (let [i, col] of columns.entries()) {
      if (!sets[col]) {
        tokens.push(`${col} = ${tableName}.${col}`);
      }
    }
  }
  return tokens.join(", ");
};
Model.prototype._getSelectToken = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      let tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = this._getSelectColumn(a[i]);
      }
      return asToken(tokens);
    } else if (typeof a === "string") {
      return this._getSelectColumn(a);
    } else {
      return asToken(a);
    }
  } else {
    a = this._getSelectColumn(a);
    b = this._getSelectColumn(b);
    let s = asToken(a) + (", " + asToken(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      let name = varargs[i];
      s = s + (", " + asToken(this._getSelectColumn(name)));
    }
    return s;
  }
};
Model.prototype._getSelectTokenLiteral = function (a, b, ...varargs) {
  if (b === undefined) {
    if (typeof a === "object") {
      let tokens = [];
      for (let i = 0; i < a.length; i = i + 1) {
        tokens[i] = asLiteral(a[i]);
      }
      return asToken(tokens);
    } else {
      return asLiteral(a);
    }
  } else {
    let s = asLiteral(a) + (", " + asLiteral(b));
    for (let i = 0; i < varargs.length; i = i + 1) {
      let name = varargs[i];
      s = s + (", " + asLiteral(name));
    }
    return s;
  }
};
Model.prototype._getUpdateToken = function (row, columns) {
  let kv = [];
  if (!columns) {
    for (let [k, v] of Object.entries(row)) {
      kv.push(`${k} = ${asLiteral(v)}`);
    }
  } else {
    for (let [_, k] of columns.entries()) {
      let v = row[k];
      kv.push(`${k} = ${(v !== undefined && asLiteral(v)) || "DEFAULT"}`);
    }
  }
  return kv.join(", ");
};
Model.prototype._getWithToken = function (name, token) {
  if (token === undefined) {
    return name;
  } else if (this.isInstance(token)) {
    return `${name} AS (${token.statement()})`;
  } else {
    return `${name} AS ${token}`;
  }
};
Model.prototype._getInsertToken = function (row, columns) {
  let [valuesToken, insertColumns] = this._getInsertValuesToken(row, columns);
  return `(${asToken(insertColumns)}) VALUES ${valuesToken}`;
};
Model.prototype._getBulkInsertToken = function (rows, columns) {
  [rows, columns] = this._getBulkInsertValuesToken(rows, columns);
  return `(${asToken(columns)}) VALUES ${asToken(rows)}`;
};
Model.prototype._setSelectSubqueryInsertToken = function (subQuery, columns) {
  let columnsToken = asToken(columns || subQuery._select || "");
  if (columnsToken !== "") {
    this._insert = `(${columnsToken}) ${subQuery.statement()}`;
  } else {
    this._insert = subQuery.statement();
  }
};
Model.prototype._setCudSubqueryInsertToken = function (subQuery) {
  let cteReturn = subQuery._cteReturning;
  if (cteReturn) {
    let cteColumns = cteReturn.columns;
    let insertColumns = list(cteColumns, cteReturn.literalColumns);
    let cudSelectQuery = Model.new({ tableName: "d" })._baseSelect(
      insertColumns
    );
    this.with(`d(${asToken(insertColumns)})`, subQuery);
    this._insert = `(${asToken(insertColumns)}) ${cudSelectQuery.statement()}`;
  } else if (subQuery._returningArgs) {
    let insertColumns = flat(subQuery._returningArgs);
    let cudSelectQuery = Model.new({ tableName: "d" })._baseSelect(
      insertColumns
    );
    this.with(`d(${asToken(insertColumns)})`, subQuery);
    this._insert = `(${asToken(insertColumns)}) ${cudSelectQuery.statement()}`;
  }
};
Model.prototype._getUpsertToken = function (row, key, columns) {
  let [valuesToken, insertColumns] = this._getInsertValuesToken(row, columns);
  let insertToken = `(${asToken(
    insertColumns
  )}) VALUES ${valuesToken} ON CONFLICT (${this._getSelectToken(key)})`;
  if (
    (typeof key === "object" && key.length === insertColumns.length) ||
    insertColumns.length === 1
  ) {
    return `${insertToken} DO NOTHING`;
  } else {
    return `${insertToken} DO UPDATE SET ${this._getUpdateTokenWithPrefix(
      insertColumns,
      key,
      "EXCLUDED"
    )}`;
  }
};
Model.prototype._getBulkUpsertToken = function (rows, key, columns) {
  [rows, columns] = this._getBulkInsertValuesToken(rows, columns);
  let insertToken = `(${asToken(columns)}) VALUES ${asToken(
    rows
  )} ON CONFLICT (${this._baseGetSelectToken(key)})`;
  if (
    (typeof key === "object" && key.length === columns.length) ||
    columns.length === 1
  ) {
    return `${insertToken} DO NOTHING`;
  } else {
    return `${insertToken} DO UPDATE SET ${this._getUpdateTokenWithPrefix(
      columns,
      key,
      "EXCLUDED"
    )}`;
  }
};
Model.prototype._getUpsertQueryToken = function (rows, key, columns) {
  let columnsToken = this._getSelectToken(columns);
  let insertToken = `(${columnsToken}) ${rows.statement()} ON CONFLICT (${this._getSelectToken(
    key
  )})`;
  if (
    (typeof key === "object" && key.length === columns.length) ||
    columns.length === 1
  ) {
    return `${insertToken} DO NOTHING`;
  } else {
    return `${insertToken} DO UPDATE SET ${this._getUpdateTokenWithPrefix(
      columns,
      key,
      "EXCLUDED"
    )}`;
  }
};
Model.prototype._getJoinExpr = function (key, op, val) {
  if (op === undefined) {
    return key;
  } else if (val === undefined) {
    return `${key} = ${op}`;
  } else {
    return `${key} ${op} ${val}`;
  }
};
Model.prototype._getJoinToken = function (joinType, rightTable, key, op, val) {
  if (key !== undefined) {
    return `${joinType} JOIN ${rightTable} ON (${this._getJoinExpr(
      key,
      op,
      val
    )})`;
  } else {
    return `${joinType} JOIN ${rightTable}`;
  }
};
Model.prototype._getInToken = function (cols, range, op) {
  cols = asToken(cols);
  op = op || "IN";
  if (typeof range === "object") {
    if (this.isInstance(range)) {
      return `(${cols}) ${op} (${range.statement()})`;
    } else {
      return `(${cols}) ${op} ${asLiteral(range)}`;
    }
  } else {
    return `(${cols}) ${op} ${range}`;
  }
};
Model.prototype._getUpdateQueryToken = function (subSelect, columns) {
  let columnsToken =
    (columns && this._getSelectToken(columns)) || subSelect._select;
  return `(${columnsToken}) = (${subSelect.statement()})`;
};
Model.prototype._baseGetUpdateQueryToken = function (subSelect, columns) {
  let columnsToken =
    (columns && this._baseGetSelectToken(columns)) || subSelect._select;
  return `(${columnsToken}) = (${subSelect.statement()})`;
};
Model.prototype._getJoinConditions = function (key, leftTable, rightTable) {
  if (typeof key === "string") {
    return `${leftTable}.${key} = ${rightTable}.${key}`;
  }
  let res = [];
  for (let [_, k] of key.entries()) {
    res.push(`${leftTable}.${k} = ${rightTable}.${k}`);
  }
  return res.join(" AND ");
};
Model.prototype._getCteValuesLiteral = function (rows, columns, noCheck) {
  columns = columns || this._getKeys(rows);
  rows = this._rowsToArray(rows, columns);
  let firstRow = rows[0];
  for (let [i, col] of columns.entries()) {
    let field = this._findFieldModel(col);
    if (field) {
      firstRow[i] = `${asLiteral(firstRow[i])}::${field.dbType}`;
    } else if (noCheck) {
      firstRow[i] = asLiteral(firstRow[i]);
    } else {
      throw new Error("invalid field name for _get_cte_values_literal: " + col);
    }
  }
  let res = [];
  res[0] = "(" + (asToken(firstRow) + ")");
  for (let i = 2; i <= rows.length; i = i + 1) {
    res[i] = asLiteral(rows[i]);
  }
  return [res, columns];
};
Model.prototype._handleJoin = function (joinType, joinTable, joinCond) {
  if (this._update) {
    this.from(joinTable);
    this.where(joinCond);
  } else if (this._delete) {
    this.using(joinTable);
    this.where(joinCond);
  } else if (joinType === "INNER") {
    this._baseJoin(joinTable, joinCond);
  } else if (joinType === "LEFT") {
    this._baseLeftJoin(joinTable, joinCond);
  } else if (joinType === "RIGHT") {
    this._baseRightJoin(joinTable, joinCond);
  } else {
    this._baseFullJoin(joinTable, joinCond);
  }
};
Model.prototype._registerJoinModel = function (joinArgs, joinType) {
  joinType = joinType || joinArgs.joinType || "INNER";
  let find = true;
  let model = joinArgs.model || this;
  let fkModel = joinArgs.fkModel;
  let column = joinArgs.column;
  let fkColumn = joinArgs.fkColumn;
  let joinKey;
  if (joinArgs.joinKey === undefined) {
    if (this.tableName === model.tableName) {
      joinKey = column + ("__" + fkModel.tableName);
    } else {
      joinKey = `${joinType}__${model.tableName}__${column}__${fkModel.tableName}__${fkColumn}`;
    }
  } else {
    joinKey = joinArgs.joinKey;
  }
  if (!this._joinKeys) {
    this._joinKeys = [];
  }
  let joinObj = this._joinKeys[joinKey];
  if (!joinObj) {
    find = false;
    joinObj = {
      joinType: joinType,
      model: model,
      column: column,
      alias: joinArgs.alias || model.tableName,
      fkModel: fkModel,
      fkColumn: fkColumn,
      fkAlias: "T" + this._getJoinNumber(),
    };
    let joinTable = `${fkModel.tableName} ${joinObj.fkAlias}`;
    let joinCond = `${joinObj.alias}.${joinObj.column} = ${joinObj.fkAlias}.${joinObj.fkColumn}`;
    this._handleJoin(joinType, joinTable, joinCond);
    this._joinKeys[joinKey] = joinObj;
  }
  return [joinObj, find];
};
Model.prototype._findFieldModel = function (col) {
  let field = this.fields[col];
  if (field) {
    return [field, this, this._as || this.tableName];
  }
  if (!this._joinKeys) {
    return;
  }
  for (let [_, joinObj] of Object.entries(this._joinKeys)) {
    let fkField = joinObj.fkModel.fields[col];
    if (joinObj.model.tableName === this.tableName && fkField) {
      return [
        fkField,
        joinObj.fkModel,
        joinObj.fkAlias || joinObj.fkModel.tableName,
      ];
    }
  }
};
Model.prototype._getWhereKey = function (key) {
  let [a, b] = key.find("__", 1, true);
  if (!a) {
    return [this._getColumn(key), "eq"];
  }
  let e = key.sub(1, a - 1);
  let [field, model, prefix] = this._findFieldModel(e);
  if (!field || !model) {
    throw new Error(`${e} is not a valid field name for ${this.tableName}`);
  }
  let i, state, fkModel, rc, joinKey;
  let op = "eq";
  let fieldName = e;
  if (field.reference) {
    fkModel = field.reference;
    rc = field.referenceColumn;
    state = FOREIGN_KEY;
  } else {
    state = NON_FOREIGN_KEY;
  }
  while (true) {
    i = b + 1;
    [a, b] = key.find("__", i, true);
    if (!a) {
      e = key.sub(i);
    } else {
      e = key.sub(i, a - 1);
    }
    if (state === NON_FOREIGN_KEY) {
      op = e;
      state = END;
    } else if (state === FOREIGN_KEY) {
      let fieldOfFk = fkModel.fields[e];
      if (fieldOfFk) {
        if (!joinKey) {
          joinKey = fieldName + ("__" + fkModel.tableName);
        } else {
          joinKey = joinKey + ("__" + fieldName);
        }
        let joinObj = this._registerJoinModel({
          joinKey: joinKey,
          model: model,
          column: fieldName,
          alias: prefix || model.tableName,
          fkModel: fkModel,
          fkColumn: rc,
        });
        prefix = joinObj.fkAlias;
        if (fieldOfFk.reference) {
          model = fkModel;
          fkModel = fieldOfFk.reference;
          rc = fieldOfFk.referenceColumn;
        } else {
          state = NON_FOREIGN_KEY;
        }
        fieldName = e;
      } else {
        op = e;
        state = END;
      }
    } else {
      throw new Error(
        `invalid cond table key parsing state ${state} with token ${e}`
      );
    }
    if (!a) {
      break;
    }
  }
  return [prefix + ("." + fieldName), op];
};
Model.prototype._getColumn = function (key) {
  if (this.fields[key]) {
    return (this._as && this._as + ("." + key)) || this.nameCache[key];
  }
  if (!this._joinKeys) {
    return key;
  }
  for (let [_, joinObj] of Object.entries(this._joinKeys)) {
    if (
      joinObj.model.tableName === this.tableName &&
      joinObj.fkModel.fields[key]
    ) {
      return joinObj.fkAlias + ("." + key);
    }
  }
  return key;
};
Model.prototype._getSelectColumn = function (key) {
  if (typeof key !== "string") {
    return key;
  } else {
    return this._getColumn(key);
  }
};
Model.prototype._getExprToken = function (value, key, op) {
  if (op === "eq") {
    return `${key} = ${asLiteral(value)}`;
  } else if (op === "in") {
    return `${key} IN ${asLiteral(value)}`;
  } else if (op === "notin") {
    return `${key} NOT IN ${asLiteral(value)}`;
  } else if (COMPARE_OPERATORS[op]) {
    return `${key} ${COMPARE_OPERATORS[op]} ${asLiteral(value)}`;
  } else if (op === "contains") {
    return `${key} LIKE '%${value.gsub("'", "''")}%'`;
  } else if (op === "startswith") {
    return `${key} LIKE '${value.gsub("'", "''")}%'`;
  } else if (op === "endswith") {
    return `${key} LIKE '%${value.gsub("'", "''")}'`;
  } else if (op === "null") {
    if (value) {
      return `${key} IS NULL`;
    } else {
      return `${key} IS NOT NULL`;
    }
  } else {
    throw new Error("invalid sql op: " + tostring(op));
  }
};
Model.prototype._getJoinNumber = function () {
  if (this._joinKeys) {
    return nkeys(this._joinKeys) + 1;
  } else {
    return 1;
  }
};
Model.prototype._handleWhereToken = function (whereToken, tpl) {
  if (whereToken === "") {
    return this;
  } else if (this._where === undefined) {
    this._where = whereToken;
  } else {
    this._where = stringFormat(tpl, this._where, whereToken);
  }
  return this;
};
Model.prototype._getConditionTokenFromTable = function (kwargs, logic) {
  let tokens = [];
  for (let [k, value] of Object.entries(kwargs)) {
    if (typeof k === "string") {
      tokens.push(this._getExprToken(value, this._getWhereKey(k)));
    } else {
      let token = this._getConditionToken(value);
      if (token !== undefined && token !== "") {
        tokens.push("(" + (token + ")"));
      }
    }
  }
  if (logic === undefined) {
    return tokens.join(" AND ");
  } else {
    return tokens.join(" " + (logic + " "));
  }
};
Model.prototype._getConditionToken = function (cond, op, dval) {
  if (op === undefined) {
    if (typeof cond === "object") {
      return Model.prototype._getConditionTokenFromTable.call(this, cond);
    } else {
      return Model.prototype._baseGetConditionToken.call(this, cond);
    }
  } else if (dval === undefined) {
    return `${this._getColumn(cond)} = ${asLiteral(op)}`;
  } else {
    return `${this._getColumn(cond)} ${op} ${asLiteral(dval)}`;
  }
};
Model.prototype._getConditionTokenOr = function (cond, op, dval) {
  if (typeof cond === "object") {
    return this._getConditionTokenFromTable(cond, "OR");
  } else {
    return this._getConditionToken(cond, op, dval);
  }
};
Model.prototype._getConditionTokenNot = function (cond, op, dval) {
  let token;
  if (typeof cond === "object") {
    token = this._getConditionTokenFromTable(cond, "OR");
  } else {
    token = this._getConditionToken(cond, op, dval);
  }
  return (token !== "" && `NOT (${token})`) || "";
};
Model.prototype._handleSetOption = function (otherSql, innerAttr) {
  if (!this[innerAttr]) {
    this[innerAttr] = otherSql.statement();
  } else {
    this[innerAttr] = `(${this[innerAttr]}) ${
      PG_SET_MAP[innerAttr]
    } (${otherSql.statement()})`;
  }
  if (this !== Model) {
    this.statement = this._statementForSet;
  } else {
    throw new Error("don't call _handle_set_option directly on Xodel class");
  }
  return this;
};
Model.prototype._statementForSet = function () {
  let statement = Model.prototype.statement.call(this);
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
};
Model.prototype.statement = function () {
  let tableName = this.getTable();
  let statement = assembleSql({
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
};
Model.prototype.with = function (name, token) {
  let withToken = this._getWithToken(name, token);
  if (this._with) {
    this._with = `${this._with}, ${withToken}`;
  } else {
    this._with = withToken;
  }
  return this;
};
Model.prototype.union = function (otherSql) {
  return this._handleSetOption(otherSql, "_union");
};
Model.prototype.unionAll = function (otherSql) {
  return this._handleSetOption(otherSql, "_union_all");
};
Model.prototype.except = function (otherSql) {
  return this._handleSetOption(otherSql, "_except");
};
Model.prototype.exceptAll = function (otherSql) {
  return this._handleSetOption(otherSql, "_except_all");
};
Model.prototype.intersect = function (otherSql) {
  return this._handleSetOption(otherSql, "_intersect");
};
Model.prototype.intersectAll = function (otherSql) {
  return this._handleSetOption(otherSql, "_intersect_all");
};
Model.prototype.as = function (tableAlias) {
  this._as = tableAlias;
  return this;
};
Model.prototype.withValues = function (name, rows) {
  let columns = this._getKeys(rows[0]);
  [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
  let cteName = `${name}(${columns.join(", ")})`;
  let cteValues = `(VALUES ${asToken(rows)})`;
  return this.with(cteName, cteValues);
};
Model.prototype.insert = function (rows, columns) {
  if (!this.isInstance(rows)) {
    let vrows, vcolumns, prows, pcolumns;
    if (!this._skipValidate) {
      [vrows, vcolumns] = this.validateCreateData(rows, columns);
      if (vrows === undefined) {
        throw new Error(vcolumns);
      }
    } else {
      vrows = rows;
      vcolumns = columns;
    }
    [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns);
    if (prows === undefined) {
      throw new Error(pcolumns);
    }
    return Model.prototype._baseInsert.call(this, prows, pcolumns);
  } else {
    return Model.prototype._baseInsert.call(this, rows, columns);
  }
};
Model.prototype.update = function (row, columns) {
  if (typeof row === "string") {
    return Model.prototype._baseUpdate.call(this, row);
  } else if (!this.isInstance(row)) {
    let vrow, verr;
    if (!this._skipValidate) {
      [vrow, verr] = this.validateUpdate(row, columns);
      if (vrow === undefined) {
        throw new Error(verr);
      }
    } else {
      vrow = row;
    }
    let [prow, pcolumns] = this.prepareDbRows(vrow, columns, true);
    if (prow === undefined) {
      throw new Error(pcolumns);
    }
    return Model.prototype._baseUpdate.call(this, prow, pcolumns);
  } else {
    return Model.prototype._baseUpdate.call(this, row, columns);
  }
};
Model.prototype.getMultiple = function (keys, columns) {
  if (this._commit === undefined || this._commit) {
    return Model.prototype._baseGetMultiple.call(this, keys, columns).exec();
  } else {
    return Model.prototype._baseGetMultiple.call(this, keys, columns);
  }
};
Model.isInstance = function (row) {
  return isSqlInstance(row);
};
Model.prototype.merge = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  let vrows, vcolumns, prows, pcolumns, vkey;
  if (!this._skipValidate) {
    [vrows, vcolumns, vkey] = this.validateCreateRows(rows, key, columns);
    if (vrows === undefined) {
      throw new Error(vcolumns);
    }
  } else {
    vrows = rows;
    vkey = key;
    vcolumns = columns;
  }
  [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, false);
  if (prows === undefined) {
    throw new Error(pcolumns);
  }
  self2 = Model.prototype._baseMerge
    .call(this, prows, vkey, pcolumns)
    .returning(key)
    .compact();
  if (this._commit === undefined || this._commit) {
    return this.exec();
  } else {
    return this;
  }
};
Model.prototype.upsert = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  let vrows, vcolumns, prows, pcolumns, vkey;
  if (!this._skipValidate) {
    [vrows, vcolumns, vkey] = this.validateCreateRows(rows, key, columns);
    if (vrows === undefined) {
      throw new Error(vcolumns);
    }
  } else {
    vrows = rows;
    vkey = key;
    vcolumns = columns;
  }
  [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, false);
  if (prows === undefined) {
    throw new Error(pcolumns);
  }
  self2 = Model.prototype._baseUpsert
    .call(this, prows, vkey, pcolumns)
    .returning(key)
    .compact();
  if (this._commit === undefined || this._commit) {
    return this.exec();
  } else {
    return this;
  }
};
Model.prototype.updates = function (rows, key, columns) {
  if (rows.length === 0) {
    throw new Error("empty rows passed to merge");
  }
  let vrows, vcolumns, prows, pcolumns, vkey;
  if (!this._skipValidate) {
    [vrows, vcolumns, vkey] = this.validateUpdateRows(rows, key, columns);
    if (vrows === undefined) {
      throw new Error(vcolumns);
    }
  } else {
    vrows = rows;
    vkey = key;
    vcolumns = columns;
  }
  [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, true);
  if (prows === undefined) {
    throw new Error(pcolumns);
  }
  self2 = Model.prototype._baseUpdates
    .call(this, prows, vkey, pcolumns)
    .returning(key)
    .compact();
  if (this._commit === undefined || this._commit) {
    return this.exec();
  } else {
    return this;
  }
};
Model.prototype.getMerge = function (rows, key) {
  let columns = this._getKeys(rows[0]);
  [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
  let joinCond = this._getJoinConditions(key, "V", this._as || this.tableName);
  let cteName = `V(${columns.join(", ")})`;
  let cteValues = `(VALUES ${asToken(rows)})`;
  self2 = Model.prototype._baseSelect
    .call(this, "V.*")
    .with(cteName, cteValues)
    ._baseRightJoin("V", joinCond);
  if (this._commit === undefined || this._commit) {
    return this.execr();
  } else {
    return this;
  }
};
Model.prototype.copy = function () {
  let copySql = [];
  for (let [key, value] of Object.entries(this)) {
    if (typeof value === "object") {
      copySql[key] = clone(value);
    } else {
      copySql[key] = value;
    }
  }
  return setmetatable(copySql, getmetatable.call(this));
};
Model.prototype.delete = function (a, b, c) {
  this._delete = true;
  if (a !== undefined) {
    this.where(a, b, c);
  }
  return this;
};
Model.prototype.distinct = function () {
  this._distinct = true;
  return this;
};
Model.prototype.select = function (a, b, ...varargs) {
  let s = this._getSelectToken(a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Model.prototype.selectLiteral = function (a, b, ...varargs) {
  let s = this._getSelectTokenLiteral(a, b, ...varargs);
  if (!this._select) {
    this._select = s;
  } else if (s !== undefined && s !== "") {
    this._select = this._select + (", " + s);
  }
  return this;
};
Model.prototype.returning = function (a, b, ...varargs) {
  let s = this._getSelectToken(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  } else {
    return this;
  }
  if (this._returningArgs) {
    this._returningArgs = [this._returningArgs, a, b, ...varargs];
  } else {
    this._returningArgs = [a, b, ...varargs];
  }
  return this;
};
Model.prototype.returningLiteral = function (a, b, ...varargs) {
  let s = this._getSelectTokenLiteral(a, b, ...varargs);
  if (!this._returning) {
    this._returning = s;
  } else if (s !== undefined && s !== "") {
    this._returning = this._returning + (", " + s);
  }
  if (this._returningArgs) {
    this._returningArgs = [this._returningArgs, a, b, ...varargs];
  } else {
    this._returningArgs = [a, b, ...varargs];
  }
  return this;
};
Model.prototype.cteReturning = function (opts) {
  this._cteReturning = opts;
  return this;
};
Model.prototype.group = function (...varargs) {
  if (!this._group) {
    this._group = this._getSelectToken(...varargs);
  } else {
    this._group = this._group + (", " + this._getSelectToken(...varargs));
  }
  return this;
};
Model.prototype.groupBy = function (...varargs) {
  return this.group(...varargs);
};
Model.prototype.order = function (...varargs) {
  if (!this._order) {
    this._order = this._getSelectToken(...varargs);
  } else {
    this._order = this._order + (", " + this._getSelectToken(...varargs));
  }
  return this;
};
Model.prototype.orderBy = function (...varargs) {
  return this.order(...varargs);
};
Model.prototype.using = function (a, ...varargs) {
  this._delete = true;
  this._using = this._getSelectToken(a, ...varargs);
  return this;
};
Model.prototype.from = function (a, ...varargs) {
  if (!this._from) {
    this._from = this._getSelectToken(a, ...varargs);
  } else {
    this._from = this._from + (", " + this._getSelectToken(a, ...varargs));
  }
  return this;
};
Model.prototype.getTable = function () {
  return (
    (this._as === undefined && this.tableName) ||
    this.tableName + (" AS " + this._as)
  );
};
Model.prototype.join = function (joinArgs, key, op, val) {
  if (typeof joinArgs === "object") {
    this._registerJoinModel(joinArgs, "INNER");
  } else {
    Model.prototype._baseJoin.call(this, joinArgs, key, op, val);
  }
  return this;
};
Model.prototype.innerJoin = function (joinArgs, key, op, val) {
  if (typeof joinArgs === "object") {
    this._registerJoinModel(joinArgs, "INNER");
  } else {
    Model.prototype._baseJoin.call(this, joinArgs, key, op, val);
  }
  return this;
};
Model.prototype.leftJoin = function (joinArgs, key, op, val) {
  if (typeof joinArgs === "object") {
    this._registerJoinModel(joinArgs, "LEFT");
  } else {
    Model.prototype._baseLeftJoin.call(this, joinArgs, key, op, val);
  }
  return this;
};
Model.prototype.rightJoin = function (joinArgs, key, op, val) {
  if (typeof joinArgs === "object") {
    this._registerJoinModel(joinArgs, "RIGHT");
  } else {
    Model.prototype._baseRightJoin.call(this, joinArgs, key, op, val);
  }
  return this;
};
Model.prototype.fullJoin = function (joinArgs, key, op, val) {
  if (typeof joinArgs === "object") {
    this._registerJoinModel(joinArgs, "FULL");
  } else {
    Model.prototype._baseFullJoin.call(this, joinArgs, key, op, val);
  }
  return this;
};
Model.prototype.limit = function (n) {
  this._limit = n;
  return this;
};
Model.prototype.offset = function (n) {
  this._offset = n;
  return this;
};
Model.prototype.where = function (cond, op, dval) {
  let whereToken = this._getConditionToken(cond, op, dval);
  return this._handleWhereToken(whereToken, "(%s) AND (%s)");
};
Model.prototype.whereOr = function (cond, op, dval) {
  let whereToken = this._getConditionTokenOr(cond, op, dval);
  return this._handleWhereToken(whereToken, "(%s) AND (%s)");
};
Model.prototype.orWhereOr = function (cond, op, dval) {
  let whereToken = this._getConditionTokenOr(cond, op, dval);
  return this._handleWhereToken(whereToken, "%s OR %s");
};
Model.prototype.whereNot = function (cond, op, dval) {
  let whereToken = this._getConditionTokenNot(cond, op, dval);
  return this._handleWhereToken(whereToken, "(%s) AND (%s)");
};
Model.prototype.orWhere = function (cond, op, dval) {
  let whereToken = this._getConditionToken(cond, op, dval);
  return this._handleWhereToken(whereToken, "%s OR %s");
};
Model.prototype.orWhereNot = function (cond, op, dval) {
  let whereToken = this._getConditionTokenNot(cond, op, dval);
  return this._handleWhereToken(whereToken, "%s OR %s");
};
Model.prototype.whereExists = function (builder) {
  if (this._where) {
    this._where = `(${this._where}) AND EXISTS (${builder})`;
  } else {
    this._where = `EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.whereNotExists = function (builder) {
  if (this._where) {
    this._where = `(${this._where}) AND NOT EXISTS (${builder})`;
  } else {
    this._where = `NOT EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.whereIn = function (cols, range) {
  if (typeof cols === "string") {
    return Model.prototype._baseWhereIn.call(
      this,
      this._getColumn(cols),
      range
    );
  } else {
    let res = [];
    for (let i = 0; i < cols.length; i = i + 1) {
      res[i] = this._getColumn(cols[i]);
    }
    return Model.prototype._baseWhereIn.call(this, res, range);
  }
};
Model.prototype.whereNotIn = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._getColumn(cols);
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._getColumn(cols[i]);
    }
  }
  return Model.prototype._baseWhereNotIn.call(this, cols, range);
};
Model.prototype.whereNull = function (col) {
  return Model.prototype._baseWhereNull.call(this, this._getColumn(col));
};
Model.prototype.whereNotNull = function (col) {
  return Model.prototype._baseWhereNotNull.call(this, this._getColumn(col));
};
Model.prototype.whereBetween = function (col, low, high) {
  return Model.prototype._baseWhereBetween.call(
    this,
    this._getColumn(col),
    low,
    high
  );
};
Model.prototype.whereNotBetween = function (col, low, high) {
  return Model.prototype._baseWhereNotBetween.call(
    this,
    this._getColumn(col),
    low,
    high
  );
};
Model.prototype.orWhereIn = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._getColumn(cols);
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._getColumn(cols[i]);
    }
  }
  return Model.prototype._baseOrWhereIn.call(this, cols, range);
};
Model.prototype.orWhereNotIn = function (cols, range) {
  if (typeof cols === "string") {
    cols = this._getColumn(cols);
  } else {
    for (let i = 0; i < cols.length; i = i + 1) {
      cols[i] = this._getColumn(cols[i]);
    }
  }
  return Model.prototype._baseOrWhereNotIn.call(this, cols, range);
};
Model.prototype.orWhereNull = function (col) {
  return Model.prototype._baseOrWhereNull.call(this, this._getColumn(col));
};
Model.prototype.orWhereNotNull = function (col) {
  return Model.prototype._baseOrWhereNotNull.call(this, this._getColumn(col));
};
Model.prototype.orWhereBetween = function (col, low, high) {
  return Model.prototype._baseOrWhereBetween.call(
    this,
    this._getColumn(col),
    low,
    high
  );
};
Model.prototype.orWhereNotBetween = function (col, low, high) {
  return Model.prototype._baseOrWhereNotBetween.call(
    this,
    this._getColumn(col),
    low,
    high
  );
};
Model.prototype.orWhereExists = function (builder) {
  if (this._where) {
    this._where = `${this._where} OR EXISTS (${builder})`;
  } else {
    this._where = `EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.orWhereNotExists = function (builder) {
  if (this._where) {
    this._where = `${this._where} OR NOT EXISTS (${builder})`;
  } else {
    this._where = `NOT EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.having = function (cond, op, dval) {
  if (this._having) {
    this._having = `(${this._having}) AND (${this._getConditionToken(
      cond,
      op,
      dval
    )})`;
  } else {
    this._having = this._getConditionToken(cond, op, dval);
  }
  return this;
};
Model.prototype.havingNot = function (cond, op, dval) {
  if (this._having) {
    this._having = `(${this._having}) AND (${this._getConditionTokenNot(
      cond,
      op,
      dval
    )})`;
  } else {
    this._having = this._getConditionTokenNot(cond, op, dval);
  }
  return this;
};
Model.prototype.havingExists = function (builder) {
  if (this._having) {
    this._having = `(${this._having}) AND EXISTS (${builder})`;
  } else {
    this._having = `EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.havingNotExists = function (builder) {
  if (this._having) {
    this._having = `(${this._having}) AND NOT EXISTS (${builder})`;
  } else {
    this._having = `NOT EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.havingIn = function (cols, range) {
  let inToken = this._getInToken(cols, range);
  if (this._having) {
    this._having = `(${this._having}) AND ${inToken}`;
  } else {
    this._having = inToken;
  }
  return this;
};
Model.prototype.havingNotIn = function (cols, range) {
  let notInToken = this._getInToken(cols, range, "NOT IN");
  if (this._having) {
    this._having = `(${this._having}) AND ${notInToken}`;
  } else {
    this._having = notInToken;
  }
  return this;
};
Model.prototype.havingNull = function (col) {
  if (this._having) {
    this._having = `(${this._having}) AND ${col} IS NULL`;
  } else {
    this._having = col + " IS NULL";
  }
  return this;
};
Model.prototype.havingNotNull = function (col) {
  if (this._having) {
    this._having = `(${this._having}) AND ${col} IS NOT NULL`;
  } else {
    this._having = col + " IS NOT NULL";
  }
  return this;
};
Model.prototype.havingBetween = function (col, low, high) {
  if (this._having) {
    this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype.havingNotBetween = function (col, low, high) {
  if (this._having) {
    this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype.orHaving = function (cond, op, dval) {
  if (this._having) {
    this._having = `${this._having} OR ${this._getConditionToken(
      cond,
      op,
      dval
    )}`;
  } else {
    this._having = this._getConditionToken(cond, op, dval);
  }
  return this;
};
Model.prototype.orHavingNot = function (cond, op, dval) {
  if (this._having) {
    this._having = `${this._having} OR ${this._getConditionTokenNot(
      cond,
      op,
      dval
    )}`;
  } else {
    this._having = this._getConditionTokenNot(cond, op, dval);
  }
  return this;
};
Model.prototype.orHavingExists = function (builder) {
  if (this._having) {
    this._having = `${this._having} OR EXISTS (${builder})`;
  } else {
    this._having = `EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.orHavingNotExists = function (builder) {
  if (this._having) {
    this._having = `${this._having} OR NOT EXISTS (${builder})`;
  } else {
    this._having = `NOT EXISTS (${builder})`;
  }
  return this;
};
Model.prototype.orHavingIn = function (cols, range) {
  let inToken = this._getInToken(cols, range);
  if (this._having) {
    this._having = `${this._having} OR ${inToken}`;
  } else {
    this._having = inToken;
  }
  return this;
};
Model.prototype.orHavingNotIn = function (cols, range) {
  let notInToken = this._getInToken(cols, range, "NOT IN");
  if (this._having) {
    this._having = `${this._having} OR ${notInToken}`;
  } else {
    this._having = notInToken;
  }
  return this;
};
Model.prototype.orHavingNull = function (col) {
  if (this._having) {
    this._having = `${this._having} OR ${col} IS NULL`;
  } else {
    this._having = col + " IS NULL";
  }
  return this;
};
Model.prototype.orHavingNotNull = function (col) {
  if (this._having) {
    this._having = `${this._having} OR ${col} IS NOT NULL`;
  } else {
    this._having = col + " IS NOT NULL";
  }
  return this;
};
Model.prototype.orHavingBetween = function (col, low, high) {
  if (this._having) {
    this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.prototype.orHavingNotBetween = function (col, low, high) {
  if (this._having) {
    this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
  } else {
    this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
  }
  return this;
};
Model.filter = function (kwargs) {
  return this.newSql().where(kwargs).exec();
};
Model.prototype.exists = function () {
  let statement = `SELECT EXISTS (${this.select("").limit(1).statement()})`;
  let [res, err] = this.query(statement);
  if (res === undefined) {
    throw new Error(err);
  } else {
    return res[0][0];
  }
};
Model.prototype.compact = function () {
  this._compact = true;
  return this;
};
Model.prototype.raw = function () {
  this._raw = true;
  return this;
};
Model.prototype.commit = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._commit = bool;
  return this;
};
Model.prototype.skipValidate = function (bool) {
  if (bool === undefined) {
    bool = true;
  }
  this._skipValidate = bool;
  return this;
};
Model.prototype.flat = function (depth) {
  return this.compact().execr().flat(depth);
};
Model.prototype.get = function (cond, op, dval) {
  let records;
  if (cond !== undefined) {
    records = this.where(cond, op, dval).limit(2).exec();
  } else {
    records = this.limit(2).exec();
  }
  if (records.length === 1) {
    return records[0];
  } else {
    throw new Error("not 1 record returned:" + records.length);
  }
};
Model.newRecord = function (data) {
  return setmetatable(data, this.XodelInstanceMeta);
};
Model.newSql = function () {
  return setmetatable({ tableName: this.tableName }, this);
};
Model.prototype.getOrCreate = function (params, defaults) {
  let records = this.where(params).limit(2).exec();
  if (records.length === 1) {
    return [records[0], false];
  } else if (records.length === 0) {
    let pk = this.primaryKey;
    let data = dict(params, defaults);
    let cls = getmetatable.call(this);
    let res = cls.newSql().insert(data).returning(pk).execr();
    data[pk] = res[0][pk];
    return [cls.newRecord(data), true];
  } else {
    throw new Error("expect 1 row returned, but now get " + records.length);
  }
};
Model.prototype.asSet = function () {
  return this.compact().execr().flat().asSet();
};
Model.count = function (cond, op, dval) {
  let [res, err] = this.newSql()
    .select("count(*)")
    .where(cond, op, dval)
    .compact()
    .exec();
  if (res === undefined) {
    throw new Error(err);
  } else {
    return res[0][0];
  }
};
Model.prototype.query = function (statement) {
  print(statement);
  return defaultQuery(statement, this._compact);
};
Model.prototype.execr = function () {
  return this.raw().exec();
};
Model.prototype.exec = function () {
  let statement = this.statement();
  let [records, err] = this.query(statement);
  if (records === undefined) {
    throw new Error(err);
  }
  let cls = getmetatable.call(this);
  if (this._raw || this._compact) {
    return Array.new(records);
  } else if (
    this._select ||
    (!this._update && !this._insert && !this._delete)
  ) {
    if (!this._loadFk) {
      for (let [i, record] of records.entries()) {
        records[i] = cls.load(record);
      }
    } else {
      let fields = cls.fields;
      let fieldNames = cls.fieldNames;
      for (let [i, record] of records.entries()) {
        for (let [_, name] of fieldNames.entries()) {
          let field = fields[name];
          let value = record[name];
          if (value !== undefined) {
            let fkModel = this._loadFk[name];
            if (!fkModel) {
              if (!field.load) {
                record[name] = value;
              } else {
                [record[name], err] = field.load(value);
                if (err) {
                  throw new Error(err);
                }
              }
            } else {
              record[name] = fkModel.load(
                getForeignObject(record, name + "__")
              );
            }
          }
        }
        records[i] = cls.newRecord(record);
      }
    }
    return Array.new(records);
  } else {
    return Array.new(records);
  }
};
Model.prototype.loadFk = function (fkName, selectNames, ...varargs) {
  let fk = this.foreignKeys[fkName];
  if (fk === undefined) {
    throw new Error(
      fkName + (" is not a valid forein key name for " + this.tableName)
    );
  }
  let fkModel = fk.reference;
  let joinKey = fkName + ("__" + fkModel.tableName);
  let joinObj = this._registerJoinModel({
    joinKey: joinKey,
    column: fkName,
    fkModel: fkModel,
    fkColumn: fk.referenceColumn,
  });
  if (!this._loadFk) {
    this._loadFk = [];
  }
  this._loadFk[fkName] = fkModel;
  if (!selectNames) {
    return this;
  }
  let rightAlias = joinObj.fkAlias;
  let fks;
  if (typeof selectNames === "object") {
    let res = [];
    for (let [_, fkn] of selectNames.entries()) {
      assert(fkModel.fields[fkn], "invalid field name for fk model: " + fkn);
      res.push(`${rightAlias}.${fkn} AS ${fkName}__${fkn}`);
    }
    fks = res.join(", ");
  } else if (selectNames === "*") {
    let res = [];
    for (let [i, fkn] of fkModel.fieldNames.entries()) {
      res.push(`${rightAlias}.${fkn} AS ${fkName}__${fkn}`);
    }
    fks = res.join(", ");
  } else if (typeof selectNames === "string") {
    assert(
      fkModel.fields[selectNames],
      "invalid field name for fk model: " + selectNames
    );
    fks = `${rightAlias}.${selectNames} AS ${fkName}__${selectNames}`;
    for (let i = 0; i < varargs.length; i = i + 1) {
      let fkn = varargs[i];
      assert(fkModel.fields[fkn], "invalid field name for fk model: " + fkn);
      fks = `${fks}, ${rightAlias}.${fkn} AS ${fkName}__${fkn}`;
    }
  } else {
    throw new Error(`invalid argument type ${typeof selectNames} for load_fk`);
  }
  return Model.prototype._baseSelect.call(this, fks);
};
export default Model;