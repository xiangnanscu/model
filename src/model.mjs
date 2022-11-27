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
  extend: true,
  mixins: true,
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
  "Record",
  "sqlQuery",
  "__is_model_class__",
];
const getLocalTime = Field.basefield.getLocalTime;
const stringFormat = (s, ...varargs) => {
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
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const baseModel = {
  abstract: true,
  fieldNames: ["id", "ctime", "utime"],
  fields: {
    id: { type: "integer", primaryKey: true, serial: true },
    ctime: { label: "创建时间", type: "datetime", autoNowAdd: true },
    utime: { label: "更新时间", type: "datetime", autoNow: true },
  },
};
const unique = (arr) => {
  return arr.filter((e, i) => arr.indexOf(e) === i);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
function _prefixWith_V(column) {
  return "V." + column;
}
function map(tbl, func) {
  const res = [];
  for (let i = 0; i < tbl.length; i = i + 1) {
    res[i] = func(tbl[i]);
  }
  return res;
}
function checkReserved(name) {
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
function normalizeArrayAndHashFields(fields) {
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
function normalizeFieldNames(fieldNames) {
  assert(
    typeof fieldNames === "object",
    "you must provide field_names for a model"
  );
  for (const name of fieldNames) {
    assert(typeof name === "string", "element of field_names must be string");
  }
  return fieldNames;
}
function getForeignObject(attrs, prefix) {
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
function makeRecordClass(model) {
  class Record {
    constructor(attrs) {
      Object.assign(this, attrs);
    }
    async delete(key) {
      key = key || model.primaryKey;
      return await model.delete({ [key]: this[key] }).exec();
    }
    async save(names, key) {
      return await model.save(this, names, key);
    }
    async saveCreate(names, key) {
      return await model.saveCreate(this, names, key);
    }
    async saveUpdate(names, key) {
      return await model.saveUpdate(this, names, key);
    }
    validate(names, key) {
      return model.validate(this, names, key);
    }
    validateUpdate(names) {
      return model.validateUpdate(this, names);
    }
    validateCreate(names) {
      return model.validateCreate(this, names);
    }
  }
  return Record;
}
function assert(bool, errMsg) {
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
  constructor({ name, message, label, httpCode, index }) {
    super({ name, message, label, httpCode });
    this.index = index;
  }
  String() {
    return `FIELD ERROR: ${this.name}(${this.label})+${this.message}`;
  }
}
function checkUpsertKey(rows, key) {
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
function makeFieldFromJson(json, kwargs) {
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
function makeToken(s) {
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
function _escapeFactory(isLiteral, isBracket) {
  function asSqlToken(value) {
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
function getCteReturningValues(columns, literals) {
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
function getReturningToken(opts) {
  if (opts.cteReturning) {
    return " RETURNING " + asToken(getCteReturningValues(opts.cteReturning));
  } else if (opts.returning) {
    return " RETURNING " + opts.returning;
  } else {
    return "";
  }
}
function assembleSql(opts) {
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

class ModelProxy {
  constructor(attrs) {
    Object.assign(this, attrs);
  }
  static createProxy(modelclass) {
    return new this({
      modelclass: modelclass,
      tableName: modelclass.tableName,
      fieldNames: modelclass.fieldNames,
      fields: modelclass.fields,
      abstract: modelclass.abstract,
    });
  }
  new(attr) {
    return this.modelclass.new(attr);
  }
  async all() {
    return await this.modelclass.all();
  }
  async save(input, names, key) {
    return await this.modelclass.save(input, names, key);
  }
  async saveCreate(input, names, key) {
    return await this.modelclass.saveCreate(input, names, key);
  }
  async saveUpdate(input, names, key) {
    return await this.modelclass.saveUpdate(input, names, key);
  }
  validate(input, names, key) {
    return this.modelclass.validate(input, names, key);
  }
  validateCreate(input, names) {
    return this.modelclass.validateCreate(input, names);
  }
  validateUpdate(input, names) {
    return this.modelclass.validateUpdate(input, names);
  }
  load(data) {
    return this.modelclass.load(data);
  }
  async count(cond, op, dval) {
    return await this.modelclass.count(cond, op, dval);
  }
  async filter(kwargs) {
    return await this.modelclass.filter(kwargs);
  }
  async getOrCreate(params, defaults) {
    return await this.modelclass.newSql().getOrCreate(params, defaults);
  }
  select(a, b, ...varargs) {
    return this.modelclass.newSql().select(a, b, ...varargs);
  }
  as(tableAlias) {
    return this.modelclass.newSql().as(tableAlias);
  }
  limit(n) {
    return this.modelclass.newSql().limit(n);
  }
  offset(n) {
    return this.modelclass.newSql().offset(n);
  }
  commit(bool) {
    return this.modelclass.newSql().commit(bool);
  }
  skipValidate(bool) {
    return this.modelclass.newSql().skipValidate(bool);
  }
  with(name, token) {
    return this.modelclass.newSql().with(name, token);
  }
  withValues(name, rows) {
    return this.modelclass.newSql().withValues(name, rows);
  }
  insert(rows, columns) {
    return this.modelclass.newSql().insert(rows, columns);
  }
  async get(cond, op, dval) {
    return await this.modelclass.newSql().get(cond, op, dval);
  }
  update(row, columns) {
    return this.modelclass.newSql().update(row, columns);
  }
  delete(a, b, c) {
    return this.modelclass.newSql().delete(a, b, c);
  }
  getMerge(rows, key) {
    return this.modelclass.newSql().getMerge(rows, key);
  }
  async getMultiple(keys, columns) {
    return await this.modelclass.newSql().getMultiple(keys, columns);
  }
  async merge(rows, key, columns) {
    return await this.modelclass.newSql().merge(rows, key, columns);
  }
  async upsert(rows, key, columns) {
    return await this.modelclass.newSql().upsert(rows, key, columns);
  }
  async updates(rows, key, columns) {
    return await this.modelclass.newSql().updates(rows, key, columns);
  }
  group(...varargs) {
    return this.modelclass.newSql().group(...varargs);
  }
  groupBy(...varargs) {
    return this.modelclass.newSql().groupBy(...varargs);
  }
  order(...varargs) {
    return this.modelclass.newSql().order(...varargs);
  }
  orderBy(...varargs) {
    return this.modelclass.newSql().orderBy(...varargs);
  }
  join(joinArgs, key, op, val) {
    return this.modelclass.newSql().join(joinArgs, key, op, val);
  }
  leftJoin(joinArgs, key, op, val) {
    return this.modelclass.newSql().leftJoin(joinArgs, key, op, val);
  }
  rightJoin(joinArgs, key, op, val) {
    return this.modelclass.newSql().rightJoin(joinArgs, key, op, val);
  }
  fullJoin(joinArgs, key, op, val) {
    return this.modelclass.newSql().fullJoin(joinArgs, key, op, val);
  }
  loadFk(fkName, selectNames, ...varargs) {
    return this.modelclass.newSql().loadFk(fkName, selectNames, ...varargs);
  }
  where(cond, op, dval) {
    return this.modelclass.newSql().where(cond, op, dval);
  }
  whereOr(cond, op, dval) {
    return this.modelclass.newSql().whereOr(cond, op, dval);
  }
  whereNot(cond, op, dval) {
    return this.modelclass.newSql().whereNot(cond, op, dval);
  }
  whereExists(builder) {
    return this.modelclass.newSql().whereExists(builder);
  }
  whereNotExists(builder) {
    return this.modelclass.newSql().whereNotExists(builder);
  }
  whereIn(cols, range) {
    return this.modelclass.newSql().whereIn(cols, range);
  }
  whereNotIn(cols, range) {
    return this.modelclass.newSql().whereNotIn(cols, range);
  }
  whereNull(col) {
    return this.modelclass.newSql().whereNull(col);
  }
  whereNotNull(col) {
    return this.modelclass.newSql().whereNotNull(col);
  }
  whereBetween(col, low, high) {
    return this.modelclass.newSql().whereBetween(col, low, high);
  }
  whereNotBetween(col, low, high) {
    return this.modelclass.newSql().whereNotBetween(col, low, high);
  }
}

class Model {
  static ValidateError = ValidateError;
  static ValidateBatchError = ValidateBatchError;
  static baseModel = baseModel;
  static makeFieldFromJson = makeFieldFromJson;
  static token = makeToken;
  static NULL = NULL;
  static DEFAULT = DEFAULT;
  static asToken = asToken;
  static asLiteral = asLiteral;
  constructor(attrs) {
    Object.assign(this, attrs);
  }
  static new(self) {
    return new this(self);
  }
  static createModel(options) {
    const XodelClass = this.makeModelClass(this.normalize(options));
    return ModelProxy.createProxy(XodelClass);
  }
  static makeModelClass(opts) {
    class ConcreteModel extends this {
      static sqlQuery = opts.sqlQuery;
      static tableName = opts.tableName;
      static fields = opts.fields;
      static fieldNames = opts.fieldNames;
      static primaryKey = opts.primaryKey;
      static defaultPrimaryKey = opts.defaultPrimaryKey;
      static mixins = opts.mixins;
      static extend = opts.extend;
      static abstract = opts.abstract;
      static disableAutoPrimaryKey = opts.disableAutoPrimaryKey;
      newRecord(data) {
        return ConcreteModel.newRecord.call(this, data);
      }
      newSql() {
        return ConcreteModel.newSql.call(this);
      }
      load(data) {
        return ConcreteModel.load.call(this, data);
      }
      validateCreateData(rows, columns) {
        return ConcreteModel.validateCreateData.call(this, rows, columns);
      }
      validateUpdateData(rows, columns) {
        return ConcreteModel.validateUpdateData.call(this, rows, columns);
      }
      validateCreateRows(rows, key, columns) {
        return ConcreteModel.validateCreateRows.call(this, rows, key, columns);
      }
      validateUpdateRows(rows, key, columns) {
        return ConcreteModel.validateUpdateRows.call(this, rows, key, columns);
      }
      prepareForDb(data, columns, isUpdate) {
        return ConcreteModel.prepareForDb.call(this, data, columns, isUpdate);
      }
      prepareDbRows(rows, columns, isUpdate) {
        return ConcreteModel.prepareDbRows.call(this, rows, columns, isUpdate);
      }
      validate(input, names, key) {
        return ConcreteModel.validate.call(this, input, names, key);
      }
      validateCreate(input, names) {
        return ConcreteModel.validateCreate.call(this, input, names);
      }
      validateUpdate(input, names) {
        return ConcreteModel.validateUpdate.call(this, input, names);
      }
      getKeys(rows) {
        return ConcreteModel.getKeys.call(this, rows);
      }
    }
    const className = {
      value: `${capitalize(ConcreteModel.tableName)}Model`,
    };
    Object.defineProperty(ConcreteModel, "name", className);
    if (opts.sql) {
      // https://www.npmjs.com/package/postgres#connection-details
      const sql = opts.sql;
      ConcreteModel.sqlQuery = async function (statement, args, options) {
        return await sql.unsafe(statement, args, options);
      };
    }
    const notAbstract = !ConcreteModel.abstract;
    if (notAbstract) {
      if (!ConcreteModel.tableName) {
        const namesHint =
          (ConcreteModel.fieldNames && ConcreteModel.fieldNames.join(",")) ||
          "no field_names";
        throw new Error(
          `you must define table_name for a non-abstract model (${namesHint})`
        );
      }
      checkReserved(ConcreteModel.tableName);
    }
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
    if (notAbstract && !pkDefined && !ConcreteModel.disableAutoPrimaryKey) {
      const pkName = ConcreteModel.defaultPrimaryKey || "id";
      ConcreteModel.primaryKey = pkName;
      ConcreteModel.fields[pkName] = Field.integer.new({
        name: pkName,
        primaryKey: true,
        serial: true,
      });
      ConcreteModel.fieldNames.unshift(pkName);
    }
    if (notAbstract) {
      ConcreteModel.nameCache = {};
    }
    ConcreteModel.labelToName = {};
    ConcreteModel.nameToLabel = {};
    for (const [name, field] of Object.entries(ConcreteModel.fields)) {
      ConcreteModel.labelToName[field.label] = name;
      ConcreteModel.nameToLabel[name] = field.label;
      if (notAbstract) {
        ConcreteModel.nameCache[name] = ConcreteModel.tableName + "." + name;
      }
      if (field.dbType === Field.basefield.NOT_DEFIEND) {
        field.dbType = ConcreteModel.fields[field.referenceColumn].dbType;
      }
    }
    ConcreteModel.__is_model_class__ = true;
    if (notAbstract) {
      ConcreteModel.Record = makeRecordClass(ConcreteModel);
    }
    for (const name of SHARED_NAMES) {
      if (
        ConcreteModel.prototype[name] === undefined &&
        ConcreteModel[name] !== undefined
      ) {
        ConcreteModel.prototype[name] = ConcreteModel[name];
      }
    }
    return ConcreteModel;
  }
  static normalize(options) {
    const extend = options.extend;
    const model = {
      sql: options.sql,
    };
    const optsFields = normalizeArrayAndHashFields(options.fields || []);
    let optsNames = options.fieldNames;
    if (!optsNames) {
      const selfNames = Object.keys(optsFields);
      if (extend) {
        optsNames = unique([...extend.fieldNames, ...selfNames]);
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
        if (extend) {
          field = extend.fields[name];
          if (!field) {
            throw new Error(
              `'${tname}' field name '${name}' is not in fields and parent fields`
            );
          }
        } else {
          throw new Error(`'${tname}' field name '${name}' is not in fields`);
        }
      } else if (!(field instanceof Field.basefield)) {
        if (extend) {
          const pfield = extend.fields[name];
          if (pfield) {
            field = { ...pfield.getOptions(), ...field };
            if (pfield.model && field.model) {
              field.model = this.createModel({
                abstract: true,
                extend: pfield.model,
                fields: field.model.fields,
                fieldNames: field.model.fieldNames,
              });
            }
          }
        }
      }
      if (!(field instanceof Field.basefield)) {
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
  static mixWithBase(...varargs) {
    return this.mix(baseModel, ...varargs);
  }
  static mix(...varargs) {
    return this.makeModelClass(this.mergeModels([...varargs]));
  }
  static mergeModels(models) {
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
  static mergeModel(a, b) {
    const A = (a.__normalized__ && a) || this.normalize(a);
    const B = (b.__normalized__ && b) || this.normalize(b);
    const C = [];
    const fieldNames = unique([...A.fieldNames, ...B.fieldNames]);
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
  static mergeField(a, b) {
    const aopts = a instanceof Field ? a.getOptions() : clone(a);
    const bopts = b instanceof Field ? b.getOptions() : clone(b);
    const options = { ...aopts, ...bopts };
    if (aopts.model && bopts.model) {
      options.model = this.mergeModel(aopts.model, bopts.model);
    }
    return makeFieldFromJson(options);
  }
  static async filter(kwargs) {
    return await this.newSql().where(kwargs).exec();
  }
  static async count(cond, op, dval) {
    const res = await this.newSql()
      .select("count(*)")
      .where(cond, op, dval)
      .compact()
      .exec();
    return res[0][0];
  }
  static async all() {
    const records = await this.sqlQuery("SELECT * FROM " + this.tableName);
    for (let i = 0; i < records.length; i = i + 1) {
      records[i] = this.load(records[i]);
    }
    return records;
  }
  static async save(input, names, key) {
    key = key || this.primaryKey;
    if (input[key] !== undefined) {
      return await this.saveUpdate(input, names, key);
    } else {
      return await this.saveCreate(input, names, key);
    }
  }
  static async saveCreate(input, names, key) {
    const data = this.validateCreate(input, names);
    return await this.createFrom(data, key);
  }
  static async saveUpdate(input, names, key) {
    const data = this.validateUpdate(input, names);
    key = key || this.primaryKey;
    data[key] = input[key];
    return await this.updateFrom(data, key);
  }
  static newRecord(data) {
    return new this.Record(data);
  }
  static newSql() {
    return new this({ tableName: this.tableName });
  }
  static async createFrom(data, key) {
    key = key || this.primaryKey;
    const prepared = this.prepareForDb(data);
    const created = await this.newSql()
      ._baseInsert(prepared)
      ._baseReturning(key)
      .execr();
    data[key] = created[0][key];
    return this.newRecord(data);
  }
  static async updateFrom(data, key) {
    key = key || this.primaryKey;
    const prepared = this.prepareForDb(data, undefined, true);
    const lookValue = assert(data[key], "no key provided for update");
    const updateResult = await this.newSql()
      ._baseUpdate(prepared)
      .where({ [key]: lookValue })
      .returning(key)
      .execr();
    if (updateResult.length === 1) {
      return this.newRecord(data);
    } else if (updateResult.length === 0) {
      throw new Error(
        `update failed, record does not exist(model:${this.tableName}, key:${key}, value:${lookValue})`
      );
    } else {
      throw new Error(
        `not 1 record are updated(model:${this.tableName}, key:${key}, value:${lookValue})`
      );
    }
  }
  static validate(input, names, key) {
    if (input[key || this.primaryKey] !== undefined) {
      return this.validateUpdate(input, names);
    } else {
      return this.validateCreate(input, names);
    }
  }
  static validateCreate(input, names) {
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
  static validateUpdate(input, names) {
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
  static parseErrorMessage(err) {
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
    return this.newRecord(data);
  }
  static validateCreateData(rows, columns) {
    let cleaned;
    columns = columns || this.getKeys(rows);
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
  static validateUpdateData(rows, columns) {
    let cleaned;
    columns = columns || this.getKeys(rows);
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
  static validateCreateRows(rows, key, columns) {
    const [checkedRows, checkedKey] = checkUpsertKey(
      rows,
      key || this.primaryKey
    );
    const [cleanedRows, cleanedColumns] = this.validateCreateData(
      checkedRows,
      columns
    );
    return [cleanedRows, checkedKey, cleanedColumns];
  }
  static validateUpdateRows(rows, key, columns) {
    const [checkedRows, checkedKey] = checkUpsertKey(
      rows,
      key || this.primaryKey
    );
    const [cleanedRows, cleanedColumns] = this.validateUpdateData(
      checkedRows,
      columns
    );
    return [cleanedRows, checkedKey, cleanedColumns];
  }
  static prepareDbRows(rows, columns, isUpdate) {
    let cleaned;
    columns = columns || this.getKeys(rows);
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
  static prepareForDb(data, columns, isUpdate) {
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
  static getKeys(rows) {
    const columns = [];
    if (rows instanceof Array) {
      const d = [];
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
  _baseSelect(a, b, ...varargs) {
    const s = this._baseGetSelectToken(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  _baseGetSelectToken(a, b, ...varargs) {
    if (b === undefined) {
      if (typeof a === "object") {
        return this._baseGetSelectToken(...a);
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
  _baseInsert(rows, columns) {
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
  _baseUpdate(row, columns) {
    if (row instanceof Model) {
      this._update = this._baseGetUpdateQueryToken(row, columns);
    } else if (typeof row === "object") {
      this._update = this._getUpdateToken(row, columns);
    } else {
      this._update = row;
    }
    return this;
  }
  _baseMerge(rows, key, columns) {
    [rows, columns] = this._getCteValuesLiteral(rows, columns, false);
    const cteName = `V(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    const joinCond = this._getJoinConditions(key, "V", "T");
    const valsColumns = columns.map(_prefixWith_V);
    const insertSubquery = Model.new({ tableName: "V" })
      ._baseSelect(valsColumns)
      ._baseLeftJoin("U AS T", joinCond)
      ._baseWhereNull("T." + (Array.isArray(key) ? key[0] : key));
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
    return this._baseInsert(insertSubquery, columns);
  }
  _baseUpsert(rows, key, columns) {
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
  _baseUpdates(rows, key, columns) {
    if (rows instanceof Model) {
      columns = columns || rows._returningArgs.flat();
      const cteName = `V(${columns.join(", ")})`;
      const joinCond = this._getJoinConditions(
        key,
        "V",
        this._as || this.tableName
      );
      this.with(cteName, rows);
      return this._baseUpdate(this._getUpdateTokenWithPrefix(columns, key, "V"))
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
      return this._baseUpdate(this._getUpdateTokenWithPrefix(columns, key, "V"))
        .from("V")
        .where(joinCond);
    }
  }
  _baseGetMultiple(keys, columns) {
    if (keys.length === 0) {
      throw new Error("empty keys passed to get_multiple");
    }
    columns = columns || this.getKeys(keys[0]);
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
  _baseReturning(a, b, ...varargs) {
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
  _baseFrom(a, ...varargs) {
    if (!this._from) {
      this._from = this._baseGetSelectToken(a, ...varargs);
    } else {
      this._from = this._from + ", " + this._baseGetSelectToken(a, ...varargs);
    }
    return this;
  }
  _baseJoin(rightTable, key, op, val) {
    const joinToken = this._getJoinToken("INNER", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseLeftJoin(rightTable, key, op, val) {
    const joinToken = this._getJoinToken("LEFT", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseRightJoin(rightTable, key, op, val) {
    const joinToken = this._getJoinToken("RIGHT", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseFullJoin(rightTable, key, op, val) {
    const joinToken = this._getJoinToken("FULL", rightTable, key, op, val);
    this._from = `${this._from || this.getTable()} ${joinToken}`;
    return this;
  }
  _baseWhere(cond, op, dval) {
    const whereToken = this._baseGetConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  _baseGetConditionTokenFromTable(kwargs, logic) {
    const tokens = [];
    if (Array.isArray(kwargs)) {
      for (const value of kwargs) {
        const token = this._baseGetConditionToken(value);
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
  _baseGetConditionToken(cond, op, dval) {
    if (op === undefined) {
      const argtype = typeof cond;
      if (argtype === "object") {
        return this._baseGetConditionTokenFromTable(cond);
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
  _baseWhereIn(cols, range) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `(${this._where}) AND ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  _baseWhereNotIn(cols, range) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `(${this._where}) AND ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  _baseWhereNull(col) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _baseWhereNotNull(col) {
    if (this._where) {
      this._where = `(${this._where}) AND ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _baseWhereBetween(col, low, high) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseWhereNotBetween(col, low, high) {
    if (this._where) {
      this._where = `(${this._where}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseOrWhereIn(cols, range) {
    const inToken = this._getInToken(cols, range);
    if (this._where) {
      this._where = `${this._where} OR ${inToken}`;
    } else {
      this._where = inToken;
    }
    return this;
  }
  _baseOrWhereNotIn(cols, range) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._where) {
      this._where = `${this._where} OR ${notInToken}`;
    } else {
      this._where = notInToken;
    }
    return this;
  }
  _baseOrWhereNull(col) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NULL`;
    } else {
      this._where = col + " IS NULL";
    }
    return this;
  }
  _baseOrWhereNotNull(col) {
    if (this._where) {
      this._where = `${this._where} OR ${col} IS NOT NULL`;
    } else {
      this._where = col + " IS NOT NULL";
    }
    return this;
  }
  _baseOrWhereBetween(col, low, high) {
    if (this._where) {
      this._where = `${this._where} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _baseOrWhereNotBetween(col, low, high) {
    if (this._where) {
      this._where = `${this._where} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._where = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  _rowsToArray(rows, columns) {
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
  _getInsertValuesToken(row, columns) {
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
  _getBulkInsertValuesToken(rows, columns) {
    columns = columns || this.getKeys(rows);
    rows = this._rowsToArray(rows, columns);
    return [map(rows, asLiteral), columns];
  }
  _getUpdateTokenWithPrefix(columns, key, tableName) {
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
  _getSelectToken(a, b, ...varargs) {
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
  _getSelectTokenLiteral(a, b, ...varargs) {
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
  _getUpdateToken(row, columns) {
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
  _getWithToken(name, token) {
    if (token === undefined) {
      return name;
    } else if (token instanceof Model) {
      return `${name} AS (${token.statement()})`;
    } else {
      return `${name} AS ${token}`;
    }
  }
  _getInsertToken(row, columns) {
    const [valuesToken, insertColumns] = this._getInsertValuesToken(
      row,
      columns
    );
    return `(${asToken(insertColumns)}) VALUES ${valuesToken}`;
  }
  _getBulkInsertToken(rows, columns) {
    [rows, columns] = this._getBulkInsertValuesToken(rows, columns);
    return `(${asToken(columns)}) VALUES ${asToken(rows)}`;
  }
  _setSelectSubqueryInsertToken(subQuery, columns) {
    const columnsToken = asToken(columns || subQuery._select || "");
    if (columnsToken !== "") {
      this._insert = `(${columnsToken}) ${subQuery.statement()}`;
    } else {
      this._insert = subQuery.statement();
    }
  }
  _setCudSubqueryInsertToken(subQuery) {
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
  _getUpsertToken(row, key, columns) {
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
  _getBulkUpsertToken(rows, key, columns) {
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
  _getUpsertQueryToken(rows, key, columns) {
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
  _getJoinExpr(key, op, val) {
    if (op === undefined) {
      return key;
    } else if (val === undefined) {
      return `${key} = ${op}`;
    } else {
      return `${key} ${op} ${val}`;
    }
  }
  _getJoinToken(joinType, rightTable, key, op, val) {
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
  _getInToken(cols, range, op) {
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
  _getUpdateQueryToken(subSelect, columns) {
    const columnsToken =
      (columns && this._getSelectToken(columns)) || subSelect._select;
    return `(${columnsToken}) = (${subSelect.statement()})`;
  }
  _baseGetUpdateQueryToken(subSelect, columns) {
    const columnsToken =
      (columns && this._baseGetSelectToken(columns)) || subSelect._select;
    return `(${columnsToken}) = (${subSelect.statement()})`;
  }
  _getJoinConditions(key, leftTable, rightTable) {
    if (typeof key === "string") {
      return `${leftTable}.${key} = ${rightTable}.${key}`;
    }
    const res = [];
    for (const k of key) {
      res.push(`${leftTable}.${k} = ${rightTable}.${k}`);
    }
    return res.join(" AND ");
  }
  _getCteValuesLiteral(rows, columns, noCheck) {
    columns = columns || this.getKeys(rows);
    rows = this._rowsToArray(rows, columns);
    const firstRow = rows[0];
    for (const [i, col] of columns.entries()) {
      const [field] = this._findFieldModel(col);
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
    for (let i = 1; i < rows.length; i = i + 1) {
      res[i] = asLiteral(rows[i]);
    }
    return [res, columns];
  }
  _handleJoin(joinType, joinTable, joinCond) {
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
  _registerJoinModel(joinArgs, joinType) {
    joinType = joinType || joinArgs.joinType || "INNER";
    // let find = true;
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
      // find = false;
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
    return joinObj; // [joinObj, find];
  }
  _findFieldModel(col) {
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
  _getWhereKey(key) {
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
  _getColumn(key) {
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
  _getSelectColumn(key) {
    if (typeof key !== "string") {
      return key;
    } else {
      return this._getColumn(key);
    }
  }
  _getExprToken(value, key, op) {
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
  _handleWhereToken(whereToken, tpl) {
    if (whereToken === "") {
      return this;
    } else if (this._where === undefined) {
      this._where = whereToken;
    } else {
      this._where = stringFormat(tpl, this._where, whereToken);
    }
    return this;
  }
  _getConditionTokenFromTable(kwargs, logic) {
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
        tokens.push(this._getExprToken(value, ...this._getWhereKey(k)));
      }
    }
    if (logic === undefined) {
      return tokens.join(" AND ");
    } else {
      return tokens.join(" " + logic + " ");
    }
  }
  _getConditionToken(cond, op, dval) {
    if (op === undefined) {
      if (typeof cond === "object") {
        return this._getConditionTokenFromTable(cond);
      } else {
        return this._baseGetConditionToken(cond);
      }
    } else if (dval === undefined) {
      return `${this._getColumn(cond)} = ${asLiteral(op)}`;
    } else {
      return `${this._getColumn(cond)} ${op} ${asLiteral(dval)}`;
    }
  }
  _getConditionTokenOr(cond, op, dval) {
    if (typeof cond === "object") {
      return this._getConditionTokenFromTable(cond, "OR");
    } else {
      return this._getConditionToken(cond, op, dval);
    }
  }
  _getConditionTokenNot(cond, op, dval) {
    let token;
    if (typeof cond === "object") {
      token = this._getConditionTokenFromTable(cond, "OR");
    } else {
      token = this._getConditionToken(cond, op, dval);
    }
    return (token !== "" && `NOT (${token})`) || "";
  }
  _handleSetOption(otherSql, innerAttr) {
    if (!this[innerAttr]) {
      this[innerAttr] = otherSql.statement();
    } else {
      this[innerAttr] = `(${this[innerAttr]}) ${
        PG_SET_MAP[innerAttr]
      } (${otherSql.statement()})`;
    }
    this.statement = this._statementForSet;
    return this;
  }
  _statementForSet() {
    let statement = this.statement();
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
  with(name, token) {
    const withToken = this._getWithToken(name, token);
    if (this._with) {
      this._with = `${this._with}, ${withToken}`;
    } else {
      this._with = withToken;
    }
    return this;
  }
  union(otherSql) {
    return this._handleSetOption(otherSql, "_union");
  }
  unionAll(otherSql) {
    return this._handleSetOption(otherSql, "_union_all");
  }
  except(otherSql) {
    return this._handleSetOption(otherSql, "_except");
  }
  exceptAll(otherSql) {
    return this._handleSetOption(otherSql, "_except_all");
  }
  intersect(otherSql) {
    return this._handleSetOption(otherSql, "_intersect");
  }
  intersectAll(otherSql) {
    return this._handleSetOption(otherSql, "_intersect_all");
  }
  as(tableAlias) {
    this._as = tableAlias;
    return this;
  }
  withValues(name, rows) {
    let columns = this.getKeys(rows[0]);
    [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
    const cteName = `${name}(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    return this.with(cteName, cteValues);
  }
  insert(rows, columns) {
    if (!(rows instanceof Model)) {
      if (!this._skipValidate) {
        [rows, columns] = this.validateCreateData(rows, columns);
      }
      [rows, columns] = this.prepareDbRows(rows, columns);
    }
    return this._baseInsert(rows, columns);
  }
  update(row, columns) {
    if (typeof row === "string") {
      return this._baseUpdate(row);
    } else if (!(row instanceof Model)) {
      if (!this._skipValidate) {
        row = this.validateUpdate(row, columns);
      }
      [row, columns] = this.prepareDbRows(row, columns, true);
    }
    return this._baseUpdate(row, columns);
  }
  async getMultiple(keys, columns) {
    if (this._commit === undefined || this._commit) {
      return await this._baseGetMultiple(keys, columns).exec();
    } else {
      return this._baseGetMultiple(keys, columns);
    }
  }
  async merge(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skipValidate) {
      [rows, key, columns] = this.validateCreateRows(rows, key, columns);
    }
    [rows, columns] = this.prepareDbRows(rows, columns, false);
    this._baseMerge(rows, key, columns).returning(key).compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async upsert(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skipValidate) {
      [rows, key, columns] = this.validateCreateRows(rows, key, columns);
    }
    [rows, columns] = this.prepareDbRows(rows, columns, false);
    this._baseUpsert(rows, key, columns).returning(key).compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async updates(rows, key, columns) {
    if (rows.length === 0) {
      throw new Error("empty rows passed to merge");
    }
    if (!this._skipValidate) {
      [rows, key, columns] = this.validateUpdateRows(rows, key, columns);
    }
    [rows, columns] = this.prepareDbRows(rows, columns, true);
    this._baseUpdates(rows, key, columns).returning(key).compact();
    if (this._commit === undefined || this._commit) {
      return await this.exec();
    } else {
      return this;
    }
  }
  async getMerge(rows, key) {
    let columns = this.getKeys(rows[0]);
    [rows, columns] = this._getCteValuesLiteral(rows, columns, true);
    const joinCond = this._getJoinConditions(
      key,
      "V",
      this._as || this.tableName
    );
    const cteName = `V(${columns.join(", ")})`;
    const cteValues = `(VALUES ${asToken(rows)})`;
    this._baseSelect("V.*")
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
  delete(a, b, c) {
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
  select(a, b, ...varargs) {
    const s = this._getSelectToken(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  selectLiteral(a, b, ...varargs) {
    const s = this._getSelectTokenLiteral(a, b, ...varargs);
    if (!this._select) {
      this._select = s;
    } else if (s !== undefined && s !== "") {
      this._select = this._select + ", " + s;
    }
    return this;
  }
  returning(a, b, ...varargs) {
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
  returningLiteral(a, b, ...varargs) {
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
  cteReturning(opts) {
    this._cteReturning = opts;
    return this;
  }
  group(...varargs) {
    if (!this._group) {
      this._group = this._getSelectToken(...varargs);
    } else {
      this._group = this._group + ", " + this._getSelectToken(...varargs);
    }
    return this;
  }
  groupBy(...varargs) {
    return this.group(...varargs);
  }
  order(...varargs) {
    if (!this._order) {
      this._order = this._getSelectToken(...varargs);
    } else {
      this._order = this._order + ", " + this._getSelectToken(...varargs);
    }
    return this;
  }
  orderBy(...varargs) {
    return this.order(...varargs);
  }
  using(a, ...varargs) {
    this._delete = true;
    this._using = this._getSelectToken(a, ...varargs);
    return this;
  }
  from(a, ...varargs) {
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
  join(joinArgs, key, op, val) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "INNER");
    } else {
      this._baseJoin(joinArgs, key, op, val);
    }
    return this;
  }
  innerJoin(joinArgs, key, op, val) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "INNER");
    } else {
      this._baseJoin(joinArgs, key, op, val);
    }
    return this;
  }
  leftJoin(joinArgs, key, op, val) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "LEFT");
    } else {
      this._baseLeftJoin(joinArgs, key, op, val);
    }
    return this;
  }
  rightJoin(joinArgs, key, op, val) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "RIGHT");
    } else {
      this._baseRightJoin(joinArgs, key, op, val);
    }
    return this;
  }
  fullJoin(joinArgs, key, op, val) {
    if (typeof joinArgs === "object") {
      this._registerJoinModel(joinArgs, "FULL");
    } else {
      this._baseFullJoin(joinArgs, key, op, val);
    }
    return this;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  offset(n) {
    this._offset = n;
    return this;
  }
  where(cond, op, dval) {
    const whereToken = this._getConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  whereOr(cond, op, dval) {
    const whereToken = this._getConditionTokenOr(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhereOr(cond, op, dval) {
    const whereToken = this._getConditionTokenOr(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereNot(cond, op, dval) {
    const whereToken = this._getConditionTokenNot(cond, op, dval);
    return this._handleWhereToken(whereToken, "(%s) AND (%s)");
  }
  orWhere(cond, op, dval) {
    const whereToken = this._getConditionToken(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  orWhereNot(cond, op, dval) {
    const whereToken = this._getConditionTokenNot(cond, op, dval);
    return this._handleWhereToken(whereToken, "%s OR %s");
  }
  whereExists(builder) {
    if (this._where) {
      this._where = `(${this._where}) AND EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  whereNotExists(builder) {
    if (this._where) {
      this._where = `(${this._where}) AND NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  whereIn(cols, range) {
    if (typeof cols === "string") {
      return this._baseWhereIn(this._getColumn(cols), range);
    } else {
      const res = cols.map((e) => this._getColumn(e));
      return this._baseWhereIn(res, range);
    }
  }
  whereNotIn(cols, range) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return this._baseWhereNotIn(cols, range);
  }
  whereNull(col) {
    return this._baseWhereNull(this._getColumn(col));
  }
  whereNotNull(col) {
    return this._baseWhereNotNull(this._getColumn(col));
  }
  whereBetween(col, low, high) {
    return this._baseWhereBetween(this._getColumn(col), low, high);
  }
  whereNotBetween(col, low, high) {
    return this._baseWhereNotBetween(this._getColumn(col), low, high);
  }
  orWhereIn(cols, range) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return this._baseOrWhereIn(cols, range);
  }
  orWhereNotIn(cols, range) {
    if (typeof cols === "string") {
      cols = this._getColumn(cols);
    } else {
      for (let i = 0; i < cols.length; i = i + 1) {
        cols[i] = this._getColumn(cols[i]);
      }
    }
    return this._baseOrWhereNotIn(cols, range);
  }
  orWhereNull(col) {
    return this._baseOrWhereNull(this._getColumn(col));
  }
  orWhereNotNull(col) {
    return this._baseOrWhereNotNull(this._getColumn(col));
  }
  orWhereBetween(col, low, high) {
    return this._baseOrWhereBetween(this._getColumn(col), low, high);
  }
  orWhereNotBetween(col, low, high) {
    return this._baseOrWhereNotBetween(this._getColumn(col), low, high);
  }
  orWhereExists(builder) {
    if (this._where) {
      this._where = `${this._where} OR EXISTS (${builder})`;
    } else {
      this._where = `EXISTS (${builder})`;
    }
    return this;
  }
  orWhereNotExists(builder) {
    if (this._where) {
      this._where = `${this._where} OR NOT EXISTS (${builder})`;
    } else {
      this._where = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  having(cond, op, dval) {
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
  havingNot(cond, op, dval) {
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
  havingExists(builder) {
    if (this._having) {
      this._having = `(${this._having}) AND EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  havingNotExists(builder) {
    if (this._having) {
      this._having = `(${this._having}) AND NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  havingIn(cols, range) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `(${this._having}) AND ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  havingNotIn(cols, range) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._having) {
      this._having = `(${this._having}) AND ${notInToken}`;
    } else {
      this._having = notInToken;
    }
    return this;
  }
  havingNull(col) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  havingNotNull(col) {
    if (this._having) {
      this._having = `(${this._having}) AND ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  havingBetween(col, low, high) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  havingNotBetween(col, low, high) {
    if (this._having) {
      this._having = `(${this._having}) AND (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHaving(cond, op, dval) {
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
  orHavingNot(cond, op, dval) {
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
  orHavingExists(builder) {
    if (this._having) {
      this._having = `${this._having} OR EXISTS (${builder})`;
    } else {
      this._having = `EXISTS (${builder})`;
    }
    return this;
  }
  orHavingNotExists(builder) {
    if (this._having) {
      this._having = `${this._having} OR NOT EXISTS (${builder})`;
    } else {
      this._having = `NOT EXISTS (${builder})`;
    }
    return this;
  }
  orHavingIn(cols, range) {
    const inToken = this._getInToken(cols, range);
    if (this._having) {
      this._having = `${this._having} OR ${inToken}`;
    } else {
      this._having = inToken;
    }
    return this;
  }
  orHavingNotIn(cols, range) {
    const notInToken = this._getInToken(cols, range, "NOT IN");
    if (this._having) {
      this._having = `${this._having} OR ${notInToken}`;
    } else {
      this._having = notInToken;
    }
    return this;
  }
  orHavingNull(col) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NULL`;
    } else {
      this._having = col + " IS NULL";
    }
    return this;
  }
  orHavingNotNull(col) {
    if (this._having) {
      this._having = `${this._having} OR ${col} IS NOT NULL`;
    } else {
      this._having = col + " IS NOT NULL";
    }
    return this;
  }
  orHavingBetween(col, low, high) {
    if (this._having) {
      this._having = `${this._having} OR (${col} BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  orHavingNotBetween(col, low, high) {
    if (this._having) {
      this._having = `${this._having} OR (${col} NOT BETWEEN ${low} AND ${high})`;
    } else {
      this._having = `${col} NOT BETWEEN ${low} AND ${high}`;
    }
    return this;
  }
  async exists() {
    const statement = `SELECT EXISTS (${this.select("").limit(1).statement()})`;
    const res = await this.sqlQuery(statement);
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
  commit(bool) {
    if (bool === undefined) {
      bool = true;
    }
    this._commit = bool;
    return this;
  }
  skipValidate(bool) {
    if (bool === undefined) {
      bool = true;
    }
    this._skipValidate = bool;
    return this;
  }
  async flat(depth) {
    const res = await this.compact().execr();
    return res.flat(depth);
  }
  async get(cond, op, dval) {
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
  async getOrCreate(params, defaults) {
    const records = await this.where(params).limit(2).exec();
    if (records.length === 1) {
      return [records[0], false];
    } else if (records.length === 0) {
      const pk = this.primaryKey;
      const data = { ...params, ...defaults };
      //**
      const res = await this.newSql().insert(data).returning(pk).execr();
      data[pk] = res[0][pk];
      return [this.newRecord(data), true];
    } else {
      throw new Error("expect 1 row returned, but now get " + records.length);
    }
  }
  async asSet() {
    const res = (await this.compact().execr()).flat();
    return new Set(res);
  }
  // async query(statement) {
  //   console.log(statement);
  //   return await this.sqlQuery(statement);
  // }
  async execr() {
    return await this.raw().exec();
  }
  async exec() {
    const statement = this.statement();
    const records = await this.sqlQuery(statement);
    if (this._raw) {
      return records;
    } else if (
      this._select ||
      (!this._update && !this._insert && !this._delete)
    ) {
      if (!this._loadFk) {
        for (const [i, record] of records.entries()) {
          records[i] = this.load(record);
        }
      } else {
        const fields = this.fields;
        const fieldNames = this.fieldNames;
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
          records[i] = this.newRecord(record);
        }
      }
      return records;
    } else {
      return records;
    }
  }
  loadFk(fkName, selectNames, ...varargs) {
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
    return this._baseSelect(fks);
  }
}

export default Model;
