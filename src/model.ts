import Field from "@xiangnanscu/field";

const DEFAULT_STRING_MAXLENGTH = 256;
const FOREIGN_KEY = 2;
const NON_FOREIGN_KEY = 3;
const END = 4;
const COMPARE_OPERATORS = {
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  ne: "<>",
  eq: "=",
};
const IS_PG_KEYWORDS = {
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
const NON_MERGE_NAMES = {
  sql: true,
  fields: true,
  fieldNames: true,
  _extends: true,
  mixins: true,
  __index: true,
  admin: true,
};
const SHARED_NAMES = [
  "tableName",
  "fields",
  "fieldNames",
  "primaryKey",
  "foreignKeys",
  "names",
  "autoNowName",
  "autoNowAddName",
  "nameCache",
  "labelToName",
  "nameToLabel",
  "XodelInstanceMeta",
];
const getLocalTime = Field.basefield.getLocalTime;
const stringFormat = (s: string | any[], ...varargs: any[]) => {
  let status = 0;
  const res = [];
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
const baseModel = {
  abstract: true,
  fieldNames: Array(["id", "ctime", "utime"]),
  fields: {
    id: { type: "integer", primaryKey: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", autoNowAdd: true },
    utime: { label: "更新时间", type: "datetime", autoNow: true },
  },
};
const unique = (arr: any[]) => {
  return arr.filter((e: any, i: any) => arr.indexOf(e) === i);
};
const clone = (o: any) => JSON.parse(JSON.stringify(o));
function _prefixWith_V(column: string) {
  return "V." + column;
}
function map(tbl: string | any[], func: { (value: any): any; (arg0: any): any; }) {
  const res = [];
  for (let i = 0; i < tbl.length; i = i + 1) {
    res[i] = func(tbl[i]);
  }
  return res;
}
function dict(a: { [s: string]: unknown; } | ArrayLike<unknown>, b: { [s: string]: unknown; } | ArrayLike<unknown>) {
  const res: never[] = [];
  for (const [key, value] of Object.entries(a)) {
    res[key] = value;
  }
  for (const [key, value] of Object.entries(b)) {
    res[key] = value;
  }
  return res;
}
function checkReserved(name: string) {
  assert(
    typeof name === "string",
    `name must by string, not ${typeof name} (${name})`
  );
  assert(!name.includes("__"), "don't use __ in a field name");
  assert(
    !IS_PG_KEYWORDS[name.toUpperCase()],
    `${name} is a postgresql reserved word`
  );
}
function normalizeArrayAndHashFields(fields: { [s: string]: unknown; } | ArrayLike<unknown>) {
  assert(typeof fields === "object", "you must provide fields for a model");
  const alignedFields = [];
  for (const [name, field] of Object.entries(fields)) {
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
function normalizeFieldNames(fieldNames: any) {
  assert(
    typeof fieldNames === "object",
    "you must provide field_names for a model"
  );
  for (const name of fieldNames) {
    assert(typeof name === "string", "element of field_names must be string");
  }
  return Array(fieldNames);
}
function isFieldClass(t: unknown) {
  return typeof t === "object" && t.__isFieldClass__;
}
function getForeignObject(attrs: { [s: string]: unknown; } | ArrayLike<unknown>, prefix: string | any[]) {
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
function makeRecordMeta(model, cls: typeof Model) {
  function RecordMeta(attrs: any) {
    Object.assign(this, attrs);
  }
  RecordMeta.prototype.delete = function (key: string | number) {
    key = key || model.primaryKey;
    return cls.delete(model, { [key]: this[key] }).exec();
  };
  RecordMeta.prototype.save = function (names: any, key: any) {
    return cls.save(model, this, names, key);
  };
  RecordMeta.prototype.saveCreate = function (names: any, key: any) {
    return cls.saveCreate(model, this, names, key);
  };
  RecordMeta.prototype.saveUpdate = function (names: any, key: any) {
    return cls.saveUpdate(model, this, names, key);
  };
  RecordMeta.prototype.createFrom = function (key: any) {
    return cls.createFrom(model, this, key);
  };
  RecordMeta.prototype.updateFrom = function (key: any) {
    return cls.updateFrom(model, this, key);
  };
  RecordMeta.prototype.validate = function (names: any, key: any) {
    return cls.validate(model, this, names, key);
  };
  RecordMeta.prototype.validateUpdate = function (names: any) {
    return cls.validateUpdate(model, this, names);
  };
  RecordMeta.prototype.validateCreate = function (names: any) {
    return cls.validateCreate(model, this, names);
  };
  return RecordMeta;
}
function assert(bool: boolean, errMsg: string | undefined) {
  if (!bool) {
    throw new Error(errMsg);
  } else {
    return bool;
  }
}
class ValidateError extends Error {
  constructor({ name, message, label, httpCode }) {
    super(message);
    Object.assign(this, { name, label, httpCode, message });
  }
}
class ValidateBatchError extends ValidateError {
  index: any;
  label: any;
  constructor({ name, message, label, httpCode, index }) {
    super({ name, message, label, httpCode });
    this.index = index;
  }
  String() {
    return `FIELD ERROR: ${this.name}(${this.label})+${this.message}`;
  }
}
function checkUpsertKey(rows: any[], key: string | number) {
  assert(key, "no key for upsert");
  if (rows instanceof Array) {
    if (typeof key === "string") {
      for (const [i, row] of rows.entries()) {
        if (row[key] === undefined || row[key] === "") {
          throw new ValidateBatchError({
            message: "value of key is required for upsert/merge",
            index: i,
            name: key,
          });
        }
      }
    } else {
      for (const row of rows) {
        let emptyKeys = true;
        for (const k of key) {
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
      throw new ValidateError({
        name: key,
        message: "value of key is required",
      });
    }
  } else {
    for (const k of key) {
      if (rows[k] === undefined || rows[k] === "") {
        throw new ValidateError({
          name: k,
          message: "value of key is required",
        });
      }
    }
  }
  return [rows, key];
}
function makeFieldFromJson(json: unknown, kwargs: { name: any; type?: any; } | undefined) {
  const options = { ...json, ...kwargs };
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
  const fcls = Field[options.type];
  if (!fcls) {
    throw new Error("invalid field type:" + String(options.type));
  }
  return fcls.new(options);
}
function makeToken(s: string) {
  function rawToken() {
    return s;
  }
  return rawToken;
}
const DEFAULT = makeToken("DEFAULT");
const NULL = makeToken("NULL");
const PG_SET_MAP = {
  _union: "UNION",
  _unionAll: "UNION ALL",
  _except: "EXCEPT",
  _exceptAll: "EXCEPT ALL",
  _intersect: "INTERSECT",
  _intersectAll: "INTERSECT ALL",
};
function _escapeFactory(isLiteral: boolean, isBracket: boolean) {
  function asSqlToken(value: boolean | { (): any; replaceAll: (arg0: string, arg1: string) => string; statement: () => string; length: number; map: (arg0: (value: any) => any) => any[]; } | null) {
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
    } else if (value instanceof Model) {
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
      throw new Error(
        `don't know how to escape value: ${value} (${typeof value})`
      );
    }
  }
  return asSqlToken;
}
const asLiteral = _escapeFactory(true, true);
const asToken = _escapeFactory(false, false);
function getCteReturningValues(columns: any, literals: undefined) {
  const values = [];
  for (const col of columns) {
    values.push(asToken(col));
  }
  if (literals) {
    for (const e of literals) {
      values.push(asLiteral(e));
    }
  }
  return values;
}
function getReturningToken(opts: { cteReturning: any; returning: string; }) {
  if (opts.cteReturning) {
    return " RETURNING " + asToken(getCteReturningValues(opts.cteReturning));
  } else if (opts.returning) {
    return " RETURNING " + opts.returning;
  } else {
    return "";
  }
}
function assembleSql(opts: { tableName: any; with: any; join?: any; distinct: any; returning?: any; cteReturning?: any; insert: any; update: any; delete: any; using: any; select: any; from: any; where: any; group: any; having: any; order: any; limit: any; offset: any; }) {
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
    statement = `DELETE FROM ${opts.tableName}${using}${where}${returning}`;
  } else {
    const from = opts.from || opts.tableName;
    const where = (opts.where && " WHERE " + opts.where) || "";
    const group = (opts.group && " GROUP BY " + opts.group) || "";
    const having = (opts.having && " HAVING " + opts.having) || "";
    const order = (opts.order && " ORDER BY " + opts.order) || "";
    const limit = (opts.limit && " LIMIT " + opts.limit) || "";
    const offset = (opts.offset && " OFFSET " + opts.offset) || "";
    const distinct = (opts.distinct && "DISTINCT ") || "";
    const select = opts.select || "*";
    statement = `SELECT ${distinct}${select} FROM ${from}${where}${group}${having}${order}${limit}${offset}`;
  }
  return (opts.with && `WITH ${opts.with} ${statement}`) || statement;
}

function XodelProxy(attrs: any) {
  Object.assign(this, attrs);
}
XodelProxy.createProxy = function (modelclass: { tableName: any; fieldNames: any; fields: any; abstract: any; }) {
  return new this({
    modelclass: modelclass,
    tableName: modelclass.tableName,
    fieldNames: modelclass.fieldNames,
    fields: modelclass.fields,
    abstract: modelclass.abstract,
  });
};
XodelProxy.prototype.new = function (attr: any) {
  return this.modelclass.new(attr);
};
XodelProxy.prototype.all = async function () {
  return await this.modelclass.all();
};
XodelProxy.prototype.save = async function (input: any, names: any, key: any) {
  return await this.modelclass.save(input, names, key);
};
XodelProxy.prototype.saveCreate = async function (input: any, names: any, key: any) {
  return await this.modelclass.saveCreate(input, names, key);
};
XodelProxy.prototype.saveUpdate = async function (input: any, names: any, key: any) {
  return await this.modelclass.saveUpdate(input, names, key);
};
XodelProxy.prototype.validate = function (input: any, names: any, key: any) {
  return this.modelclass.validate(input, names, key);
};
XodelProxy.prototype.validateCreate = function (input: any, names: any) {
  return this.modelclass.validateCreate(input, names);
};
XodelProxy.prototype.validateUpdate = function (input: any, names: any) {
  return this.modelclass.validateUpdate(input, names);
};
XodelProxy.prototype.load = function (data: any) {
  return this.modelclass.load(data);
};
XodelProxy.prototype.count = async function (cond: any, op: any, dval: any) {
  return await this.modelclass.count(cond, op, dval);
};
XodelProxy.prototype.filter = async function (kwargs: any) {
  return await this.modelclass.filter(kwargs);
};
XodelProxy.prototype.getOrCreate = async function (params: any, defaults: any) {
  return await this.modelclass.newSql().getOrCreate(params, defaults);
};
XodelProxy.prototype.select = function (a: any, b: any, ...varargs: any) {
  return this.modelclass.newSql().select(a, b, ...varargs);
};
XodelProxy.prototype.as = function (tableAlias: any) {
  return this.modelclass.newSql().as(tableAlias);
};
XodelProxy.prototype.limit = function (n: any) {
  return this.modelclass.newSql().limit(n);
};
XodelProxy.prototype.offset = function (n: any) {
  return this.modelclass.newSql().offset(n);
};
XodelProxy.prototype.commit = function (bool: any) {
  return this.modelclass.newSql().commit(bool);
};
XodelProxy.prototype.skipValidate = function (bool: any) {
  return this.modelclass.newSql().skipValidate(bool);
};
XodelProxy.prototype.with = function (name: any, token: any) {
  return this.modelclass.newSql().with(name, token);
};
XodelProxy.prototype.withValues = function (name: any, rows: any) {
  return this.modelclass.newSql().withValues(name, rows);
};
XodelProxy.prototype.insert = function (rows: any, columns: any) {
  return this.modelclass.newSql().insert(rows, columns);
};
XodelProxy.prototype.get = async function (cond: any, op: any, dval: any) {
  return await this.modelclass.newSql().get(cond, op, dval);
};
XodelProxy.prototype.update = function (row: any, columns: any) {
  return this.modelclass.newSql().update(row, columns);
};
XodelProxy.prototype.delete = function (a: any, b: any, c: any) {
  return this.modelclass.newSql().delete(a, b, c);
};
XodelProxy.prototype.getMerge = function (rows: any, key: any) {
  return this.modelclass.newSql().getMerge(rows, key);
};
XodelProxy.prototype.getMultiple = async function (keys: any, columns: any) {
  return await this.modelclass.newSql().getMultiple(keys, columns);
};
XodelProxy.prototype.merge = async function (rows: any, key: any, columns: any) {
  return await this.modelclass.newSql().merge(rows, key, columns);
};
XodelProxy.prototype.upsert = async function (rows: any, key: any, columns: any) {
  return await this.modelclass.newSql().upsert(rows, key, columns);
};
XodelProxy.prototype.updates = async function (rows: any, key: any, columns: any) {
  return await this.modelclass.newSql().updates(rows, key, columns);
};
XodelProxy.prototype.group = function (...varargs: any) {
  return this.modelclass.newSql().group(...varargs);
};
XodelProxy.prototype.groupBy = function (...varargs: any) {
  return this.modelclass.newSql().groupBy(...varargs);
};
XodelProxy.prototype.order = function (...varargs: any) {
  return this.modelclass.newSql().order(...varargs);
};
XodelProxy.prototype.orderBy = function (...varargs: any) {
  return this.modelclass.newSql().orderBy(...varargs);
};
XodelProxy.prototype.join = function (joinArgs: any, key: any, op: any, val: any) {
  return this.modelclass.newSql().join(joinArgs, key, op, val);
};
XodelProxy.prototype.leftJoin = function (joinArgs: any, key: any, op: any, val: any) {
  return this.modelclass.newSql().leftJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.rightJoin = function (joinArgs: any, key: any, op: any, val: any) {
  return this.modelclass.newSql().rightJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.fullJoin = function (joinArgs: any, key: any, op: any, val: any) {
  return this.modelclass.newSql().fullJoin(joinArgs, key, op, val);
};
XodelProxy.prototype.loadFk = function (fkName: any, selectNames: any, ...varargs: any) {
  return this.modelclass.newSql().loadFk(fkName, selectNames, ...varargs);
};
XodelProxy.prototype.where = function (cond: any, op: any, dval: any) {
  return this.modelclass.newSql().where(cond, op, dval);
};
XodelProxy.prototype.whereOr = function (cond: any, op: any, dval: any) {
  return this.modelclass.newSql().whereOr(cond, op, dval);
};
XodelProxy.prototype.whereNot = function (cond: any, op: any, dval: any) {
  return this.modelclass.newSql().whereNot(cond, op, dval);
};
XodelProxy.prototype.whereExists = function (builder: any) {
  return this.modelclass.newSql().whereExists(builder);
};
XodelProxy.prototype.whereNotExists = function (builder: any) {
  return this.modelclass.newSql().whereNotExists(builder);
};
XodelProxy.prototype.whereIn = function (cols: any, range: any) {
  return this.modelclass.newSql().whereIn(cols, range);
};
XodelProxy.prototype.whereNotIn = function (cols: any, range: any) {
  return this.modelclass.newSql().whereNotIn(cols, range);
};
XodelProxy.prototype.whereNull = function (col: any) {
  return this.modelclass.newSql().whereNull(col);
};
XodelProxy.prototype.whereNotNull = function (col: any) {
  return this.modelclass.newSql().whereNotNull(col);
};
XodelProxy.prototype.whereBetween = function (col: any, low: any, high: any) {
  return this.modelclass.newSql().whereBetween(col, low, high);
};
XodelProxy.prototype.whereNotBetween = function (col: any, low: any, high: any) {
  return this.modelclass.newSql().whereNotBetween(col, low, high);
};

class Model {
  static ValidateError = ValidateError;
  static ValidateBatchError = ValidateBatchError;
  static baseModel = baseModel;
  static makeFieldFromJson = makeFieldFromJson;
  static token = makeToken;
  static NULL = NULL;
  // static defaultQuery = defaultQuery;
  static DEFAULT = DEFAULT;
  static asToken = asToken;
  static asLiteral = asLiteral;
  static tableName: string;
  static primaryKey: any;
  static XodelInstanceMeta: any;
  static names: any;
  static fields: any;
  static autoNowName: any;
  static clean: any;
  static nameToLabel: any;
  _select: any;
  _insert: string;
  _update: string;
  _returningArgs: any;
  _as: any;
  _returning: any;
  _from: any;
  _where: any;
  _delete: any;
  _joinKeys: any;
  nameCache: any;
  _intersect: any;
  _intersectAll: any;
  _union: any;
  _unionAll: any;
  _except: any;
  _exceptAll: any;
  _with: any;
  _join: any;
  _distinct: any;
  _cteReturning: any;
  _using: any;
  _group: any;
  _having: any;
  _order: any;
  _limit: any;
  _offset: any;
  _skipValidate: any;
  _commit: undefined;
  _compact: boolean;
  _raw: boolean;
  _loadFk: any;
  foreignKeys: any;
  constructor(attrs: any) {
    Object.assign(this, attrs);
  }
  static new(self: { tableName?: any; _as?: string; }) {
    return new this(self);
  }
  static createModel(options: { abstract: boolean; _extends: any; fields: any; fieldNames: any; }) {
    const XodelClass = this.makeModelClass(this.normalize(options));
    return XodelProxy.createProxy(XodelClass);
  }
  static normalize(options: { [s: string]: unknown; } | ArrayLike<unknown>) {
    const _extends = options._extends;
    const model = {};
    const optsFields = normalizeArrayAndHashFields(options.fields || []);
    let optsNames = options.fieldNames;
    if (!optsNames) {
      const selfNames = Object.keys(optsFields);
      if (_extends) {
        optsNames = unique([..._extends.fieldNames, ...selfNames]);
      } else {
        optsNames = selfNames;
      }
    }
    model.fieldNames = normalizeFieldNames(clone(optsNames));
    model.fields = [];
    for (const name of optsNames) {
      checkReserved(name);
      if (name !== "name" && this[name] !== undefined) {
        throw new Error(
          `field name "${name}" conflicts with model class attributes`
        );
      }
      let field = optsFields[name];
      if (!field) {
        const tname = options.tableName || "[abstract model]";
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
          const pfield = _extends.fields[name];
          if (pfield) {
            field = { ...pfield.getOptions(), ...field };
            if (pfield.model && field.model) {
              field.model = this.createModel({
                abstract: true,
                _extends: pfield.model,
                fields: field.model.fields,
                fieldNames: field.model.fieldNames,
              });
            }
          }
        }
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
    for (const [key, value] of Object.entries(options)) {
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
      return this.mergeModels([model, ...options.mixins]);
    } else {
      return model;
    }
  }
  static makeModelClass(opts: { tableName: any; fields: any; fieldNames: any; primaryKey: any; defaultPrimaryKey: any; mixins: any; _extends: any; abstract: any; disableAutoPrimaryKey: any; }) {
    class ConcreteModel extends this {
      static tableName = opts.tableName;
      static fields = opts.fields;
      static fieldNames = opts.fieldNames;
      static primaryKey = opts.primaryKey;
      static defaultPrimaryKey = opts.defaultPrimaryKey;
      static mixins = opts.mixins;
      static _extends = opts._extends;
      static abstract = opts.abstract;
      static disableAutoPrimaryKey = opts.disableAutoPrimaryKey;
      static autoNowAddName: any;
      static labelToName: {};
    }
    const className = {
      value: `${ConcreteModel.tableName.toUpperCase()}Model`,
    };
    Object.defineProperty(ConcreteModel, "name", className);
    // if (opts.dbOptions) {
    //   let dbQuery = Query(opts.dbOptions);
    //   ConcreteModel.prototype.query = function (statement) {
    //     return dbQuery(statement, this._compact);
    //   };
    // }
    if (!ConcreteModel.tableName) {
      const namesHint =
        (ConcreteModel.fieldNames && ConcreteModel.fieldNames.join(",")) ||
        "no field_names";
      throw new Error(
        `you must define table_name for a non-abstract model (${namesHint})`
      );
    }
    checkReserved(ConcreteModel.tableName);
    let pkDefined = false;
    ConcreteModel.foreignKeys = {};
    ConcreteModel.names = [];
    for (const [name, field] of Object.entries(ConcreteModel.fields)) {
      let fkModel = field.reference;
      if (fkModel === "self") {
        fkModel = ConcreteModel;
        field.reference = ConcreteModel;
      }
      if (fkModel) {
        ConcreteModel.foreignKeys[name] = field;
      }
      if (field.primaryKey) {
        const pkName = field.name;
        assert(
          !pkDefined,
          `duplicated primary key: "${pkName}" and "${pkDefined}"`
        );
        pkDefined = pkName;
        ConcreteModel.primaryKey = pkName;
      } else if (field.autoNow) {
        ConcreteModel.autoNowName = field.name;
      } else if (field.autoNowAdd) {
        ConcreteModel.autoNowAddName = field.name;
      } else {
        ConcreteModel.names.push(name);
      }
    }
    const pkName = ConcreteModel.defaultPrimaryKey || "id";
    ConcreteModel.primaryKey = pkName;
    ConcreteModel.fields[pkName] = Field.integer.new({
      name: pkName,
      primaryKey: true,
      serial: true,
    });
    ConcreteModel.fieldNames.unshift(pkName);
    ConcreteModel.nameCache = {};
    ConcreteModel.labelToName = {};
    ConcreteModel.nameToLabel = {};
    for (const [name, field] of Object.entries(ConcreteModel.fields)) {
      ConcreteModel.labelToName[field.label] = name;
      ConcreteModel.nameToLabel[name] = field.label;
      ConcreteModel.nameCache[name] = ConcreteModel.tableName + "." + name;
      if (field.dbType === Field.basefield.NOT_DEFIEND) {
        field.dbType = ConcreteModel.fields[field.referenceColumn].dbType;
      }
    }
    ConcreteModel.XodelInstanceMeta = makeRecordMeta(ConcreteModel, this);
    for (const name of SHARED_NAMES) {
      ConcreteModel.prototype[name] = ConcreteModel[name];
    }
    return ConcreteModel;
  }
  static mixWithBase(...varargs: any[]) {
    return this.mix(baseModel, ...varargs);
  }
  static mix(...varargs: { abstract: boolean; fieldNames: string[][]; fields: { id: { type: string; primaryKey: boolean; serial: boolean; }; ctime: { label: string; type: string; autoNowAdd: boolean; }; utime: { label: string; type: string; autoNow: boolean; }; }; }[]) {
    return this.makeModelClass(this.mergeModels([...varargs]));
  }
  static mergeModels(models: string | any[]) {
    if (models.length < 2) {
      throw new Error("provide at least two models to merge");
    } else if (models.length === 2) {
      return this.mergeModel(...models);
    } else {
      let merged = models[0];
      for (let i = 2; i <= models.length; i = i + 1) {
        merged = this.mergeModel(merged, models[i]);
      }
      return merged;
    }
  }
  static mergeModel(a: { __normalized__: any; }, b: { __normalized__: any; } | undefined) {
    const A = (a.__normalized__ && a) || this.normalize(a);
    const B = (b.__normalized__ && b) || this.normalize(b);
    const C: never[] = [];
    const fieldNames = (A.fieldNames + B.fieldNames).uniq();
    const fields = [];
    for (const name of fieldNames) {
      const af = A.fields[name];
      const bf = B.fields[name];
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
    for (const M of [A, B]) {
      for (const [key, value] of Object.entries(M)) {
        if (!NON_MERGE_NAMES[key]) {
          C[key] = value;
        }
      }
    }
    C.fieldNames = fieldNames;
    C.fields = fields;
    return this.normalize(C);
  }
  static mergeField(a: { __isFieldClass__: any; getOptions: () => any; }, b: { __isFieldClass__: any; getOptions: () => any; }) {
    const aopts = (a.__isFieldClass__ && a.getOptions()) || clone(a);
    const bopts = (b.__isFieldClass__ && b.getOptions()) || clone(b);
    const options = dict(aopts, bopts);
    if (aopts.model && bopts.model) {
      options.model = this.mergeModel(aopts.model, bopts.model);
    }
    return makeFieldFromJson(options);
  }
  static async filter(kwargs: any) {
    return await this.newSql().where(kwargs).exec();
  }
  static async count(cond: any, op: any, dval: any) {
    const res = await this.newSql()
      .select("count(*)")
      .where(cond, op, dval)
      .compact()
      .exec();
    return res[0][0];
  }
  static async all() {
    const records = await this.query("SELECT * FROM " + this.tableName);
    for (let i = 0; i < records.length; i = i + 1) {
      records[i] = this.load(records[i]);
    }
    return records;
  }
  static query(arg0: string) {
    throw new Error("Method not implemented.");
  }
  static async save(input: { [x: string]: undefined; }, names: any, key: string | number) {
    key = key || this.primaryKey;
    if (input[key] !== undefined) {
      return await this.saveUpdate(input, names, key);
    } else {
      return await this.saveCreate(input, names, key);
    }
  }
  static async saveCreate(input: any, names: any, key: any) {
    const data = this.validateCreate(input, names);
    return await this.createFrom(data, key);
  }
  static async saveUpdate(input: { [x: string]: any; }, names: any, key: string | number) {
    const data = this.validateUpdate(input, names);
    key = key || this.primaryKey;
    data[key] = input[key];
    return await this.updateFrom(data, key);
  }
  static newRecord(data: any) {
    return new this.XodelInstanceMeta(data);
  }
  static newSql() {
    return new this({ tableName: this.tableName });
  }
  static async createFrom(data: { [x: string]: any; }, key: string | number) {
    key = key || this.primaryKey;
    const prepared = this.prepareForDb(data);
    const created = await this.newSql()
      ._baseInsert(prepared)
      ._baseReturning(key)
      .execr();
    data[key] = created[0][key];
    return this.newRecord(data);
  }
  static async updateFrom(data: { [x: string]: any; }, key: string | number) {
    key = key || this.primaryKey;
    const prepared = this.prepareForDb(data, undefined, true);
    const lookValue = assert(data[key], "no key provided for update");
    const res = await this.newSql()
      ._baseUpdate(prepared)
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
  }
  static prepareForDb(data: { [x: string]: any; }, columns: undefined, isUpdate: boolean | undefined) {
    const prepared = {};
    for (const name of columns || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(
          `invalid field name '${name}' for model '${this.tableName}'`
        );
      }
      const value = data[name];
      if (field.prepareForDb && value !== undefined) {
        try {
          const val = field.prepareForDb(value, data);
          prepared[name] = val;
        } catch (error) {
          throw new ValidateError({
            name: name,
            message: error.message,
            label: field.label,
          });
        }
      } else {
        prepared[name] = value;
      }
    }
    if (isUpdate && this.autoNowName) {
      prepared[this.autoNowName] = getLocalTime();
    }
    return prepared;
  }
  static validate(input: { [x: string]: undefined; }, names: any, key: any) {
    if (input[key || this.primaryKey] !== undefined) {
      return this.validateUpdate(input, names);
    } else {
      return this.validateCreate(input, names);
    }
  }
  static validateCreate(input: { [x: string]: any; }, names: any) {
    const data = {};
    let value;
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(
          `invalid field name '${name}' for model '${this.tableName}'`
        );
      }
      try {
        value = field.validate(input[name], input);
      } catch (error) {
        throw new ValidateError({
          name: name,
          message: error.message,
          label: field.label,
          httpCode: 422,
        });
      }
      if (field.default && (value === undefined || value === "")) {
        if (typeof field.default !== "function") {
          value = field.default;
        } else {
          try {
            value = field.default(input);
          } catch (error) {
            throw new Error({
              name: name,
              message: error.message,
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
      return this.clean(data);
    }
  }
  static validateUpdate(input: { [x: string]: any; }, names: any) {
    const data = {};
    let value;
    for (const name of names || this.names) {
      const field = this.fields[name];
      if (!field) {
        throw new Error(
          `invalid field name '${name}' for model '${this.tableName}'`
        );
      }
      value = input[name];
      if (value !== undefined) {
        try {
          value = field.validate(input[name], input);
          if (value === undefined) {
            data[name] = "";
          } else {
            data[name] = value;
          }
        } catch (error) {
          throw new ValidateError({
            name: name,
            message: error.message,
            label: field.label,
            httpCode: 422,
          });
        }
      }
    }
    if (!this.clean) {
      return data;
    } else {
      return this.clean(data);
    }
  }
  static parseErrorMessage(err: string) {
    if (typeof err === "object") {
      return err;
    }
    const captured = /^(?<name>.+?)~(?<message>.+?)$/.exec(err);
    if (!captured) {
      throw new Error("can't parse this model error message: " + err);
    } else {
      const { name, message } = captured.groups;
      const label = this.nameToLabel[name];
      return { name: name, err: message, label: label, httpCode: 422 };
    }
  }
  static load(data: { [x: string]: any; }) {
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
    return this.newRecord(data);
  }
  static validateCreateData(rows: any[], columns: string[]) {
    let cleaned;
    columns = columns || this._getKeys(rows);
    if (rows instanceof Array) {
      cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validateCreate(row, columns);
        } catch (error) {
          if (error instanceof ValidateError) {
            throw new ValidateBatchError({
              ...error,
              index,
              message: error.message,
            });
          } else {
            throw error;
          }
        }
      }
    } else {
      cleaned = this.validateCreate(rows, columns);
    }
    return [cleaned, columns];
  }
  static validateUpdateData(rows: any[], columns: string[]) {
    let cleaned;
    columns = columns || this._getKeys(rows);
    if (rows instanceof Array) {
      cleaned = [];
      for (const [index, row] of rows.entries()) {
        try {
          cleaned[index] = this.validateUpdate(row, columns);
        } catch (error) {
          if (error instanceof ValidateError) {
            throw new ValidateBatchError({ ...error, index });
          } else {
            throw error;
          }
        }
      }
    } else {
      cleaned = this.validateUpdate(rows, columns);
    }
    return [cleaned, columns];
  }
  static validateCreateRows(rows: any, key: any, columns: any) {
    const [checkedRows, checkedKey] = checkUpsertKey(
      rows,
      key || this.primaryKey
    );
    const [cleanedRows, cleanedColumns] = this.validateCreateData(
      checkedRows,
      columns
    );
    return [cleanedRows, cleanedColumns, checkedKey];
  }
  static validateUpdateRows(rows: any, key: any, columns: any) {
    const [checkedRows, checkedKey] = checkUpsertKey(
      rows,
      key || this.primaryKey
    );
    const [cleanedRows, cleanedColumns] = this.validateUpdateData(
      checkedRows,
      columns
    );
    return [cleanedRows, cleanedColumns, checkedKey];
  }
  static prepareDbRows(rows: any[], columns: any[], isUpdate: any) {
    let cleaned;
    columns = columns || this._getKeys(rows);
    if (rows instanceof Array) {
      cleaned = [];
      for (const [i, row] of rows.entries()) {
        cleaned[i] = this.prepareForDb(row, columns, isUpdate);
      }
    } else {
      cleaned = this.prepareForDb(rows, columns, isUpdate);
    }
    if (isUpdate) {
      const utime = this.autoNowName;
      if (utime && !columns.includes(utime)) {
        columns.push(utime);
      }
      return [cleaned, columns];
    } else {
      return [cleaned, columns];
    }
  }
  static _getKeys(rows: {}) {
    const columns = [];
    if (rows instanceof Array) {
      const d: never[] = [];
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
  toString() {
    return this.statement();
  }
  _baseSelect(a: any[], b: undefined, ...varargs: undefined[]) {
    const s = Model.prototype._baseGetSelectToken.call(this, a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  _baseGetSelectToken(a: any, b: undefined, ...varargs: undefined[]) {
    if (b === undefined) {
      if (typeof a === "object") {
        return Model.prototype._baseGetSelectToken.call(this, ...a);
      } else {
        return asToken(a);
      }
    } else {
      let s = asToken(a) + ", " + asToken(b);
      for (let i = 0; i < varargs.length; i = i + 1) {
        s = s + ", " + asToken(varargs[i]);
      }
      return s;
    }
  }
  _baseInsert(rows: string, columns: undefined) {
    if (typeof rows === "object") {
      if (rows instanceof Model) {
        if (rows._select) {
          this._setSelectSubqueryInsertToken(rows, columns);
        } else {
          this._setCudSubqueryInsertToken(rows);
        }
      } else if (rows instanceof Array) {
        this._insert = this._getBulkInsertToken(rows, columns);
      } else if (Object.keys(rows).length) {
        this._insert = this._getInsertToken(rows, columns);
      } else {
        throw new Error("can't pass empty table to Xodel._base_insert");
      }
    } else if (typeof rows === "string") {
      this._insert = rows;
    } else {
      throw new Error(
        "invalid value type to Model._base_insert:" + typeof rows
      );
    }
    return this;
  }
  _baseUpdate(row: string, columns: undefined) {
    if (row instanceof Model) {
      this._update = this._baseGetUpdateQueryToken(row, columns);
    } else if (typeof row === "object") {
      this._update = this._getUpdateToken(row, columns);
    } else {
      this._update = row;
    }
    return this;
  }
  _baseMerge(rows: any, key: string | any[], columns: any[]) {
    [rows, columns] = this._getCteValuesLiteral(rows, columns, false);
    const cteName = `V(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    const joinCond = this._getJoinConditions(key, "V", "T");
    const valsColumns = columns.map(_prefixWith_V);
    const insertSubquery = Model.new({ tableName: "V" })
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
  }
  _baseUpsert(rows: any, key: any, columns: undefined) {
    assert(key, "you must provide key for upsert(string or table)");
    if (rows instanceof Model) {
      assert(
        columns !== undefined,
        "you must specify columns when use subquery as values of upsert"
      );
      this._insert = this._getUpsertQueryToken(rows, key, columns);
    } else if (Array.isArray(rows)) {
      this._insert = this._getBulkUpsertToken(rows, key, columns);
    } else {
      this._insert = this._getUpsertToken(rows, key, columns);
    }
    return this;
  }
  _baseUpdates(rows: { _returningArgs: any[]; length: number; }, key: any, columns: any[]) {
    if (rows instanceof Model) {
      columns = columns || rows._returningArgs.flat();
      const cteName = `V(${columns.join(", ")})`;
      const joinCond = this._getJoinConditions(
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
      const cteName = `V(${columns.join(", ")})`;
      const cteValues = `(VALUES ${asToken(rows)})`;
      const joinCond = this._getJoinConditions(
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
  }
  _baseGetMultiple(keys: string | any[], columns: any[]) {
    if (keys.length === 0) {
      throw new Error("empty keys passed to get_multiple");
    }
    columns = columns || this._getKeys(keys[0]);
    [keys, columns] = this._getCteValuesLiteral(keys, columns, false);
    const joinCond = this._getJoinConditions(
      columns,
      "V",
      this._as || this.tableName
    );
    const cteName = `V(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(keys)})`;
    return this.with(cteName, cteValues).rightJoin("V", joinCond);
  }
  _baseReturning(a: any, b: undefined, ...varargs: undefined[]) {
    const s = this._baseGetSelectToken(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    } else {
      return this;
    }
    if (this._returningArgs) {
      this._returningArgs = [this._returningArgs, ...varargs];
    } else {
      this._returningArgs = [...varargs];
    }
    return this;
  }
  _baseFrom(a: string, ...varargs: undefined[]) {
    if (!this._from) {
      this._from = Model.prototype._baseGetSelectToken.call(
        this,
        a,
        ...varargs
      );
    } else {
      this._from =
        this._from +
        ", " +
        Model.prototype._baseGetSelectToken.call(this, a, ...varargs);
    }
    return this;
  }
  _baseJoin(rightTable: string, key: string, op: undefined, val: undefined) {
    const joinToken = this._getJoinToken("INNER", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseLeftJoin(rightTable: string, key: string, op: undefined, val: undefined) {
    const joinToken = this._getJoinToken("LEFT", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseRightJoin(rightTable: string, key: string, op: undefined, val: undefined) {
    const joinToken = this._getJoinToken("RIGHT", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseFullJoin(rightTable: any, key: any, op: undefined, val: undefined) {
    const joinToken = this._getJoinToken("FULL", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseWhere(cond: string, op: undefined, dval: undefined) {
    const whereToken = this._baseGetConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  _baseGetConditionTokenFromTable(kwargs: { [s: string]: unknown; } | ArrayLike<unknown>, logic: string | undefined) {
    const tokens = [];
    if (Array.isArray(kwargs)) {
      for (const value of kwargs) {
        const token = Model.prototype._baseGetConditionToken.call(this, value);
        if (token !== undefined && token !== "") {
          tokens.push("(" + token + ")");
        }
      }
    } else {
      for (const [k, value] of Object.entries(kwargs)) {
        tokens.push(`${k} = ${asLiteral(value)}`);
      }
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + logic + " ");
    }
  }
  _baseGetConditionToken(cond, op: undefined, dval: undefined) {
    if (op === undefined) {
      const argtype = typeof cond;
      if (argtype === "object") {
        return Model.prototype._baseGetConditionTokenFromTable.call(this, cond);
      } else if (argtype === "string") {
        return cond;
      } else if (argtype === "function") {
        const oldWhere = this._where;
        delete this._where;
        const res = cond.call(this);
        if (res === this) {
          const groupWhere = this._where;
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
        throw new Error("invalid condition type: " + argtype);
      }
    } else if (dval === undefined) {
      return `${cond} = ${asLiteral(op)}`;
    } else {
      return `${cond} ${op} ${asLiteral(dval)}`;
    }
  }
  _baseWhereIn(cols: any, range: any) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `(${this._where}) AND ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  _baseWhereNotIn(cols: any, range: any) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `(${this._where}) AND ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  _baseWhereNull(col: string) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _baseWhereNotNull(col: string) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _baseWhereBetween(col: any, low: any, high: any) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseWhereNotBetween(col: any, low: any, high: any) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseOrWhereIn(cols: any, range: any) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `${this._where} OR ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  _baseOrWhereNotIn(cols: any, range: any) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `${this._where} OR ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  _baseOrWhereNull(col: string) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _baseOrWhereNotNull(col: string) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _baseOrWhereBetween(col: any, low: any, high: any) {
    if (this._where) {
      this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseOrWhereNotBetween(col: any, low: any, high: any) {
    if (this._where) {
      this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _rowsToArray(rows: string | any[], columns: any[]) {
    const c = columns.length;
    const n = rows.length;
    const res = new Array(n);
    const fields = this.fields;
    for (let i = 0; i < n; i = i + 1) {
      res[i] = new Array(c);
    }
    for (const [i, col] of columns.entries()) {
      for (let j = 0; j < n; j = j + 1) {
        const v = rows[j][col];
        if (v !== undefined && v !== "") {
          res[j][i] = v;
        } else if (fields[col]) {
          const dft = fields[col].default;
          if (dft !== undefined) {
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
  }
  _getInsertValuesToken(row: { [s: string]: unknown; } | ArrayLike<unknown>, columns: string[]) {
    const valueList = [];
    if (!columns) {
      columns = [];
      for (const [k, v] of Object.entries(row)) {
        columns.push(k);
        valueList.push(v);
      }
    } else {
      for (const col of columns) {
        const v = row[col];
        if (v !== undefined) {
          valueList.push(v);
        } else {
          valueList.push(DEFAULT);
        }
      }
    }
    return [asLiteral(valueList), columns];
  }
  _getBulkInsertValuesToken(rows: any[], columns: any) {
    columns = columns || this._getKeys(rows);
    rows = this._rowsToArray(rows, columns);
    return [map(rows, asLiteral), columns];
  }
  _getUpdateTokenWithPrefix(columns: any, key: any, tableName: string) {
    const tokens = [];
    if (typeof key === "string") {
      for (const col of columns) {
        if (col !== key) {
          tokens.push(`${col} = ${tableName}.${col}`);
        }
      }
    } else {
      const sets = [];
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
  _getSelectToken(a: any[], b: undefined, ...varargs: undefined[]) {
    if (b === undefined) {
      if (Array.isArray(a)) {
        const tokens = a.map((e) => this._getSelectColumn(e));
        return asToken(tokens);
      } else if (typeof a === "string") {
        return this._getSelectColumn(a);
      } else {
        return asToken(a);
      }
    } else {
      a = this._getSelectColumn(a);
      b = this._getSelectColumn(b);
      let s = asToken(a) + ", " + asToken(b);
      for (const name of varargs) {
        s = s + ", " + asToken(this._getSelectColumn(name));
      }
      return s;
    }
  }
  _getSelectTokenLiteral(a: any[], b: undefined, ...varargs: any[]) {
    if (b === undefined) {
      if (Array.isArray(a)) {
        const tokens = a.map(asLiteral);
        return asToken(tokens);
      } else {
        return asLiteral(a);
      }
    } else {
      let s = asLiteral(a) + ", " + asLiteral(b);
      for (const name of varargs) {
        s = s + ", " + asLiteral(name);
      }
      return s;
    }
  }
  _getUpdateToken(row: { [s: string]: unknown; } | ArrayLike<unknown>, columns: any) {
    const kv = [];
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
  _getWithToken(name: any, token: { statement: () => any; } | undefined) {
    if (token === undefined) {
      return name;
    } else if (token instanceof Model) {
      return `${name} AS (${token.statement()})`;
    } else {
      return `${name} AS ${token}`;
    }
  }
  _getInsertToken(row: any, columns: any) {
    const [valuesToken, insertColumns] = this._getInsertValuesToken(
      row,
      columns
    );
    return `(${asToken(insertColumns)}) VALUES ${valuesToken}`;
  }
  _getBulkInsertToken(rows: any[], columns: any) {
    [rows, columns] = this._getBulkInsertValuesToken(rows, columns);
    return `(${asToken(columns)}) VALUES ${asToken(rows)}`;
  }
  _setSelectSubqueryInsertToken(subQuery: Model, columns: any) {
    const columnsToken = asToken(columns || subQuery._select || "");
    if (columnsToken !== "") {
      this._insert = `(${columnsToken}) ${subQuery.statement()}`;
    } else {
      this._insert = subQuery.statement();
    }
  }
  _setCudSubqueryInsertToken(subQuery: Model) {
    const cteReturn = subQuery._cteReturning;
    if (cteReturn) {
      const cteColumns = cteReturn.columns;
      const insertColumns = [...cteColumns, ...cteReturn.literalColumns];
      const cudSelectQuery = Model.new({ tableName: "d" })._baseSelect(
        insertColumns
      );
      this.with(`d(${asToken(insertColumns)})`, subQuery);
      this._insert = `(${asToken(
        insertColumns
      )}) ${cudSelectQuery.statement()}`;
    } else if (subQuery._returningArgs) {
      const insertColumns = subQuery._returningArgs.flat();
      const cudSelectQuery = Model.new({ tableName: "d" })._baseSelect(
        insertColumns
      );
      this.with(`d(${asToken(insertColumns)})`, subQuery);
      this._insert = `(${asToken(
        insertColumns
      )}) ${cudSelectQuery.statement()}`;
    }
  }
  _getUpsertToken(row: any, key: string | any[], columns: any) {
    const [valuesToken, insertColumns] = this._getInsertValuesToken(
      row,
      columns
    );
    const insertToken = `(${asToken(
      insertColumns
    )}) VALUES ${valuesToken} ON CONFLICT (${this._getSelectToken(key)})`;
    if (
      (Array.isArray(key) && key.length === insertColumns.length) ||
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
  }
  _getBulkUpsertToken(rows: any[], key: string | any[], columns: string | any[]) {
    [rows, columns] = this._getBulkInsertValuesToken(rows, columns);
    const insertToken = `(${asToken(columns)}) VALUES ${asToken(
      rows
    )} ON CONFLICT (${this._baseGetSelectToken(key)})`;
    if (
      (Array.isArray(key) && key.length === columns.length) ||
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
  }
  _getUpsertQueryToken(rows: Model, key: string | any[], columns: string | any[]) {
    const columnsToken = this._getSelectToken(columns);
    const insertToken = `(${columnsToken}) ${rows.statement()} ON CONFLICT (${this._getSelectToken(
      key
    )})`;
    if (
      (Array.isArray(key) && key.length === columns.length) ||
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
  }
  _getJoinExpr(key: any, op: undefined, val: undefined) {
    if (op === undefined) {
      return key;
    } else if (val === undefined) {
      return `${key} = ${op}`;
    } else {
      return `${key} ${op} ${val}`;
    }
  }
  _getJoinToken(joinType: string, rightTable: any, key: undefined, op: any, val: any) {
    if (key !== undefined) {
      return `${joinType} JOIN ${rightTable} ON (${this._getJoinExpr(
        key,
        op,
        val
      )})`;
    } else {
      return `${joinType} JOIN ${rightTable}`;
    }
  }
  _getInToken(cols: any, range: { statement: () => any; }, op: string | undefined) {
    cols = asToken(cols);
    op = op || "IN";
    if (typeof range === "object") {
      if (range instanceof Model) {
        return `(${cols}) ${op} (${range.statement()})`;
      } else {
        return `(${cols}) ${op} ${asLiteral(range)}`;
      }
    } else {
      return `(${cols}) ${op} ${range}`;
    }
  }
  _getUpdateQueryToken(subSelect: { _select: any; statement: () => any; }, columns: any) {
    const columnsToken =
      (columns && this._getSelectToken(columns)) || subSelect._select;
    return `(${columnsToken}) = (${subSelect.statement()})`;
  }
  _baseGetUpdateQueryToken(subSelect: Model, columns: any) {
    const columnsToken =
      (columns && this._baseGetSelectToken(columns)) || subSelect._select;
    return `(${columnsToken}) = (${subSelect.statement()})`;
  }
  _getJoinConditions(key: any, leftTable: string, rightTable: string) {
    if (typeof key === "string") {
      return `${leftTable}.${key} = ${rightTable}.${key}`;
    }
    const res = [];
    for (const k of key) {
      res.push(`${leftTable}.${k} = ${rightTable}.${k}`);
    }
    return res.join(" AND ");
  }
  _getCteValuesLiteral(rows: string | any[], columns: any[], noCheck: boolean) {
    columns = columns || this._getKeys(rows);
    rows = this._rowsToArray(rows, columns);
    const firstRow = rows[0];
    for (const [i, col] of columns.entries()) {
      const field = this._findFieldModel(col);
      if (field) {
        firstRow[i] = `${asLiteral(firstRow[i])}::${field.dbType}`;
      } else if (noCheck) {
        firstRow[i] = asLiteral(firstRow[i]);
      } else {
        throw new Error(
          "invalid field name for _get_cte_values_literal: " + col
        );
      }
    }
    const res = [];
    res[0] = "(" + asToken(firstRow) + ")";
    for (let i = 1; i <= rows.length; i = i + 1) {
      res[i] = asLiteral(rows[i]);
    }
    return [res, columns];
  }
  _handleJoin(joinType: string, joinTable: string, joinCond: string) {
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
  }
  _registerJoinModel(joinArgs: { joinKey: any; model?: any; column: any; alias?: any; fkModel: any; fkColumn: any; joinType?: any; }, joinType: string | undefined) {
    joinType = joinType || joinArgs.joinType || "INNER";
    let find = true;
    const model = joinArgs.model || this;
    const fkModel = joinArgs.fkModel;
    const column = joinArgs.column;
    const fkColumn = joinArgs.fkColumn;
    let joinKey;
    if (joinArgs.joinKey === undefined) {
      if (this.tableName === model.tableName) {
        joinKey = column + "__" + fkModel.tableName;
      } else {
        joinKey = `${joinType}__${model.tableName}__${column}__${fkModel.tableName}__${fkColumn}`;
      }
    } else {
      joinKey = joinArgs.joinKey;
    }
    if (!this._joinKeys) {
      this._joinKeys = {};
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
      const joinTable = `${fkModel.tableName} ${joinObj.fkAlias}`;
      const joinCond = `${joinObj.alias}.${joinObj.column} = ${joinObj.fkAlias}.${joinObj.fkColumn}`;
      this._handleJoin(joinType, joinTable, joinCond);
      this._joinKeys[joinKey] = joinObj;
    }
    return [joinObj, find];
  }
  _findFieldModel(col: string | number) {
    const field = this.fields[col];
    if (field) {
      return [field, this, this._as || this.tableName];
    }
    if (!this._joinKeys) {
      return [false];
    }
    for (const joinObj of Object.values(this._joinKeys)) {
      const fkField = joinObj.fkModel.fields[col];
      if (joinObj.model.tableName === this.tableName && fkField) {
        return [
          fkField,
          joinObj.fkModel,
          joinObj.fkAlias || joinObj.fkModel.tableName,
        ];
      }
    }
  }
  _getWhereKey(key: string | string[]) {
    let a = key.indexOf("__");
    if (a === -1) {
      return [this._getColumn(key), "eq"];
    }
    let e = key.slice(0, a);
    let [field, model, prefix] = this._findFieldModel(e);
    if (!field) {
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      i = a + 2;
      a = key.indexOf("__", i);
      if (a === -1) {
        e = key.slice(i);
      } else {
        e = key.slice(i, a);
      }
      if (state === NON_FOREIGN_KEY) {
        op = e;
        state = END;
      } else if (state === FOREIGN_KEY) {
        const fieldOfFk = fkModel.fields[e];
        if (fieldOfFk) {
          if (!joinKey) {
            joinKey = fieldName + "__" + fkModel.tableName;
          } else {
            joinKey = joinKey + "__" + fieldName;
          }
          const joinObj = this._registerJoinModel({
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
      if (a == -1) {
        break;
      }
    }
    return [prefix + "." + fieldName, op];
  }
  _getColumn(key: string) {
    if (this.fields[key]) {
      return (this._as && this._as + "." + key) || this.nameCache[key];
    }
    if (!this._joinKeys) {
      return key;
    }
    for (const joinObj of Object.values(this._joinKeys)) {
      if (
        joinObj.model.tableName === this.tableName &&
        joinObj.fkModel.fields[key]
      ) {
        return joinObj.fkAlias + "." + key;
      }
    }
    return key;
  }
  _getSelectColumn(key: string) {
    if (typeof key !== "string") {
      return key;
    } else {
      return this._getColumn(key);
    }
  }
  _getExprToken(value: unknown, key: any[], op: string | undefined) {
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
      throw new Error("invalid sql op: " + String(op));
    }
  }
  _getJoinNumber() {
    if (this._joinKeys) {
      return Object.keys(this._joinKeys).length + 1;
    } else {
      return 1;
    }
  }
  _handleWhereToken(whereToken: string, tpl: string) {
    if (whereToken === "") {
      return this;
    } else if (this._where === undefined) {
      this._where = whereToken;
    } else {
      this._where = stringFormat(tpl, this._where, whereToken);
    }
    return this;
  }
  _getConditionTokenFromTable(kwargs: { [s: string]: unknown; } | ArrayLike<unknown>, logic: string | undefined) {
    const tokens = [];
    if (Array.isArray(kwargs)) {
      for (const value of kwargs) {
        const token = this._getConditionToken(value);
        if (token !== undefined && token !== "") {
          tokens.push("(" + token + ")");
        }
      }
    } else {
      for (const [k, value] of Object.entries(kwargs)) {
        tokens.push(this._getExprToken(value, this._getWhereKey(k)));
      }
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + logic + " ");
    }
  }
  _getConditionToken(cond: any, op: undefined, dval: undefined) {
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
  }
  _getConditionTokenOr(cond: any, op: any, dval: any) {
    if (typeof cond === "object") {
      return this._getConditionTokenFromTable(cond, "OR");
    } else {
      return this._getConditionToken(cond, op, dval);
    }
  }
  _getConditionTokenNot(cond: any, op: any, dval: any) {
    let token;
    if (typeof cond === "object") {
      token = this._getConditionTokenFromTable(cond, "OR");
    } else {
      token = this._getConditionToken(cond, op, dval);
    }
    return (token !== "" && `NOT (${token})`) || "";
  }
  _handleSetOption(otherSql: { statement: () => any; }, innerAttr: string) {
    if (!this[innerAttr]) {
      this[innerAttr] = otherSql.statement();
    } else {
      this[innerAttr] = `(${this[innerAttr]}) ${PG_SET_MAP[innerAttr]
        } (${otherSql.statement()})`;
    }
    this.statement = this._statementForSet;
    return this;
  }
  _statementForSet() {
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
  with(name: string, token: string | Model) {
    const withToken = this._getWithToken(name, token);
    if (this._with) {
      this._with = `${this._with}, ${withToken}`;
    } else {
      this._with = withToken;
    }
    return this;
  }
  union(otherSql: any) {
    return this._handleSetOption(otherSql, "_union");
  }
  unionAll(otherSql: any) {
    return this._handleSetOption(otherSql, "_union_all");
  }
  except(otherSql: any) {
    return this._handleSetOption(otherSql, "_except");
  }
  exceptAll(otherSql: any) {
    return this._handleSetOption(otherSql, "_except_all");
  }
  intersect(otherSql: any) {
    return this._handleSetOption(otherSql, "_intersect");
  }
  intersectAll(otherSql: any) {
    return this._handleSetOption(otherSql, "_intersect_all");
  }
  as(tableAlias: any) {
    this._as = tableAlias;
    return this;
  }
  withValues(name: any, rows: any[]) {
    let columns = this._getKeys(rows[0]);
    [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
    const cteName = `${name}(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    return this.with(cteName, cteValues);
  }
  insert(rows: Model, columns: any) {
    if (!(rows instanceof Model)) {
      let vrows, vcolumns, prows, pcolumns;
      if (!this._skipValidate) {
        [vrows, vcolumns] = this.validateCreateData(rows, columns);
      } else {
        vrows = rows;
        vcolumns = columns;
      }
      [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns);
      return Model.prototype._baseInsert.call(this, prows, pcolumns);
    } else {
      return Model.prototype._baseInsert.call(this, rows, columns);
    }
  }
  update(row: Model, columns: any) {
    if (typeof row === "string") {
      return Model.prototype._baseUpdate.call(this, row);
    } else if (!(row instanceof Model)) {
      let vrow;
      if (!this._skipValidate) {
        vrow = this.validateUpdate(row, columns);
      } else {
        vrow = row;
      }
      const [prow, pcolumns] = this.prepareDbRows(vrow, columns, true);
      return Model.prototype._baseUpdate.call(this, prow, pcolumns);
    } else {
      return Model.prototype._baseUpdate.call(this, row, columns);
    }
  }
  async getMultiple(keys: any, columns: any) {
    if (this._commit === undefined || this._commit) {
      return await Model.prototype._baseGetMultiple
        .call(this, keys, columns)
        .exec();
    } else {
      return Model.prototype._baseGetMultiple.call(this, keys, columns);
    }
  }
  async merge(rows: string | any[], key: any, columns: any) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    let vrows, vcolumns, prows, pcolumns, vkey;
    if (!this._skipValidate) {
      [vrows, vcolumns, vkey] = this.validateCreateRows(rows, key, columns);
    } else {
      vrows = rows;
      vkey = key;
      vcolumns = columns;
    }
    [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, false);
    Model.prototype._baseMerge
      .call(this, prows, vkey, pcolumns)
      .returning(key)
      .compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async upsert(rows: string | any[], key: any, columns: any) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    let vrows, vcolumns, prows, pcolumns, vkey;
    if (!this._skipValidate) {
      [vrows, vcolumns, vkey] = this.validateCreateRows(rows, key, columns);
    } else {
      vrows = rows;
      vkey = key;
      vcolumns = columns;
    }
    [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, false);
    Model.prototype._baseUpsert
      .call(this, prows, vkey, pcolumns)
      .returning(key)
      .compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async updates(rows: string | any[], key: any, columns: any) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    let vrows, vcolumns, prows, pcolumns, vkey;
    if (!this._skipValidate) {
      [vrows, vcolumns, vkey] = this.validateUpdateRows(rows, key, columns);
    } else {
      vrows = rows;
      vkey = key;
      vcolumns = columns;
    }
    [prows, pcolumns] = this.prepareDbRows(vrows, vcolumns, true);
    Model.prototype._baseUpdates
      .call(this, prows, vkey, pcolumns)
      .returning(key)
      .compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async getMerge(rows: any[], key: any) {
    let columns = this._getKeys(rows[0]);
    [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
    const joinCond = this._getJoinConditions(
      key,
      "V",
      this._as || this.tableName
    );
    const cteName = `V(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    Model.prototype._baseSelect
      .call(this, "V.*")
      .with(cteName, cteValues)
      ._baseRightJoin("V", joinCond);
    if (this._commit === undefined || this._commit) {
      return await this.execr();
    } else {
      return this;
    }
  }
  copy() {
    const copySql = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value === "object") {
        copySql[key] = clone(value);
      } else {
        copySql[key] = value;
      }
    }
    return Model.new(copySql);
  }
  delete(a: undefined, b: any, c: any) {
    this._delete = true;
    if (a !== undefined) {
      this.where(a, b, c);
    }
    return this;
  }
  distinct() {
    this._distinct = true;
    return this;
  }
  select(a: string, b: undefined, ...varargs: undefined[]) {
    const s = this._getSelectToken(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  selectLiteral(a: any, b: any, ...varargs: any[]) {
    const s = this._getSelectTokenLiteral(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  returning(a: any, b: undefined, ...varargs: undefined[]) {
    const s = this._getSelectToken(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    } else {
      return this;
    }
    if (this._returningArgs) {
      this._returningArgs = [this._returningArgs, a, b, ...varargs];
    } else {
      this._returningArgs = [a, b, ...varargs];
    }
    return this;
  }
  returningLiteral(a: any, b: any, ...varargs: any[]) {
    const s = this._getSelectTokenLiteral(a, b, ...varargs);
    if (!this._returning) {
      this._returning = s;
    } else if (s !== undefined && s !== "") {
      this._returning = this._returning + ", " + s;
    }
    if (this._returningArgs) {
      this._returningArgs = [this._returningArgs, a, b, ...varargs];
    } else {
      this._returningArgs = [a, b, ...varargs];
    }
    return this;
  }
  cteReturning(opts: any) {
    this._cteReturning = opts;
    return this;
  }
  group(...varargs: any[]) {
    if (!this._group) {
      this._group = this._getSelectToken(...varargs);
    } else {
      this._group = this._group + ", " + this._getSelectToken(...varargs);
    }
    return this;
  }
  groupBy(...varargs: any[]) {
    return this.group(...varargs);
  }
  order(...varargs: any[]) {
    if (!this._order) {
      this._order = this._getSelectToken(...varargs);
    } else {
      this._order = this._order + ", " + this._getSelectToken(...varargs);
    }
    return this;
  }
  orderBy(...varargs: any[]) {
    return this.order(...varargs);
  }
  using(a: any, ...varargs: undefined[]) {
    this._delete = true;
    this._using = this._getSelectToken(a, ...varargs);
    return this;
  }
  from(a: string, ...varargs: undefined[]) {
    if (!this._from) {
      this._from = this._getSelectToken(a, ...varargs);
    } else {
      this._from = this._from + ", " + this._getSelectToken(a, ...varargs);
    }
    return this;
  }
  getTable() {
    return (
      (this._as === undefined && this.tableName) ||
      this.tableName + " AS " + this._as
    );
  }
  join(joinArgs: any, key: any, op: any, val: any) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "INNER");
    } else {
      Model.prototype._baseJoin.call(this, joinArgs, key, op, val);
    }
    return this;
  }
  innerJoin(joinArgs: any, key: any, op: any, val: any) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "INNER");
    } else {
      Model.prototype._baseJoin.call(this, joinArgs, key, op, val);
    }
    return this;
  }
  leftJoin(joinArgs: any, key: any, op: any, val: any) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "LEFT");
    } else {
      Model.prototype._baseLeftJoin.call(this, joinArgs, key, op, val);
    }
    return this;
  }
  rightJoin(joinArgs: string, key: string, op: undefined, val: undefined) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "RIGHT");
    } else {
      Model.prototype._baseRightJoin.call(this, joinArgs, key, op, val);
    }
    return this;
  }
  fullJoin(joinArgs: any, key: any, op: any, val: any) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "FULL");
    } else {
      Model.prototype._baseFullJoin.call(this, joinArgs, key, op, val);
    }
    return this;
  }
  limit(n: number) {
    this._limit = n;
    return this;
  }
  offset(n: any) {
    this._offset = n;
    return this;
  }
  where(cond: string, op: undefined, dval: undefined) {
    const whereToken = this._getConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  whereOr(cond: any, op: any, dval: any) {
    const whereToken = this._getConditionTokenOr(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhereOr(cond: any, op: any, dval: any) {
    const whereToken = this._getConditionTokenOr(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereNot(cond: any, op: any, dval: any) {
    const whereToken = this._getConditionTokenNot(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhere(cond: any, op: any, dval: any) {
    const whereToken = this._getConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  orWhereNot(cond: any, op: any, dval: any) {
    const whereToken = this._getConditionTokenNot(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereExists(builder: any) {
    if (this._where) {
      this._where = `(${this._where}) AND EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  whereNotExists(builder: any) {
    if (this._where) {
      this._where = `(${this._where}) AND NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  whereIn(cols: any[], range: any) {
    if (typeof cols === "string") {
      return Model.prototype._baseWhereIn.call(
        this,
        this._getColumn(cols),
        range
      );
    } else {
      const res = cols.map((e: any) => this._getColumn(e));
      return Model.prototype._baseWhereIn.call(this, res, range);
    }
  }
  whereNotIn(cols: string | any[], range: any) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return Model.prototype._baseWhereNotIn.call(this, cols, range);
  }
  whereNull(col: any) {
    return Model.prototype._baseWhereNull.call(this, this._getColumn(col));
  }
  whereNotNull(col: any) {
    return Model.prototype._baseWhereNotNull.call(this, this._getColumn(col));
  }
  whereBetween(col: any, low: any, high: any) {
    return Model.prototype._baseWhereBetween.call(
      this,
      this._getColumn(col),
      low,
      high
    );
  }
  whereNotBetween(col: any, low: any, high: any) {
    return Model.prototype._baseWhereNotBetween.call(
      this,
      this._getColumn(col),
      low,
      high
    );
  }
  orWhereIn(cols: string | any[], range: any) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return Model.prototype._baseOrWhereIn.call(this, cols, range);
  }
  orWhereNotIn(cols: string | any[], range: any) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return Model.prototype._baseOrWhereNotIn.call(this, cols, range);
  }
  orWhereNull(col: any) {
    return Model.prototype._baseOrWhereNull.call(this, this._getColumn(col));
  }
  orWhereNotNull(col: any) {
    return Model.prototype._baseOrWhereNotNull.call(this, this._getColumn(col));
  }
  orWhereBetween(col: any, low: any, high: any) {
    return Model.prototype._baseOrWhereBetween.call(
      this,
      this._getColumn(col),
      low,
      high
    );
  }
  orWhereNotBetween(col: any, low: any, high: any) {
    return Model.prototype._baseOrWhereNotBetween.call(
      this,
      this._getColumn(col),
      low,
      high
    );
  }
  orWhereExists(builder: any) {
    if (this._where) {
      this._where = `${this._where} OR EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  orWhereNotExists(builder: any) {
    if (this._where) {
      this._where = `${this._where} OR NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  having(cond: any, op: any, dval: any) {
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
  }
  havingNot(cond: any, op: any, dval: any) {
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
  }
  havingExists(builder: any) {
    if (this._having) {
      this._having = `(${this._having}) AND EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  havingNotExists(builder: any) {
    if (this._having) {
      this._having = `(${this._having}) AND NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  havingIn(cols: any, range: any) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `(${this._having}) AND ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  havingNotIn(cols: any, range: any) {
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
  havingBetween(col: any, low: any, high: any) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  havingNotBetween(col: any, low: any, high: any) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHaving(cond: any, op: any, dval: any) {
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
  }
  orHavingNot(cond: any, op: any, dval: any) {
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
  }
  orHavingExists(builder: any) {
    if (this._having) {
      this._having = `${this._having} OR EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  orHavingNotExists(builder: any) {
    if (this._having) {
      this._having = `${this._having} OR NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  orHavingIn(cols: any, range: any) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `${this._having} OR ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  orHavingNotIn(cols: any, range: any) {
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
  orHavingBetween(col: any, low: any, high: any) {
    if (this._having) {
      this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHavingNotBetween(col: any, low: any, high: any) {
    if (this._having) {
      this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  async exists() {
    const statement = `SELECT EXISTS (${this.select("").limit(1).statement()})`;
    const res = await this.query(statement);
    return res;
  }
  compact() {
    this._compact = true;
    return this;
  }
  raw() {
    this._raw = true;
    return this;
  }
  commit(bool: boolean | undefined) {
    if (bool === undefined) {
      bool = true;
    }
    this._commit = bool;
    return this;
  }
  skipValidate(bool: boolean | undefined) {
    if (bool === undefined) {
      bool = true;
    }
    this._skipValidate = bool;
    return this;
  }
  async flat(depth: any) {
    const res = await this.compact().execr();
    return res.flat(depth);
  }
  async get(cond: undefined, op: any, dval: any) {
    let records;
    if (cond !== undefined) {
      records = await this.where(cond, op, dval).limit(2).exec();
    } else {
      records = await this.limit(2).exec();
    }
    if (records.length === 1) {
      return records[0];
    } else {
      throw new Error("not 1 record returned:" + records.length);
    }
  }
  async getOrCreate(params: any, defaults: any) {
    const records = await this.where(params).limit(2).exec();
    if (records.length === 1) {
      return [records[0], false];
    } else if (records.length === 0) {
      const pk = this.primaryKey;
      const data = { ...params, ...defaults };
      //**
      const cls = Object.getPrototypeOf(this);
      const res = await cls.newSql().insert(data).returning(pk).execr();
      data[pk] = res[0][pk];
      return [cls.newRecord(data), true];
    } else {
      throw new Error("expect 1 row returned, but now get " + records.length);
    }
  }
  async asSet() {
    const res = (await this.compact().execr()).flat();
    return new Set(res);
  }
  async query(statement: string) {
    console.log(statement);
    return await this.defaultQuery(statement, this._compact);
  }
  defaultQuery(statement: any, _compact: any) {
    throw new Error("Method not implemented.");
  }
  async execr() {
    return await this.raw().exec();
  }
  async exec() {
    const statement = this.statement();
    const records = await this.query(statement);
    const cls = Object.getPrototypeOf(this);
    if (this._raw || this._compact) {
      return records;
    } else if (
      this._select ||
      (!this._update && !this._insert && !this._delete)
    ) {
      if (!this._loadFk) {
        for (const [i, record] of records.entries()) {
          records[i] = cls.load(record);
        }
      } else {
        const fields = cls.fields;
        const fieldNames = cls.fieldNames;
        for (const [i, record] of records.entries()) {
          for (const name of fieldNames) {
            const field = fields[name];
            const value = record[name];
            if (value !== undefined) {
              const fkModel = this._loadFk[name];
              if (!fkModel) {
                if (!field.load) {
                  record[name] = value;
                } else {
                  record[name] = field.load(value);
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
      return records;
    } else {
      return records;
    }
  }
  loadFk(fkName: string, selectNames: string, ...varargs: any[]) {
    const fk = this.foreignKeys[fkName];
    if (fk === undefined) {
      throw new Error(
        fkName + (" is not a valid forein key name for " + this.tableName)
      );
    }
    const fkModel = fk.reference;
    const joinKey = fkName + "__" + fkModel.tableName;
    const joinObj = this._registerJoinModel({
      joinKey: joinKey,
      column: fkName,
      fkModel: fkModel,
      fkColumn: fk.referenceColumn,
    });
    if (!this._loadFk) {
      this._loadFk = {};
    }
    this._loadFk[fkName] = fkModel;
    if (!selectNames) {
      return this;
    }
    const rightAlias = joinObj.fkAlias;
    let fks;
    if (typeof selectNames === "object") {
      const res = [];
      for (const fkn of selectNames) {
        assert(fkModel.fields[fkn], "invalid field name for fk model: " + fkn);
        res.push(`${rightAlias}.${fkn} AS ${fkName}__${fkn}`);
      }
      fks = res.join(", ");
    } else if (selectNames === "*") {
      const res = [];
      for (const fkn of fkModel.fieldNames) {
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
        const fkn = varargs[i];
        assert(fkModel.fields[fkn], "invalid field name for fk model: " + fkn);
        fks = `${fks}, ${rightAlias}.${fkn} AS ${fkName}__${fkn}`;
      }
    } else {
      throw new Error(
        `invalid argument type ${typeof selectNames} for load_fk`
      );
    }
    return Model.prototype._baseSelect.call(this, fks);
  }
}

export default Model;
