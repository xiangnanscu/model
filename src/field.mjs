import * as Validator from "./validator";
import { Http } from "@/globals/Http";
import { parseSize } from "@/lib/utils.mjs";

const TABLE_MAX_ROWS = 1;
const CHOICES_ERROR_DISPLAY_COUNT = 30;
const ERROR_MESSAGES = { required: "此项必填", choices: "无效选项" };
const NULL = {};
const FK_TYPE_NOT_DEFIEND = {};
const PRIMITIVE_TYPES = {
  string: true,
  number: true,
  boolean: true,
  bigint: true,
};

// const repr = (e) => JSON.stringify(e);
function assert(bool, errMsg) {
  if (!bool) {
    throw new Error(errMsg);
  } else {
    return bool;
  }
}
function getLocalTime(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
}
function cleanChoice(c) {
  let v;
  if (c.value !== undefined) {
    v = c.value;
  } else {
    v = c[0];
  }
  assert(v !== undefined, "you must provide a value for a choice");
  let l;
  if (c.label !== undefined) {
    l = c.label;
  } else if (c[1] !== undefined) {
    l = c[1];
  } else {
    l = v;
  }
  return [v, l, c.hint || c[2]];
}
function getChoices(rawChoices) {
  const choices = [];
  for (let c of rawChoices) {
    if (PRIMITIVE_TYPES[typeof c]) {
      c = { value: c, label: c.toString(), text: c.toString() };
    } else if (typeof c === "object") {
      const [value, label, hint] = cleanChoice(c);
      c = { value, label, hint, text: label };
    } else {
      throw new Error("invalid choice type:" + typeof c);
    }
    choices.push(c);
  }
  return choices;
}
function serializeChoice(choice) {
  return String(choice.value);
}
function getChoicesErrorMessage(choices) {
  const validChoices = choices.map(serializeChoice).join("，");
  return `限下列选项：${validChoices}`;
}
function getChoicesValidator(choices, message) {
  if (choices.length <= CHOICES_ERROR_DISPLAY_COUNT) {
    message = `${message}，${getChoicesErrorMessage(choices)}`;
  }
  const isChoice = [];
  for (const c of choices) {
    isChoice[c.value] = true;
  }
  function choicesValidator(value) {
    if (!isChoice[value]) {
      throw new Error(message);
    } else {
      return value;
    }
  }
  return choicesValidator;
}
const baseOptionNames = [
  "primary_key",
  "null",
  "unique",
  "index",
  "db_type",
  "required",
  "disabled",
  "default",
  "label",
  "hint",
  "error_messages",
  "choices",
  "strict",
  "choices_url",
  "choices_url_admin",
  "choices_url_method",
  "autocomplete",
  "preload",
  "lazy",
  "tag",
  "attrs",
];

class BaseField {
  static getLocalTime = getLocalTime;
  static FK_TYPE_NOT_DEFIEND = FK_TYPE_NOT_DEFIEND;
  __is_field_class__ = true;
  required = false;
  get optionNames() {
    // define as getter so the subclass optionNames can be accessed in super call
    return baseOptionNames;
  }
  static new(options) {
    const self = new this(options);
    self.validators = self.getValidators([]);
    return self;
  }
  constructor(options) {
    Object.assign(this, this.getOptions(options));
    if (this.db_type === undefined) {
      this.db_type = this.type;
    }
    if (this.label === undefined) {
      this.label = this.name;
    }
    if (this.null === undefined) {
      if (!this.required && this.type !== "string") {
        this.null = true;
      } else {
        this.null = false;
      }
    }
    if (Array.isArray(this.choices)) {
      this.choices = getChoices(this.choices);
    }
    if (this.choices && this.strict === undefined) {
      this.strict = true;
    }
    this.error_messages = { ...ERROR_MESSAGES, ...this.error_messages };
    return this;
  }

  getOptions(options) {
    if (!options) {
      options = this;
    }
    const ret = {
      name: options.name,
      type: options.type,
    };
    for (const name of this.optionNames) {
      if (options[name] !== undefined) {
        ret[name] = options[name];
      }
    }
    if (!ret.attrs) {
      ret.attrs = {};
    } else {
      ret.attrs = { ...ret.attrs };
    }
    return ret;
  }
  getValidators(validators) {
    if (this.required) {
      validators.unshift(Validator.required(this.error_messages.required));
    } else {
      validators.unshift(Validator.notRequired);
    }
    if (this.strict) {
      if (this.choices_url) {
        // dynamic choices, need to access this at runtime
        // there's no need to check a disabled field
        !this.disabled &&
          validators.push((val) => {
            for (const { value } of this.choices) {
              if (val === value) {
                return value;
              }
            }
            throw new Error("无效选项, 请通过点击下拉框的形式输入");
          });
      } else if (Array.isArray(this.choices) && this.choices.length && this.type !== "array") {
        // static choices
        validators.push(getChoicesValidator(this.choices, this.error_messages.choices));
      }
    }
    return validators;
  }
  toFormValue(value) {
    // Fields like alioss* need this
    // console.log("base toFormValue");
    return value;
  }
  toPostValue(value) {
    return value;
  }
  getAntdRule() {
    const rule = {
      whitespace: true,
    };
    rule.validator = async (_rule, value) => {
      try {
        return Promise.resolve(this.validate(value));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    return rule;
  }
  json() {
    const json = this.getOptions();
    delete json.error_messages;
    if (typeof json.default === "function") {
      delete json.default;
    }
    if (typeof json.choices === "function") {
      delete json.choices;
    }
    if (!json.tag) {
      if (json.choices && json.choices.length > 0 && !json.autocomplete) {
        json.tag = "select";
      } else {
        json.tag = "input";
      }
    }
    if (json.tag === "input" && json.lazy === undefined) {
      json.lazy = true;
    }
    if (json.preload === undefined && (json.choices_url || json.choices_url_admin)) {
      json.preload = false;
    }
    if (!json.attrs) {
      json.attrs = {};
    }
    return json;
  }
  widgetAttrs(extraAttrs) {
    return { required: this.required, readonly: this.disabled, ...extraAttrs };
  }
  validate(value, ctx) {
    if (typeof value === "function") {
      return value;
    }
    for (const validator of this.validators) {
      try {
        value = validator(value, ctx);
        if (value === undefined) {
          return;
        }
      } catch (error) {
        if (error instanceof Validator.SkipValidateError) {
          return value;
        } else {
          throw error;
        }
      }
    }
    return value;
  }
  getDefault(ctx) {
    if (typeof this.default !== "function") {
      return this.default;
    } else {
      return this.default(ctx);
    }
  }
  choicesCallback(choice) {
    if (PRIMITIVE_TYPES[typeof choice]) {
      return { value: choice, label: String(choice) };
    } else if (typeof choice == "object") {
      return { value: choice.value, label: choice.label, hint: choice.hint };
    } else {
      return { value: String(choice), label: String(choice) };
    }
  }
}
function getMaxChoiceLength(choices) {
  let n = 0;
  for (const c of choices) {
    const value = c.value;
    const n1 = value.length;
    if (n1 > n) {
      n = n1;
    }
  }
  return n;
}
const stringOptionNames = [...baseOptionNames, "compact", "trim", "pattern", "length", "minlength", "maxlength", "input_type"];
const stringValidatorNames = ["pattern", "length", "minlength", "maxlength"];
class StringField extends BaseField {
  type = "string";
  db_type = "varchar";
  compact = true;
  trim = true;
  get optionNames() {
    return stringOptionNames;
  }
  constructor(options) {
    if (!options.choices && !options.length && !options.maxlength) {
      throw new Error(`field ${options.name} must define maxlength or choices or length`);
    }
    super(options);
    if (this.compact === undefined) {
      this.compact = true;
    }
    if (this.default === undefined && !this.primary_key && !this.unique) {
      this.default = "";
    }
    if (Array.isArray(this.choices) && this.choices.length > 0) {
      const n = getMaxChoiceLength(this.choices);
      assert(n > 0, "invalid string choices(empty choices or zero length value):" + this.name);
      const m = this.length || this.maxlength;
      if (!m || n > m) {
        this.maxlength = n;
      }
    }
    return this;
  }
  getValidators(validators) {
    for (const e of stringValidatorNames) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
    if (this.compact) {
      validators.unshift(Validator.deleteSpaces);
    } else if (this.trim) {
      validators.unshift(Validator.trim);
    }
    validators.unshift(Validator.string);
    return super.getValidators(validators);
  }
  widgetAttrs(extraAttrs) {
    const attrs = { minlength: this.minlength };
    return { ...super.widgetAttrs(), ...attrs, ...extraAttrs };
  }
  toFormValue(value) {
    if (!value) {
      return "";
    }
    return typeof value == "string" ? value : String(value);
  }
  toPostValue(value) {
    return this.compact ? value?.replace(/\s/g, "") : value || "";
  }
}

const textOptionNames = [...baseOptionNames];
class TextField extends BaseField {
  type = "text";
  db_type = "text";
  constructor(options) {
    super(options);
    if (!this.attrs.autoSize) {
      this.attrs.autoSize = true;
    }
    return this;
  }
  get optionNames() {
    return textOptionNames;
  }
}

class SfzhField extends StringField {
  type = "sfzh";
  db_type = "varchar";
  constructor(options) {
    super({ ...options, length: 18 });
    return this;
  }
  getValidators(validators) {
    validators.unshift(Validator.sfzh);
    return super.getValidators(validators);
  }
}

class EmailField extends StringField {
  type = "email";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    return this;
  }
}

class PasswordField extends StringField {
  type = "password";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    return this;
  }
}

class YearMonthField extends StringField {
  type = "yearMonth";
  db_type = "varchar";
  constructor(options) {
    super({ length: 7, ...options });
    return this;
  }
  getValidators(validators) {
    validators.unshift(Validator.yearMonth);
    return super.getValidators(validators);
  }
}

const integerOptionNames = [...baseOptionNames, "min", "max", "step", "serial"];
const intergerValidatorNames = ["min", "max"];
class IntegerField extends BaseField {
  type = "integer";
  db_type = "integer";
  get optionNames() {
    return integerOptionNames;
  }
  addMinOrMaxValidators(validators) {
    for (const e of intergerValidatorNames) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
  }
  getValidators(validators) {
    this.addMinOrMaxValidators(validators);
    validators.unshift(Validator.integer);
    return super.getValidators(validators);
  }
  json() {
    const json = super.json();
    if (json.primary_key && json.disabled === undefined) {
      json.disabled = true;
    }
    return json;
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

class YearField extends IntegerField {
  type = "year";
  db_type = "integer";
  constructor(options) {
    super({ min: 1000, max: 9999, ...options });
    return this;
  }
}
class MonthField extends IntegerField {
  type = "month";
  db_type = "integer";
  constructor(options) {
    super({ min: 1, max: 12, ...options });
    return this;
  }
}

const floatValidatorNames = ["min", "max"];
const floatOptionNames = [...baseOptionNames, "min", "max", "step", "precision"];
class FloatField extends BaseField {
  type = "float";
  db_type = "float";
  get optionNames() {
    return floatOptionNames;
  }
  addMinOrMaxValidators(validators) {
    for (const e of floatValidatorNames) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
  }

  getValidators(validators) {
    this.addMinOrMaxValidators(validators);
    validators.unshift(Validator.number);
    return super.getValidators(validators);
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

const DEFAULT_BOOLEAN_CHOICES = [
  { label: "是", value: "true", text: "是" },
  { label: "否", value: "false", text: "否" },
];
const booleanOptionNames = [...baseOptionNames, "cn"];
class BooleanField extends BaseField {
  type = "boolean";
  db_type = "boolean";
  get optionNames() {
    return booleanOptionNames;
  }
  constructor(options) {
    super(options);
    if (this.choices === undefined) {
      this.choices = DEFAULT_BOOLEAN_CHOICES;
    }
    return this;
  }

  getValidators(validators) {
    if (this.cn) {
      validators.unshift(Validator.booleanCn);
    } else {
      validators.unshift(Validator.boolean);
    }
    return super.getValidators(validators);
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

const jsonOptionNames = [...baseOptionNames];
class JsonField extends BaseField {
  type = "json";
  db_type = "jsonb";
  get optionNames() {
    return jsonOptionNames;
  }
  json() {
    const json = super.json();
    json.tag = "textarea";
    return json;
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return Validator.encode(value);
    }
  }
}
function skipValidateWhenString(v) {
  if (typeof v === "string") {
    throw new Validator.SkipValidateError();
  } else {
    return v;
  }
}
function checkArrayType(v) {
  if (!(v instanceof Array)) {
    throw new Error("value of array field must be a array");
  } else {
    return v;
  }
}
function nonEmptyArrayRequired(message) {
  message = message || "此项必填";
  function arrayValidator(v) {
    if (v.length === 0) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return arrayValidator;
}
const arrayOptionNames = [...baseOptionNames, "array_type", "min", "max", "maxlength", "minlength"];
class BaseArrayField extends JsonField {
  get optionNames() {
    return arrayOptionNames;
  }
  getValidators(validators) {
    if (this.required) {
      validators.unshift(nonEmptyArrayRequired(this.error_messages.required));
    }
    validators.unshift(checkArrayType);
    validators.unshift(skipValidateWhenString);
    return super.getValidators(validators);
  }
  getEmptyValueToUpdate() {
    return [];
  }
  toFormValue(value) {
    if (Array.isArray(value)) {
      // 拷贝, 避免弹出表格修改了值但没有提交
      return [...value];
    } else {
      return [];
    }
  }
}
class ArrayField extends BaseArrayField {
  type = "array";
  db_type = "jsonb";
  constructor(options) {
    super(options);
    const maps = {
      BaseField,
      StringField,
      EmailField,
      PasswordField,
      YearMonthField,
      YearField,
      MonthField,
      TextField,
      IntegerField,
      FloatField,
      DatetimeField,
      DateField,
      TimeField,
      JsonField,
      // ArrayField,
      // TableField,
      ForeignkeyField,
      BooleanField,
      AliossField,
      AliossImageField,
      // AliossListField,
      // AliossImageListField,
      SfzhField,
    };
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const cls = maps[`${capitalize(this.array_type || "string")}Field`];
    this.array_field = cls.new(options);
  }
  getValidators(validators) {
    validators.unshift((v) =>
      v.map((e) => {
        return this.array_field.validate(e);
      })
    );
    return super.getValidators(validators);
  }
}
function makeEmptyArray() {
  return [];
}

const tableOptionNames = [...baseOptionNames, "model", "max_rows", "uploadable", "columns"];
class TableField extends BaseArrayField {
  type = "table";
  max_rows = TABLE_MAX_ROWS;
  get optionNames() {
    return tableOptionNames;
  }
  constructor(options) {
    super(options);
    if (!this.model?.__isModelClass__) {
      throw new Error("please define model for a table field: " + this.name);
    }
    if (!this.default || this.default === "") {
      this.default = makeEmptyArray;
    }
    if (!this.model.table_name) {
      this.model.materializeWithTableName({
        table_name: this.name,
        label: this.label,
      });
    }
    return this;
  }
  getValidators(validators) {
    const model = this.model;
    function validateByEachField(rows) {
      for (let [i, row] of rows.entries()) {
        assert(typeof row === "object", "elements of table field must be object");
        try {
          row = model.validateCreate(row);
        } catch (err) {
          err.index = i;
          throw err;
        }
        rows[i] = row;
      }
      return rows;
    }
    validators.unshift(validateByEachField);
    return super.getValidators(validators);
  }
  json() {
    const ret = super.json();
    const model = { field_names: [], fields: {} };
    for (const name of this.model.field_names) {
      const field = this.model.fields[name];
      model.field_names.push(name);
      model.fields[name] = field.json();
    }
    ret.model = model;
    return ret;
  }
  load(rows) {
    if (!(rows instanceof Array)) {
      throw new Error("value of table field must be table, not " + typeof rows);
    }
    for (let i = 0; i < rows.length; i = i + 1) {
      rows[i] = this.model.load(rows[i]);
    }
    return rows;
  }
}

const datetimeOptionNames = [...baseOptionNames, "auto_now_add", "auto_now", "precision", "timezone"];
class DatetimeField extends BaseField {
  type = "datetime";
  db_type = "timestamp";
  precision = 0;
  timezone = true;
  get optionNames() {
    return datetimeOptionNames;
  }
  constructor(options) {
    super(options);
    if (this.auto_now_add) {
      this.default = getLocalTime;
    }
    return this;
  }

  getValidators(validators) {
    validators.unshift(Validator.datetime);
    return super.getValidators(validators);
  }
  json() {
    const ret = super.json();
    if (ret.disabled === undefined && (ret.auto_now || ret.auto_now_add)) {
      ret.disabled = true;
    }
    return ret;
  }
  prepareForDb(value) {
    if (this.auto_now) {
      return getLocalTime();
    } else if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

const dateOptionNames = [...baseOptionNames];
class DateField extends BaseField {
  type = "date";
  db_type = "date";
  get optionNames() {
    return dateOptionNames;
  }
  getValidators(validators) {
    validators.unshift(Validator.date);
    return super.getValidators(validators);
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}
const timeOptionNames = [...baseOptionNames, "precision", "timezone"];
class TimeField extends BaseField {
  type = "time";
  db_type = "time";
  precision = 0;
  timezone = true;
  get optionNames() {
    return timeOptionNames;
  }
  getValidators(validators) {
    validators.unshift(Validator.time);
    return super.getValidators(validators);
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}
const VALID_FOREIGN_KEY_TYPES = {
  foreignkey: String,
  string: String,
  sfzh: String,
  integer: Validator.integer,
  float: Number,
  datetime: Validator.datetime,
  date: Validator.date,
  time: Validator.time,
};
const foreignkeyOptionNames = [
  ...baseOptionNames,
  "reference",
  "reference_column",
  "reference_label_column",
  "reference_url",
  "reference_url_admin",
  "admin_url_name",
  "modelUrlName",
  "keyword_query_name",
  "limit_query_name",
  "autocomplete",
  "table_name",
];
class ForeignkeyField extends BaseField {
  type = "foreignkey";
  admin_url_name = "admin";
  models_url_name = "model";
  convert = String;
  get optionNames() {
    return foreignkeyOptionNames;
  }
  constructor(options) {
    super({ db_type: FK_TYPE_NOT_DEFIEND, ...options });
    const fkModel = this.reference;
    if (fkModel === "self") {
      return this;
    }
    assert(fkModel.__isModelClass__, `a foreignkey must define reference model. not ${fkModel}(type: ${typeof fkModel})`);
    const rc = this.reference_column || fkModel.primary_key || "id";
    const fk = fkModel.fields[rc];
    assert(fk, `invalid foreignkey name ${rc} for foreign model ${fkModel.table_name || "[TABLE NAME NOT DEFINED YET]"}`);
    this.reference_column = rc;
    const rlc = this.reference_label_column || this.reference_column;
    assert(fkModel.fields[rlc], `invalid foreignkey label name ${rlc} for foreign model ${fkModel.table_name || "[TABLE NAME NOT DEFINED YET]"}`);
    this.reference_label_column = rlc;
    this.convert = assert(VALID_FOREIGN_KEY_TYPES[fk.type], `invalid foreignkey (name:${fk.name}, type:${fk.type})`);
    assert(fk.primary_key || fk.unique, "foreignkey must be a primary key or unique key");
    if (this.db_type === FK_TYPE_NOT_DEFIEND) {
      this.db_type = fk.db_type || fk.type;
    }
    return this;
  }

  getValidators(validators) {
    const fkName = this.reference_column;
    const foreignkeyValidator = (v) => {
      if (typeof v === "object") {
        v = v[fkName];
      }
      try {
        v = this.convert(v);
      } catch (error) {
        throw new Error("error when converting foreign key:" + error.message);
      }
      return v;
    };
    validators.unshift(foreignkeyValidator);
    return super.getValidators(validators);
  }
  toFormValue(value) {
    if (typeof value == "object") {
      return value[this.reference_column];
    } else {
      return value;
    }
  }
  load(value) {
    //** todo 用Proxy改写
    const fkName = this.reference_column;
    const fkModel = this.reference;
    // function __index(t, key) {
    //   if (fkModel[key]) {
    //     return fkModel[key];
    //   } else if (fkModel.fields[key]) {
    //     let pk = rawget(t, fkName);
    //     if (!pk) {
    //       return undefined;
    //     }
    //     let res = fkModel.get({ [fkName]: pk });
    //     if (!res) {
    //       return undefined;
    //     }
    //     for (let [k, v] of Object.entries(res)) {
    //       rawset(t, k, v);
    //     }
    //     fkModel(t);
    //     return t[key];
    //   } else {
    //     return undefined;
    //   }
    // }
    // return setmetatable({ [fkName]: value }, { __index: __index });
    return fkModel.newRecord({ [fkName]: value });
  }
  prepareForDb(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
  json() {
    const ret = super.json();
    ret.reference = this.reference.table_name;
    ret.autocomplete = true;
    if (ret.keyword_query_name === undefined) {
      ret.keyword_query_name = "keyword";
    }
    if (ret.limit_query_name === undefined) {
      ret.limit_query_name = "limit";
    }
    if (ret.choices_url === undefined) {
      ret.choices_url = `/${ret.admin_url_name}/${ret.models_url_name}/${ret.table_name}/fk/${ret.name}/${ret.reference_label_column}`;
    }
    return ret;
  }
}

const ALIOSS_BUCKET = process.env.ALIOSS_BUCKET || "";
const ALIOSS_REGION = process.env.ALIOSS_REGION || "";
const ALIOSS_SIZE = process.env.ALIOSS_SIZE || "1MB";
const ALIOSS_LIFETIME = Number(process.env.ALIOSS_LIFETIME) || 30;

const aliossOptionNames = [
  ...baseOptionNames,
  "size",
  "policy",
  "size_arg",
  "times",
  "payload",
  "payload_url",
  "upload_url",
  "media_type",
  "input_type",
  "image",
  "maxlength",
  "width",
  "prefix",
  "hash",
  "limit",
];
const mapToAntdFileValue = (url = "") => {
  const name = url.split("/").pop();
  return typeof url == "object"
    ? url
    : {
        name,
        status: "done",
        url: url,
        extname: name.split(".")[1], // uni
        ossUrl: url,
      };
};
class AliossField extends StringField {
  type = "alioss";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    const size = options.size || ALIOSS_SIZE;
    this.size_arg = size;
    this.size = parseSize(size);
    this.lifetime = options.lifetime || ALIOSS_LIFETIME;
    this.upload_url = process.env.ALIOSS_URL;
    return this;
  }
  get optionNames() {
    return aliossOptionNames;
  }
  async getPayload(options) {
    const { data } = await Http.post(this.payload_url, {
      ...options,
      size: options.size || this.size,
      lifetime: options.lifetime || this.lifetime,
    });
    return data;
  }
  getValidators(validators) {
    // validators.unshift(Validator.url);
    // return super.getValidators(validators);
    return [];
  }
  getOptions(options) {
    const json = super.getOptions(options);
    if (json.size_arg) {
      json.size = json.size_arg;
      delete json.size_arg;
    }
    return json;
  }
  toFormValue(url) {
    // console.log("call AliossField.toFormValue", JSON.stringify(url));
    if (this.attrs?.wxAvatar) {
      return url || "";
    }
    if (typeof url == "string") {
      return url ? [mapToAntdFileValue(url)] : [];
    } else if (Array.isArray(url)) {
      return [...url];
    } else {
      return [];
    }
  }
  toPostValue(fileList) {
    if (this.attrs?.wxAvatar) {
      return fileList;
    } else if (!Array.isArray(fileList) || !fileList[0]) {
      return "";
    } else {
      return fileList[0].ossUrl || "";
    }
  }
  json() {
    const ret = super.json();
    if (ret.input_type === undefined) {
      ret.input_type = "file";
    }
    return ret;
  }
}

class AliossImageField extends AliossField {
  type = "aliossImage";
  db_type = "varchar";
}
class AliossListField extends AliossField {
  type = "aliossList";
  db_type = "jsonb";
  getValidators(validators) {
    return BaseArrayField.prototype.getValidators.call(this, validators);
  }
  getEmptyValueToUpdate() {
    return [];
  }
  getOptions(options) {
    return {
      ...BaseArrayField.prototype.getOptions.call(this, options),
      ...AliossField.prototype.getOptions.call(this, options),
      type: this.type,
      db_type: "jsonb",
    };
  }
  json() {
    return {
      ...BaseArrayField.prototype.json.call(this),
      ...AliossField.prototype.json.call(this),
    };
  }
  toFormValue(urls) {
    // console.log("call toFormValue2", JSON.stringify(urls));
    if (Array.isArray(urls)) {
      return urls.map(mapToAntdFileValue);
    } else {
      return [];
    }
  }
  toPostValue(fileList) {
    if (!Array.isArray(fileList) || !fileList[0]) {
      return [];
    } else {
      return fileList.map((e) => e.ossUrl);
    }
  }
}

class AliossImageListField extends AliossListField {
  type = "aliossImageList";
  db_type = "jsonb";
  constructor(options) {
    super(options);
    this.image = true;
  }
  getOptions(options) {
    return {
      ...super.getOptions(options),
      type: "aliossImageList",
    };
  }
}
export {
  getChoices,
  BaseField,
  StringField,
  EmailField,
  PasswordField,
  YearMonthField,
  YearField,
  MonthField,
  TextField,
  IntegerField,
  FloatField,
  DatetimeField,
  DateField,
  TimeField,
  JsonField,
  ArrayField,
  TableField,
  ForeignkeyField,
  BooleanField,
  AliossField,
  AliossImageField,
  AliossListField,
  AliossImageListField,
  SfzhField,
};
