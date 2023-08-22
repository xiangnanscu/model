import * as Validator from "./validator";
import { Http } from "@/globals/Http";
import { parse_size } from "@/lib/utils.mjs";

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
function assert(bool, err_msg) {
  if (!bool) {
    throw new Error(err_msg);
  } else {
    return bool;
  }
}
function get_localtime(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
}
function clean_choice(c) {
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
function get_choices(raw_choices) {
  const choices = [];
  for (let c of raw_choices) {
    if (PRIMITIVE_TYPES[typeof c]) {
      c = { value: c, label: c.to_string(), text: c.to_string() };
    } else if (typeof c === "object") {
      const [value, label, hint] = clean_choice(c);
      c = { value, label, hint, text: label };
    } else {
      throw new Error("invalid choice type:" + typeof c);
    }
    choices.push(c);
  }
  return choices;
}
function serialize_choice(choice) {
  return String(choice.value);
}
function get_choices_error_message(choices) {
  const valid_choices = choices.map(serialize_choice).join("，");
  return `限下列选项：${valid_choices}`;
}
function get_choices_validator(choices, message) {
  if (choices.length <= CHOICES_ERROR_DISPLAY_COUNT) {
    message = `${message}，${get_choices_error_message(choices)}`;
  }
  const is_choice = [];
  for (const c of choices) {
    is_choice[c.value] = true;
  }
  function choices_validator(value) {
    if (!is_choice[value]) {
      throw new Error(message);
    } else {
      return value;
    }
  }
  return choices_validator;
}
const base_option_names = [
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

class Base_field {
  static get_localtime = get_localtime;
  static FK_TYPE_NOT_DEFIEND = FK_TYPE_NOT_DEFIEND;
  __is_field_class__ = true;
  required = false;
  get option_names() {
    // define as getter so the subclass option_names can be accessed in super call
    return base_option_names;
  }
  static new(options) {
    const self = new this(options);
    self.validators = self.get_validators([]);
    return self;
  }
  constructor(options) {
    Object.assign(this, this.get_options(options));
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
    if (Array.is_array(this.choices)) {
      this.choices = get_choices(this.choices);
    }
    if (this.choices && this.strict === undefined) {
      this.strict = true;
    }
    this.error_messages = { ...ERROR_MESSAGES, ...this.error_messages };
    return this;
  }

  get_options(options) {
    if (!options) {
      options = this;
    }
    const ret = {
      name: options.name,
      type: options.type,
    };
    for (const name of this.option_names) {
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
  get_validators(validators) {
    if (this.required) {
      validators.unshift(Validator.required(this.error_messages.required));
    } else {
      validators.unshift(Validator.not_required);
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
      } else if (Array.is_array(this.choices) && this.choices.length && this.type !== "array") {
        // static choices
        validators.push(get_choices_validator(this.choices, this.error_messages.choices));
      }
    }
    return validators;
  }
  to_form_value(value) {
    // Fields like alioss* need this
    // console.log("base to_form_value");
    return value;
  }
  to_post_value(value) {
    return value;
  }
  get_antd_rule() {
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
    const json = this.get_options();
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
  widget_attrs(extra_attrs) {
    return { required: this.required, readonly: this.disabled, ...extra_attrs };
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
        if (error instanceof Validator.Skip_validate_error) {
          return value;
        } else {
          throw error;
        }
      }
    }
    return value;
  }
  get_default(ctx) {
    if (typeof this.default !== "function") {
      return this.default;
    } else {
      return this.default(ctx);
    }
  }
  choices_callback(choice) {
    if (PRIMITIVE_TYPES[typeof choice]) {
      return { value: choice, label: String(choice) };
    } else if (typeof choice == "object") {
      return { value: choice.value, label: choice.label, hint: choice.hint };
    } else {
      return { value: String(choice), label: String(choice) };
    }
  }
}
function get_max_choice_length(choices) {
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
const string_option_names = [
  ...base_option_names,
  "compact",
  "trim",
  "pattern",
  "length",
  "minlength",
  "maxlength",
  "input_type",
];
const string_validator_names = ["pattern", "length", "minlength", "maxlength"];
class String_field extends Base_field {
  type = "string";
  db_type = "varchar";
  compact = true;
  trim = true;
  get option_names() {
    return string_option_names;
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
    if (Array.is_array(this.choices) && this.choices.length > 0) {
      const n = get_max_choice_length(this.choices);
      assert(n > 0, "invalid string choices(empty choices or zero length value):" + this.name);
      const m = this.length || this.maxlength;
      if (!m || n > m) {
        this.maxlength = n;
      }
    }
    return this;
  }
  get_validators(validators) {
    for (const e of string_validator_names) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
    if (this.compact) {
      validators.unshift(Validator.delete_spaces);
    } else if (this.trim) {
      validators.unshift(Validator.trim);
    }
    validators.unshift(Validator.string);
    return super.get_validators(validators);
  }
  widget_attrs(extra_attrs) {
    const attrs = { minlength: this.minlength };
    return { ...super.widget_attrs(), ...attrs, ...extra_attrs };
  }
  to_form_value(value) {
    if (!value) {
      return "";
    }
    return typeof value == "string" ? value : String(value);
  }
  to_post_value(value) {
    return this.compact ? value?.replace(/\s/g, "") : value || "";
  }
}

const text_option_names = [...base_option_names];
class Text_field extends Base_field {
  type = "text";
  db_type = "text";
  constructor(options) {
    super(options);
    if (!this.attrs.auto_size) {
      this.attrs.auto_size = true;
    }
    return this;
  }
  get option_names() {
    return text_option_names;
  }
}

class Sfzh_field extends String_field {
  type = "sfzh";
  db_type = "varchar";
  constructor(options) {
    super({ ...options, length: 18 });
    return this;
  }
  get_validators(validators) {
    validators.unshift(Validator.sfzh);
    return super.get_validators(validators);
  }
}

class Email_field extends String_field {
  type = "email";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    return this;
  }
}

class Password_field extends String_field {
  type = "password";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    return this;
  }
}

class Year_month_field extends String_field {
  type = "year_month";
  db_type = "varchar";
  constructor(options) {
    super({ length: 7, ...options });
    return this;
  }
  get_validators(validators) {
    validators.unshift(Validator.year_month);
    return super.get_validators(validators);
  }
}

const integer_option_names = [...base_option_names, "min", "max", "step", "serial"];
const interger_validator_names = ["min", "max"];
class Integer_field extends Base_field {
  type = "integer";
  db_type = "integer";
  get option_names() {
    return integer_option_names;
  }
  add_min_or_max_validators(validators) {
    for (const e of interger_validator_names) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
  }
  get_validators(validators) {
    this.add_min_or_max_validators(validators);
    validators.unshift(Validator.integer);
    return super.get_validators(validators);
  }
  json() {
    const json = super.json();
    if (json.primary_key && json.disabled === undefined) {
      json.disabled = true;
    }
    return json;
  }
  prepare_for_db(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

class Year_field extends Integer_field {
  type = "year";
  db_type = "integer";
  constructor(options) {
    super({ min: 1000, max: 9999, ...options });
    return this;
  }
}
class Month_field extends Integer_field {
  type = "month";
  db_type = "integer";
  constructor(options) {
    super({ min: 1, max: 12, ...options });
    return this;
  }
}

const float_validator_names = ["min", "max"];
const float_option_names = [...base_option_names, "min", "max", "step", "precision"];
class Float_field extends Base_field {
  type = "float";
  db_type = "float";
  get option_names() {
    return float_option_names;
  }
  add_min_or_max_validators(validators) {
    for (const e of float_validator_names) {
      if (this[e]) {
        validators.unshift(Validator[e](this[e], this.error_messages[e]));
      }
    }
  }

  get_validators(validators) {
    this.add_min_or_max_validators(validators);
    validators.unshift(Validator.number);
    return super.get_validators(validators);
  }
  prepare_for_db(value) {
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
const boolean_option_names = [...base_option_names, "cn"];
class Boolean_field extends Base_field {
  type = "boolean";
  db_type = "boolean";
  get option_names() {
    return boolean_option_names;
  }
  constructor(options) {
    super(options);
    if (this.choices === undefined) {
      this.choices = DEFAULT_BOOLEAN_CHOICES;
    }
    return this;
  }

  get_validators(validators) {
    if (this.cn) {
      validators.unshift(Validator.boolean_cn);
    } else {
      validators.unshift(Validator.boolean);
    }
    return super.get_validators(validators);
  }
  prepare_for_db(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

const json_option_names = [...base_option_names];
class Json_field extends Base_field {
  type = "json";
  db_type = "jsonb";
  get option_names() {
    return json_option_names;
  }
  json() {
    const json = super.json();
    json.tag = "textarea";
    return json;
  }
  prepare_for_db(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return Validator.encode(value);
    }
  }
}
function skip_validate_when_string(v) {
  if (typeof v === "string") {
    throw new Validator.Skip_validate_error();
  } else {
    return v;
  }
}
function check_array_type(v) {
  if (!(v instanceof Array)) {
    throw new Error("value of array field must be a array");
  } else {
    return v;
  }
}
function non_empty_array_required(message) {
  message = message || "此项必填";
  function array_validator(v) {
    if (v.length === 0) {
      throw new Error(message);
    } else {
      return v;
    }
  }
  return array_validator;
}
const array_option_names = [...base_option_names, "array_type", "min", "max", "maxlength", "minlength"];
class Base_array_field extends Json_field {
  get option_names() {
    return array_option_names;
  }
  get_validators(validators) {
    if (this.required) {
      validators.unshift(non_empty_array_required(this.error_messages.required));
    }
    validators.unshift(check_array_type);
    validators.unshift(skip_validate_when_string);
    return super.get_validators(validators);
  }
  get_empty_value_to_update() {
    return [];
  }
  to_form_value(value) {
    if (Array.is_array(value)) {
      // 拷贝, 避免弹出表格修改了值但没有提交
      return [...value];
    } else {
      return [];
    }
  }
}
class Array_field extends Base_array_field {
  type = "array";
  db_type = "jsonb";
  constructor(options) {
    super(options);
    const maps = {
      Base_field,
      String_field,
      Email_field,
      Password_field,
      Year_month_field,
      Year_field,
      Month_field,
      Text_field,
      Integer_field,
      Float_field,
      Datetime_field,
      Date_field,
      Time_field,
      Json_field,
      // Array_field,
      // Table_field,
      Foreignkey_field,
      Boolean_field,
      Alioss_field,
      Alioss_image_field,
      // Alioss_list_field,
      // Alioss_image_list_field,
      Sfzh_field,
    };
    const capitalize = (s) => s.char_at(0).to_upper_case() + s.slice(1);
    const cls = maps[`${capitalize(this.array_type || "string")}Field`];
    this.array_field = cls.new(options);
  }
  get_validators(validators) {
    validators.unshift((v) =>
      v.map((e) => {
        return this.array_field.validate(e);
      })
    );
    return super.get_validators(validators);
  }
}
function make_empty_array() {
  return [];
}

const table_option_names = [...base_option_names, "model", "max_rows", "uploadable", "columns"];
class Table_field extends Base_array_field {
  type = "table";
  max_rows = TABLE_MAX_ROWS;
  get option_names() {
    return table_option_names;
  }
  constructor(options) {
    super(options);
    if (!this.model?.__is_model_class__) {
      throw new Error("please define model for a table field: " + this.name);
    }
    if (!this.default || this.default === "") {
      this.default = make_empty_array;
    }
    if (!this.model.table_name) {
      this.model.materialize_with_table_name({
        table_name: this.name,
        label: this.label,
      });
    }
    return this;
  }
  get_validators(validators) {
    const model = this.model;
    function validate_by_each_field(rows) {
      for (let [i, row] of rows.entries()) {
        assert(typeof row === "object", "elements of table field must be object");
        try {
          row = model.validate_create(row);
        } catch (err) {
          err.index = i;
          throw err;
        }
        rows[i] = row;
      }
      return rows;
    }
    validators.unshift(validate_by_each_field);
    return super.get_validators(validators);
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

const datetime_option_names = [...base_option_names, "auto_now_add", "auto_now", "precision", "timezone"];
class Datetime_field extends Base_field {
  type = "datetime";
  db_type = "timestamp";
  precision = 0;
  timezone = true;
  get option_names() {
    return datetime_option_names;
  }
  constructor(options) {
    super(options);
    if (this.auto_now_add) {
      this.default = get_localtime;
    }
    return this;
  }

  get_validators(validators) {
    validators.unshift(Validator.datetime);
    return super.get_validators(validators);
  }
  json() {
    const ret = super.json();
    if (ret.disabled === undefined && (ret.auto_now || ret.auto_now_add)) {
      ret.disabled = true;
    }
    return ret;
  }
  prepare_for_db(value) {
    if (this.auto_now) {
      return get_localtime();
    } else if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}

const date_option_names = [...base_option_names];
class Date_field extends Base_field {
  type = "date";
  db_type = "date";
  get option_names() {
    return date_option_names;
  }
  get_validators(validators) {
    validators.unshift(Validator.date);
    return super.get_validators(validators);
  }
  prepare_for_db(value) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  }
}
const time_option_names = [...base_option_names, "precision", "timezone"];
class Time_field extends Base_field {
  type = "time";
  db_type = "time";
  precision = 0;
  timezone = true;
  get option_names() {
    return time_option_names;
  }
  get_validators(validators) {
    validators.unshift(Validator.time);
    return super.get_validators(validators);
  }
  prepare_for_db(value) {
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
const foreignkey_option_names = [
  ...base_option_names,
  "reference",
  "reference_column",
  "reference_label_column",
  "reference_url",
  "reference_url_admin",
  "admin_url_name",
  "model_url_name",
  "keyword_query_name",
  "limit_query_name",
  "autocomplete",
  "table_name",
];
class Foreignkey_field extends Base_field {
  type = "foreignkey";
  admin_url_name = "admin";
  models_url_name = "model";
  convert = String;
  get option_names() {
    return foreignkey_option_names;
  }
  constructor(options) {
    super({ db_type: FK_TYPE_NOT_DEFIEND, ...options });
    const fk_model = this.reference;
    if (fk_model === "self") {
      return this;
    }
    assert(
      fk_model.__is_model_class__,
      `a foreignkey must define reference model. not ${fk_model}(type: ${typeof fk_model})`
    );
    const rc = this.reference_column || fk_model.primary_key || "id";
    const fk = fk_model.fields[rc];
    assert(
      fk,
      `invalid foreignkey name ${rc} for foreign model ${fk_model.table_name || "[TABLE NAME NOT DEFINED YET]"}`
    );
    this.reference_column = rc;
    const rlc = this.reference_label_column || this.reference_column;
    assert(
      fk_model.fields[rlc],
      `invalid foreignkey label name ${rlc} for foreign model ${fk_model.table_name || "[TABLE NAME NOT DEFINED YET]"}`
    );
    this.reference_label_column = rlc;
    this.convert = assert(VALID_FOREIGN_KEY_TYPES[fk.type], `invalid foreignkey (name:${fk.name}, type:${fk.type})`);
    assert(fk.primary_key || fk.unique, "foreignkey must be a primary key or unique key");
    if (this.db_type === FK_TYPE_NOT_DEFIEND) {
      this.db_type = fk.db_type || fk.type;
    }
    return this;
  }

  get_validators(validators) {
    const fk_name = this.reference_column;
    const foreignkey_validator = (v) => {
      if (typeof v === "object") {
        v = v[fk_name];
      }
      try {
        v = this.convert(v);
      } catch (error) {
        throw new Error("error when converting foreign key:" + error.message);
      }
      return v;
    };
    validators.unshift(foreignkey_validator);
    return super.get_validators(validators);
  }
  to_form_value(value) {
    if (typeof value == "object") {
      return value[this.reference_column];
    } else {
      return value;
    }
  }
  load(value) {
    //** todo 用Proxy改写
    const fk_name = this.reference_column;
    const fk_model = this.reference;
    // function __index(t, key) {
    //   if (fk_model[key]) {
    //     return fk_model[key];
    //   } else if (fk_model.fields[key]) {
    //     let pk = rawget(t, fk_name);
    //     if (!pk) {
    //       return undefined;
    //     }
    //     let res = fk_model.get({ [fk_name]: pk });
    //     if (!res) {
    //       return undefined;
    //     }
    //     for (let [k, v] of Object.entries(res)) {
    //       rawset(t, k, v);
    //     }
    //     fk_model(t);
    //     return t[key];
    //   } else {
    //     return undefined;
    //   }
    // }
    // return setmetatable({ [fk_name]: value }, { __index: __index });
    return fk_model.new_record({ [fk_name]: value });
  }
  prepare_for_db(value) {
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

const alioss_option_names = [
  ...base_option_names,
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
const map_to_antd_file_value = (url = "") => {
  const name = url.split("/").pop();
  return typeof url == "object"
    ? url
    : {
        name,
        status: "done",
        url: url,
        extname: name.split(".")[1], // uni
        oss_url: url,
      };
};
class Alioss_field extends String_field {
  type = "alioss";
  db_type = "varchar";
  constructor(options) {
    super({ maxlength: 255, ...options });
    const size = options.size || ALIOSS_SIZE;
    this.size_arg = size;
    this.size = parse_size(size);
    this.lifetime = options.lifetime || ALIOSS_LIFETIME;
    this.upload_url = process.env.ALIOSS_URL;
    return this;
  }
  get option_names() {
    return alioss_option_names;
  }
  async get_payload(options) {
    const { data } = await Http.post(this.payload_url, {
      ...options,
      size: options.size || this.size,
      lifetime: options.lifetime || this.lifetime,
    });
    return data;
  }
  get_validators(validators) {
    // validators.unshift(Validator.url);
    // return super.get_validators(validators);
    return [];
  }
  get_options(options) {
    const json = super.get_options(options);
    if (json.size_arg) {
      json.size = json.size_arg;
      delete json.size_arg;
    }
    return json;
  }
  to_form_value(url) {
    // console.log("call Alioss_field.to_form_value", JSON.stringify(url));
    if (this.attrs?.wx_avatar) {
      return url || "";
    }
    if (typeof url == "string") {
      return url ? [map_to_antd_file_value(url)] : [];
    } else if (Array.is_array(url)) {
      return [...url];
    } else {
      return [];
    }
  }
  to_post_value(file_list) {
    if (this.attrs?.wx_avatar) {
      return file_list;
    } else if (!Array.is_array(file_list) || !file_list[0]) {
      return "";
    } else {
      return file_list[0].oss_url || "";
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

class Alioss_image_field extends Alioss_field {
  type = "alioss_image";
  db_type = "varchar";
}
class Alioss_list_field extends Alioss_field {
  type = "alioss_list";
  db_type = "jsonb";
  get_validators(validators) {
    return Base_array_field.prototype.get_validators.call(this, validators);
  }
  get_empty_value_to_update() {
    return [];
  }
  get_options(options) {
    return {
      ...Base_array_field.prototype.get_options.call(this, options),
      ...Alioss_field.prototype.get_options.call(this, options),
      type: this.type,
      db_type: "jsonb",
    };
  }
  json() {
    return {
      ...Base_array_field.prototype.json.call(this),
      ...Alioss_field.prototype.json.call(this),
    };
  }
  to_form_value(urls) {
    // console.log("call to_form_value2", JSON.stringify(urls));
    if (Array.is_array(urls)) {
      return urls.map(map_to_antd_file_value);
    } else {
      return [];
    }
  }
  to_post_value(file_list) {
    if (!Array.is_array(file_list) || !file_list[0]) {
      return [];
    } else {
      return file_list.map((e) => e.oss_url);
    }
  }
}

class Alioss_image_list_field extends Alioss_list_field {
  type = "alioss_image_list";
  db_type = "jsonb";
  constructor(options) {
    super(options);
    this.image = true;
  }
  get_options(options) {
    return {
      ...super.get_options(options),
      type: "alioss_image_list",
    };
  }
}
export {
  get_choices,
  Base_field,
  String_field,
  Email_field,
  Password_field,
  Year_month_field,
  Year_field,
  Month_field,
  Text_field,
  Integer_field,
  Float_field,
  Datetime_field,
  Date_field,
  Time_field,
  Json_field,
  Array_field,
  Table_field,
  Foreignkey_field,
  Boolean_field,
  Alioss_field,
  Alioss_image_field,
  Alioss_list_field,
  Alioss_image_list_field,
  Sfzh_field,
};
