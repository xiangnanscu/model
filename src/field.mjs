// get_options 和后端不同, attrs必存在
import { clone, assert, NULL, FK_TYPE_NOT_DEFIEND, get_localtime } from "./utils";
import * as Validator from "./validator";
import { Http } from "@/globals/Http";
import { parse_size } from "@/lib/utils.mjs";

const TABLE_MAX_ROWS = 1;
const CHOICES_ERROR_DISPLAY_COUNT = 30;
const DEFAULT_ERROR_MESSAGES = { required: "此项必填", choices: "无效选项" };
const PRIMITIVE_TYPES = {
  string: true,
  number: true,
  boolean: true,
  bigint: true,
};

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
function string_choices_to_array(s) {
  const choices = [];
  for (let [_, line] of s.split("\n").entries()) {
    line = line.trim();
    if (line !== "") {
      choices.push(line);
    }
  }
  return choices;
}
function get_choices(raw_choices) {
  if (typeof raw_choices === "string") {
    raw_choices = string_choices_to_array(raw_choices);
  }
  if (!Array.isArray(raw_choices)) {
    throw new Error(`choices type must be table ,not ${typeof raw_choices}`);
  }
  const choices = [];
  for (let [i, c] of raw_choices.entries()) {
    if (typeof c === "string") {
      c = { value: c, label: c };
    } else if (PRIMITIVE_TYPES[typeof c]) {
      c = { value: c, label: String(c) };
    } else if (typeof c === "object") {
      const [value, label, hint] = clean_choice(c);
      c = { value: value, label: label, hint: hint };
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
  const is_choice = {};
  for (const [_, c] of choices.entries()) {
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
class basefield {
  __is_field_class__ = true;
  required = false;
  option_names = base_option_names;
  static new(options) {
    return this.create_field(options);
  }
  static create_field(options) {
    const self = new this(options);
    self.validators = self.get_validators([]);
    return self;
  }
  constructor(options) {
    this.name = assert(options.name, "you must define a name for a field");
    this.type = options.type;
    for (const [_, name] of this.option_names.entries()) {
      if (options[name] !== undefined) {
        this[name] = options[name];
      }
    }
    if (this.db_type === undefined) {
      this.db_type = this.type;
    }
    if (this.label === undefined) {
      this.label = this.name;
    }
    if (this.null === undefined) {
      if (this.required || this.db_type === "varchar" || this.db_type === "text") {
        this.null = false;
      } else {
        this.null = true;
      }
    }
    if (Array.isArray(this.choices) || typeof this.choices === "string") {
      this.choices = get_choices(this.choices);
    }
    return this;
  }
  get_error_message(key) {
    if (this.error_messages && this.error_messages[key]) {
      return this.error_messages[key];
    }
    return DEFAULT_ERROR_MESSAGES[key];
  }
  get_validators(validators) {
    if (this.required) {
      validators.unshift(Validator.required(this.get_error_message("required")));
    } else {
      validators.unshift(Validator.not_required);
    }
    if (typeof this.choices_url === "string" && this.strict) {
      const dynamic_choices_validator = async (val) => {
        let message = this.get_error_message("choices");
        const data = await Http[this.choices_url_method || "get"](this.choices_url).data;
        const choices = get_choices(data);
        for (const [_, c] of choices.entries()) {
          if (val === c.value) {
            return val;
          }
        }
        if (choices.length <= CHOICES_ERROR_DISPLAY_COUNT) {
          message = `${message}，${get_choices_error_message(choices)}`;
        }
        throw new Error(message);
      };
      validators.push(dynamic_choices_validator);
    }
    if (Array.isArray(this.choices) && this.choices.length && (this.strict === undefined || this.strict)) {
      validators.push(get_choices_validator(this.choices, this.get_error_message("choices")));
    }
    return validators;
  }
  get_options(options) {
    if (!options) {
      options = this;
    }
    const ret = { name: options.name, type: options.type };
    for (const [_, name] of this.option_names.entries()) {
      if (options[name] !== undefined) {
        ret[name] = options[name];
      }
    }
    if (ret.attrs) {
      ret.attrs = clone(ret.attrs);
    } else {
      ret.attrs = {};
    }
    return ret;
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
      if (Array.isArray(json.choices) && json.choices.length > 0 && !json.autocomplete) {
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
  for (const [_, c] of choices.entries()) {
    const value = c.value;
    const n1 = utils.utf8len(value);
    if (n1 > n) {
      n = n1;
    }
  }
  return n;
}
const string_option_names = utils.list(basefield.option_names, [
  "compact",
  "trim",
  "pattern",
  "length",
  "minlength",
  "maxlength",
  "input_type",
]);
const string = basefield._class({
  type: "string",
  db_type: "varchar",
  compact: true,
  trim: true,
  option_names: string_option_names,
  init: function (self, options) {
    if (!options.choices && !options.length && !options.maxlength) {
      throw new Error(`field '${options.name}' must define maxlength or choices or length`);
    }
    basefield.init(self, options);
    if (self.compact === undefined) {
      self.compact = true;
    }
    if (self._js_default === undefined && !self.primary_key && !self.unique) {
      self._js_default = "";
    }
    if (self.choices && self.choices.length > 0) {
      const n = get_max_choice_length(self.choices);
      assert(n > 0, "invalid string choices(empty choices or zero length value):" + self.name);
      const m = self.length || self.maxlength;
      if (!m || n > m) {
        self.maxlength = n;
      }
    }
  },
  get_validators: function (self, validators) {
    for (const [_, e] of ["pattern", "length", "minlength", "maxlength"].entries()) {
      if (self[e]) {
        validators.unshift(Validator[e](self[e], self.get_error_message(e)));
      }
    }
    if (self.compact) {
      validators.unshift(Validator.delete_spaces);
    } else if (self.trim) {
      validators.unshift(Validator.trim);
    }
    validators.unshift(Validator.string);
    return basefield.get_validators(self, validators);
  },
  widget_attrs: function (self, extra_attrs) {
    const attrs = { minlength: self.minlength };
    return utils.dict(basefield.widget_attrs(self), attrs, extra_attrs);
  },
});
const text_option_names = utils.list(basefield.option_names, ["trim", "pattern"]);
const text = basefield._class({
  type: "text",
  db_type: "text",
  option_names: text_option_names,
  init: function (self, options) {
    basefield.init(self, options);
    if (self._js_default === undefined) {
      self._js_default = "";
    }
  },
});
const sfzh_option_names = utils.list(string.option_names, []);
const sfzh = string._class({
  type: "sfzh",
  db_type: "varchar",
  option_names: sfzh_option_names,
  init: function (self, options) {
    string.init(self, utils.dict(options, { length: 18 }));
  },
  get_validators: function (self, validators) {
    validators.unshift(Validator.sfzh);
    return string.get_validators(self, validators);
  },
});
const email = string._class({
  type: "email",
  db_type: "varchar",
  init: function (self, options) {
    string.init(self, utils.dict({ maxlength: 255 }, options));
  },
});
const password = string._class({
  type: "password",
  db_type: "varchar",
  init: function (self, options) {
    string.init(self, utils.dict({ maxlength: 255 }, options));
  },
});
const year_month = string._class({
  type: "year_month",
  db_type: "varchar",
  init: function (self, options) {
    string.init(self, utils.dict({ maxlength: 7 }, options));
  },
  get_validators: function (self, validators) {
    validators.unshift(Validator.year_month);
    return basefield.get_validators(self, validators);
  },
});
const number_validator_names = ["min", "max"];
function add_min_or_max_validators(self, validators) {
  for (const [_, name] of number_validator_names.entries()) {
    if (self[name]) {
      validators.unshift(Validator[name](self[name], self.get_error_message(name)));
    }
  }
}
const integer_option_names = utils.list(basefield.option_names, ["min", "max", "step", "serial"]);
const integer = basefield._class({
  type: "integer",
  db_type: "integer",
  option_names: integer_option_names,
  get_validators: function (self, validators) {
    add_min_or_max_validators(self, validators);
    validators.unshift(Validator.integer);
    return basefield.get_validators(self, validators);
  },
  json: function (self) {
    const json = basefield.json(self);
    if (json.primary_key && json.disabled === undefined) {
      json.disabled = true;
    }
    return json;
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const year = integer._class({
  type: "year",
  db_type: "integer",
  init: function (self, options) {
    integer.init(self, utils.dict({ min: 1000, max: 9999 }, options));
  },
});
const month = integer._class({
  type: "month",
  db_type: "integer",
  init: function (self, options) {
    integer.init(self, utils.dict({ min: 1, max: 12 }, options));
  },
});
const float_option_names = utils.list(basefield.option_names, ["min", "max", "step", "precision"]);
const float = basefield._class({
  type: "float",
  db_type: "float",
  option_names: float_option_names,
  get_validators: function (self, validators) {
    add_min_or_max_validators(self, validators);
    validators.unshift(Validator.number);
    return basefield.get_validators(self, validators);
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const DEFAULT_BOOLEAN_CHOICES = [
  { label: "是", value: true },
  { label: "否", value: false },
];
const boolean_option_names = utils.list(basefield.option_names, ["cn"]);
const boolean = basefield._class({
  type: "boolean",
  db_type: "boolean",
  option_names: boolean_option_names,
  init: function (self, options) {
    basefield.init(self, options);
    if (self.choices === undefined) {
      self.choices = DEFAULT_BOOLEAN_CHOICES;
    }
  },
  get_validators: function (self, validators) {
    if (self.cn) {
      validators.unshift(Validator.boolean_cn);
    } else {
      validators.unshift(Validator.boolean);
    }
    return basefield.get_validators(self, validators);
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const datetime_option_names = utils.list(basefield.option_names, ["auto_now_add", "auto_now", "precision", "timezone"]);
const datetime = basefield._class({
  type: "datetime",
  db_type: "timestamp",
  precision: 0,
  timezone: true,
  option_names: datetime_option_names,
  init: function (self, options) {
    basefield.init(self, options);
    if (self.auto_now_add) {
      self._js_default = ngx_localtime;
    }
  },
  get_validators: function (self, validators) {
    validators.unshift(Validator.datetime);
    return basefield.get_validators(self, validators);
  },
  json: function (self) {
    const ret = basefield.json(self);
    if (ret.disabled === undefined && (ret.auto_now || ret.auto_now_add)) {
      ret.disabled = true;
    }
    return ret;
  },
  prepare_for_db: function (self, value, data) {
    if (self.auto_now) {
      return ngx_localtime();
    } else if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const date_option_names = utils.list(basefield.option_names, []);
const date = basefield._class({
  type: "date",
  db_type: "date",
  option_names: date_option_names,
  get_validators: function (self, validators) {
    validators.unshift(Validator.date);
    return basefield.get_validators(self, validators);
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const time_option_names = utils.list(basefield.option_names, ["precision", "timezone"]);
const time = basefield._class({
  type: "time",
  db_type: "time",
  precision: 0,
  timezone: true,
  option_names: time_option_names,
  get_validators: function (self, validators) {
    validators.unshift(Validator.time);
    return basefield.get_validators(self, validators);
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
});
const VALID_FOREIGN_KEY_TYPES = {
  foreignkey: tostring,
  string: tostring,
  sfzh: tostring,
  integer: Validator.integer,
  float: tonumber,
  datetime: Validator.datetime,
  date: Validator.date,
  time: Validator.time,
};
const foreignkey_option_names = utils.list(basefield.option_names, [
  "reference",
  "reference_column",
  "reference_label_column",
  "reference_url",
  "reference_url_admin",
  "on_delete",
  "on_update",
  "autocomplete",
  "table_name",
  "admin_url_name",
  "models_url_name",
  "keyword_query_name",
  "limit_query_name",
]);
const foreignkey = basefield._class({
  type: "foreignkey",
  FK_TYPE_NOT_DEFIEND: FK_TYPE_NOT_DEFIEND,
  on_delete: "CASCADE",
  on_update: "CASCADE",
  admin_url_name: "admin",
  models_url_name: "model",
  keyword_query_name: "keyword",
  limit_query_name: "limit",
  convert: tostring,
  option_names: foreignkey_option_names,
  init: function (self, options) {
    basefield.init(self, utils.dict({ db_type: FK_TYPE_NOT_DEFIEND }, options));
    const fk_model = self.reference;
    if (fk_model === "self") {
      return self;
    }
    self.setup_with_fk_model(fk_model);
    return self;
  },
  setup_with_fk_model: function (self, fk_model) {
    assert(
      typeof fk_model === "object" && fk_model.__is_model_class__,
      `a foreignkey must define a reference model. not ${fk_model}(type: ${typeof fk_model})`
    );
    const rc = self.reference_column || fk_model.primary_key || fk_model.DEFAULT_PRIMARY_KEY || "id";
    const fk = fk_model.fields[rc];
    assert(
      fk,
      `invalid foreignkey name ${rc} for foreign model ${fk_model.table_name || "[TABLE NAME NOT DEFINED YET]"}`
    );
    self.reference_column = rc;
    const rlc = self.reference_label_column || rc;
    assert(
      fk_model.fields[rlc],
      `invalid foreignkey label name ${rlc} for foreign model ${fk_model.table_name || "[TABLE NAME NOT DEFINED YET]"}`
    );
    self.reference_label_column = rlc;
    self.convert = assert(VALID_FOREIGN_KEY_TYPES[fk.type], `invalid foreignkey (name:${fk.name}, type:${fk.type})`);
    assert(fk.primary_key || fk.unique, "foreignkey must be a primary key or unique key");
    if (self.db_type === FK_TYPE_NOT_DEFIEND) {
      self.db_type = fk.db_type || fk.type;
    }
  },
  get_validators: function (self, validators) {
    const fk_name = self.reference_column;
    function foreignkey_validator(v) {
      let err;
      if (typeof v === "object") {
        v = v[fk_name];
      }
      [v, err] = self.convert(v);
      if (err) {
        throw new Error("error when converting foreign key:" + String(err));
      }
      return v;
    }
    validators.unshift(foreignkey_validator);
    return basefield.get_validators(self, validators);
  },
  load: function (self, value) {
    const fk_name = self.reference_column;
    const fk_model = self.reference;
    function __index(t, key) {
      if (fk_model[key]) {
        return fk_model[key];
      } else if (fk_model.fields[key]) {
        const pk = rawget(t, fk_name);
        if (!pk) {
          return undefined;
        }
        const res = fk_model.get({ [fk_name]: pk });
        if (!res) {
          return undefined;
        }
        for (const [k, v] of Object.entries(res)) {
          rawset(t, k, v);
        }
        fk_model.create_record(t);
        return t[key];
      } else {
        return undefined;
      }
    }
    return setmetatable({ [fk_name]: value }, { __index: __index });
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return value;
    }
  },
  json: function (self) {
    const ret = basefield.json(self);
    ret.reference = self.reference.table_name;
    if (ret.keyword_query_name === undefined) {
      ret.keyword_query_name = "keyword";
    }
    if (ret.limit_query_name === undefined) {
      ret.limit_query_name = "limit";
    }
    ret.choices_url_admin = `/${ret.admin_url_name}/${ret.models_url_name}/${ret.table_name}/fk/${ret.name}/${ret.reference_label_column}`;
    ret.reference_url_admin = `/${ret.admin_url_name}/${ret.models_url_name}/${ret.reference}`;
    if (ret.choices_url === undefined) {
      ret.choices_url = `/${ret.reference}/choices?value=${ret.reference_column}&label=${ret.reference_label_column}`;
    }
    if (ret.reference_url === undefined) {
      ret.reference_url = `/${ret.reference}/json`;
    }
    return ret;
  },
});
const json = basefield._class({
  type: "json",
  db_type: "jsonb",
  json: function (self) {
    const json = basefield.json(self);
    json.tag = "textarea";
    return json;
  },
  prepare_for_db: function (self, value, data) {
    if (value === "" || value === undefined) {
      return NULL;
    } else {
      return Validator.encode(value);
    }
  },
});
function skip_validate_when_string(v) {
  if (typeof v === "string") {
    return [v, v];
  } else {
    return v;
  }
}
function check_array_type(v) {
  if (typeof v !== "object") {
    throw new Error("array field must be a table");
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
const basearray = json._class({
  init: function (self, options) {
    json.init(self, options);
    if (typeof self._js_default === "string") {
      self._js_default = string_choices_to_array(self._js_default);
    }
  },
  get_validators: function (self, validators) {
    if (self.required) {
      validators.unshift(non_empty_array_required(self.get_error_message("required")));
    }
    validators.unshift(check_array_type);
    validators.unshift(skip_validate_when_string);
    validators.push(Validator.encode_as_array);
    return json.get_validators(self, validators);
  },
  get_empty_value_to_update: function () {
    return utils.array();
  },
});
const array = basearray._class({
  type: "array",
  array_type: "string",
  init: function (self, options) {
    const fields = require("xodel.field");
    const array_field_cls = fields[options.array_type || self.array_type || "string"];
    if (!array_field_cls) {
      throw new Error("invalid array_type: " + options.array_type);
    }
    self.option_names = utils.list(array_field_cls.option_names, ["array_type"]);
    self.array_field = array_field_cls.create_field(options);
    basearray.init(self, options);
  },
});
function make_empty_array() {
  return utils.array();
}
const table_option_names = utils.list(basearray.option_names, ["model", "max_rows", "uploadable", "columns"]);
const table = basearray._class({
  type: "table",
  max_rows: TABLE_MAX_ROWS,
  option_names: table_option_names,
  init: function (self, options) {
    basearray.init(self, options);
    if (typeof self.model !== "object" || !self.model.__is_model_class__) {
      throw new Error("please define model for a table field: " + self.name);
    }
    if (!self._js_default || self._js_default === "") {
      self._js_default = make_empty_array;
    }
    if (!self.model.table_name) {
      self.model.materialize_with_table_name({
        table_name: self.name,
        label: self.label,
      });
    }
  },
  get_validators: function (self, validators) {
    function validate_by_each_field(rows) {
      let err;
      for (let [i, row] of rows.entries()) {
        assert(typeof row === "object", "elements of table field must be table");
        [row, err] = self.model.validate_create(row);
        if (row === undefined) {
          err.index = i;
          throw new Error(err);
        }
        rows[i] = row;
      }
      return rows;
    }
    validators.unshift(validate_by_each_field);
    return basearray.get_validators(self, validators);
  },
  json: function (self) {
    const ret = basearray.json(self);
    const model = {
      field_names: lua_array([]),
      fields: [],
      table_name: self.model.table_name,
      label: self.model.label,
    };
    for (const [_, name] of self.model.field_names.entries()) {
      const field = self.model.fields[name];
      model.field_names.push(name);
      model.fields[name] = field.json();
    }
    ret.model = model;
    return ret;
  },
  load: function (self, rows) {
    if (typeof rows !== "object") {
      throw new Error("value of table field must be table, not " + typeof rows);
    }
    for (let i = 0; i < rows.length; i = i + 1) {
      rows[i] = self.model.load(rows[i]);
    }
    return lua_array(rows);
  },
});
const ALIOSS_BUCKET = env("ALIOSS_BUCKET") || "";
const ALIOSS_REGION = env("ALIOSS_REGION") || "";
const ALIOSS_SIZE = env("ALIOSS_SIZE") || "1M";
const alioss_option_names = utils.list(basefield.option_names, [
  "size",
  "size_arg",
  "policy",
  "payload",
  "lifetime",
  "key_secret",
  "key_id",
  "times",
  "width",
  "hash",
  "image",
  "maxlength",
  "prefix",
  "upload_url",
  "payload_url",
  "input_type",
  "limit",
  "media_type",
]);
const alioss = string._class({
  type: "alioss",
  db_type: "varchar",
  option_names: alioss_option_names,
  init: function (self, options) {
    string.init(self, utils.dict({ maxlength: 255 }, options));
    const size = options.size || ALIOSS_SIZE;
    self.key_secret = options.key_secret;
    self.key_id = options.key_id;
    self.size_arg = size;
    self.size = utils.byte_size_parser(size);
    self.lifetime = options.lifetime;
    self.upload_url = `//${options.bucket || ALIOSS_BUCKET}.${options.region || ALIOSS_REGION}.aliyuncs.com/`;
  },
  get_options: function (self, options) {
    const ret = string.get_options(self, options);
    if (ret.size_arg) {
      ret.size = ret.size_arg;
      ret.size_arg = undefined;
    }
    return ret;
  },
  get_payload: function (self, options) {
    return get_payload(utils.dict(self, options));
  },
  get_validators: function (self, validators) {
    validators.unshift(Validator.url);
    return string.get_validators(self, validators);
  },
  json: function (self) {
    const ret = string.json(self);
    if (ret.input_type === undefined) {
      ret.input_type = "file";
    }
    ret.key_secret = undefined;
    ret.key_id = undefined;
    return ret;
  },
});
const alioss_image = alioss._class({
  type: "alioss_image",
  image: true,
  media_type: "image",
});
const alioss_list = array._class({
  type: "alioss_list",
  array_type: "alioss",
  option_names: alioss_option_names,
  init: function (self, options) {
    alioss.init(self, options);
    array.init(self, options);
  },
  get_payload: function (self, options) {
    return get_payload(utils.dict(self, options));
  },
  get_options: function (self, options) {
    return utils.dict(array.get_options(self, options), alioss.get_options(self, options), {
      type: self.type,
      db_type: "jsonb",
    });
  },
  json: function (self) {
    return utils.dict(array.json(self), alioss.json(self), {
      type: self.type,
      db_type: "jsonb",
    });
  },
});
const alioss_image_list = alioss_list._class({
  type: "alioss_image_list",
  array_type: "alioss_image",
  image: true,
  media_type: "image",
});
export default {
  basefield: basefield,
  string: string,
  sfzh: sfzh,
  email: email,
  password: password,
  text: text,
  integer: integer,
  float: float,
  datetime: datetime,
  date: date,
  year_month: year_month,
  year: year,
  month: month,
  time: time,
  json: json,
  array: array,
  table: table,
  foreignkey: foreignkey,
  boolean: boolean,
  alioss: alioss,
  alioss_image: alioss_image,
  alioss_list: alioss_list,
  alioss_image_list: alioss_image_list,
};
