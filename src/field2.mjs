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
    if (Array.isArray(this.choices)) {
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
      } else if (Array.isArray(this.choices) && this.choices.length && this.type !== "array") {
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
    if (Array.isArray(this.choices) && this.choices.length > 0) {
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