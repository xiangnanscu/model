local Validator = require "xodel.validator"
local utils = require "xodel.utils"
local lua_array = require "xodel.array"
local env = require "xodel.utils".getenv
local get_payload = require "xodel.alioss".get_payload
local clone = require "table.clone"
local string_format = string.format
local table_concat = table.concat
local table_insert = table.insert
local ipairs = ipairs
local setmetatable = setmetatable
local type = type
local rawset = rawset
local ngx_localtime = ngx.localtime
local class = utils.class

-- local valid_id = utils.valid_id

local TABLE_MAX_ROWS = 1
local CHOICES_ERROR_DISPLAY_COUNT = 30
local DEFAULT_ERROR_MESSAGES = { required = "此项必填", choices = "无效选项" }

-- local PRIMITIVES = {
--   string = true,
--   number = true,
--   boolean = true,
--   table = true,
-- }
local NULL = ngx.null

local FK_TYPE_NOT_DEFIEND = {}

local function clean_choice(c)
  local v
  if c.value ~= nil then
    v = c.value
  else
    v = c[1]
  end
  assert(v ~= nil, "you must provide a value for a choice")
  local l
  if c.label ~= nil then
    l = c.label
  elseif c[2] ~= nil then
    l = c[2]
  else
    l = v
  end
  return v, l, (c.hint or c[3])
end
local function string_choices_to_array(s)
  local choices = lua_array {}
  for _, line in ipairs(utils.split(s, '\n')) do
    line = assert(Validator.trim(line))
    if line ~= "" then
      choices[#choices + 1] = line
    end
  end
  return choices
end
local function get_choices(raw_choices)
  if type(raw_choices) == 'string' then
    raw_choices = string_choices_to_array(raw_choices)
  end
  if type(raw_choices) ~= 'table' then
    error(string_format("choices type must be table ,not %s", type(raw_choices)))
  end
  local choices = lua_array {}
  for i, c in ipairs(raw_choices) do
    if type(c) == "string" or type(c) == "number" then
      c = { value = c, label = c }
    elseif type(c) == "table" then
      local value, label, hint = clean_choice(c)
      c = { value = value, label = label, hint = hint }
    else
      error("invalid choice type:" .. type(c))
    end
    choices[#choices + 1] = c
  end
  return choices
end

local function serialize_choice(choice)
  return tostring(choice.value)
end

local function get_choices_error_message(choices)
  local valid_choices = table_concat(utils.map(choices, serialize_choice), "，")
  return string_format("限下列选项：%s", valid_choices)
end

local function get_choices_validator(choices, message)
  if #choices <= CHOICES_ERROR_DISPLAY_COUNT then
    message = string_format("%s，%s", message, get_choices_error_message(choices))
  end
  local is_choice = {}
  for _, c in ipairs(choices) do
    is_choice[c.value] = true
  end
  local function choices_validator(value)
    if not is_choice[value] then
      return nil, message
    else
      return value
    end
  end

  return choices_validator
end


local base_option_names = {
  'primary_key', 'null', 'unique', 'index', 'db_type',
  'required', 'disabled', 'default', 'label', 'hint', 'error_messages',
  'choices', 'strict', 'choices_url', 'choices_url_admin', 'choices_url_method',
  "autocomplete", "preload", 'lazy', 'tag', 'attrs'
}
---@type Field
local basefield = class {
  __is_field_class__ = true,
  required = false,
  option_names = base_option_names,
  __call = function(cls, options)
    return cls:create_field(options)
  end,
  create_field = function(cls, options)
    local self = cls:new {}
    self:init(options)
    self.validators = self:get_validators {}
    return self
  end,
  new = function(cls, self)
    return setmetatable(self or {}, cls)
  end,
  init = function(self, options)
    self.name = assert(options.name, "you must define a name for a field")
    self.type = options.type
    for _, name in ipairs(self.option_names) do
      if options[name] ~= nil then
        self[name] = options[name]
      end
    end
    if self.db_type == nil then
      self.db_type = self.type
    end
    if self.label == nil then
      self.label = self.name
    end
    if self.null == nil then
      if self.required or self.db_type == 'varchar' or self.db_type == 'text' then
        self.null = false
      else
        self.null = true
      end
    end
    if self.choices then
      if self.strict == nil then
        self.strict = true
      end
      self.choices = get_choices(self.choices)
    end
    return self
  end,
  get_error_message = function(self, key)
    if self.error_messages and self.error_messages[key] then
      return self.error_messages[key]
    end
    return DEFAULT_ERROR_MESSAGES[key]
  end,
  get_validators = function(self, validators)
    if self.required then
      table_insert(validators, 1, Validator.required(self:get_error_message('required')))
    else
      table_insert(validators, 1, Validator.not_required)
    end
    if self.choices and self.strict then
      table_insert(validators, get_choices_validator(self.choices, self:get_error_message('choices')))
    end
    return validators
  end,
  get_options = function(self, options)
    if not options then
      options = self
    end
    local ret = {
      name = options.name,
      type = options.type,
    }
    for _, name in ipairs(self.option_names) do
      if options[name] ~= nil then
        ret[name] = options[name]
      end
    end
    if ret.attrs then
      ret.attrs = clone(ret.attrs)
    end
    return ret
  end,
  json = function(self)
    local json = self:get_options()
    if type(json.default) == 'function' then
      json.default = nil
    end
    if not json.tag then
      if type(json.choices) == 'table' and #json.choices > 0 and not json.autocomplete then
        json.tag = "select"
      else
        json.tag = "input"
      end
    end
    if json.tag == "input" and json.lazy == nil then
      json.lazy = true
    end
    if json.preload == nil and (json.choices_url or json.choices_url_admin) then
      json.preload = false
    end
    return json
  end,
  widget_attrs = function(self, extra_attrs)
    return utils.dict({ required = self.required, readonly = self.disabled }, extra_attrs)
  end,
  validate = function(self, value, ctx)
    if type(value) == 'function' then
      return value
    end
    local err
    for _, validator in ipairs(self.validators) do
      value, err = validator(value, ctx)
      if value ~= nil then
        if err == nil then
        elseif value == err then
          -- 代表保持原值,跳过此阶段的所有验证
          return value
        else
          return nil, err
        end
      elseif err ~= nil then
        return nil, err
      else
        -- not-required validator, skip the rest validations
        return nil
      end
    end
    return value
  end,
  get_default = function(self, ctx)
    if type(self.default) ~= "function" then
      return self.default
    else
      return self.default(ctx)
    end
  end,
}
local function get_max_choice_length(choices)
  local n = 0
  for _, c in ipairs(choices) do
    local value = c.value
    local n1 = utils.utf8len(value)
    if n1 > n then
      n = n1
    end
  end
  return n
end

local string_option_names = utils.list(
  basefield.option_names,
  { 'compact', 'trim', 'pattern', "length", "minlength", "maxlength", "input_type", })
local string = basefield:class {
  type = "string",
  db_type = "varchar",
  compact = true,
  trim = true,
  option_names = string_option_names,
  init = function(self, options)
    if not options.choices and not options.length and not options.maxlength then
      error(string_format("field '%s' must define maxlength or choices or length", options.name))
    end
    basefield.init(self, options)
    if self.compact == nil then
      self.compact = true
    end
    if self.default == nil and not self.primary_key and not self.unique then
      self.default = ""
    end
    if self.choices and #self.choices > 0 then
      local n = get_max_choice_length(self.choices)
      assert(n > 0, "invalid string choices(empty choices or zero length value):" .. self.name)
      local m = self.length or self.maxlength
      if not m or n > m then
        self.maxlength = n
      end
    end
  end,
  get_validators = function(self, validators)
    for _, e in ipairs { "pattern", "length", "minlength", "maxlength" } do
      if self[e] then
        table_insert(validators, 1, Validator[e](self[e], self:get_error_message(e)))
      end
    end
    if self.compact then
      table_insert(validators, 1, Validator.delete_spaces)
    elseif self.trim then
      table_insert(validators, 1, Validator.trim)
    end
    table_insert(validators, 1, Validator.string)
    return basefield.get_validators(self, validators)
  end,
  widget_attrs = function(self, extra_attrs)
    local attrs = {
      -- maxlength = self.maxlength,
      minlength = self.minlength
      -- pattern = self.pattern,
    }
    return utils.dict(basefield.widget_attrs(self), attrs, extra_attrs)
  end,
}

local text_option_names = utils.list(basefield.option_names, {
  "trim", "pattern",
})
local text = basefield:class {
  type = "text",
  db_type = "text",
  option_names = text_option_names,
  init = function(self, options)
    basefield.init(self, options)
    if self.default == nil then
      self.default = ""
    end
  end,
}

local sfzh_option_names = utils.list(string.option_names, {})
local sfzh = string:class {
  type = "sfzh",
  db_type = "varchar",
  option_names = sfzh_option_names,
  init = function(self, options)
    string.init(self, utils.dict(options, { length = 18 }))
  end,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.sfzh)
    return string.get_validators(self, validators)
  end,
}

local email = string:class {
  type = "email",
  db_type = "varchar",
  init = function(self, options)
    string.init(self, utils.dict({ maxlength = 255 }, options))
  end
}

local password = string:class {
  type = "password",
  db_type = "varchar",
  init = function(self, options)
    string.init(self, utils.dict({ maxlength = 255 }, options))
  end
}

local year_month = string:class {
  type = "year_month",
  db_type = "varchar",
  init = function(self, options)
    string.init(self, utils.dict({ maxlength = 7 }, options))
  end,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.year_month)
    return basefield.get_validators(self, validators)
  end,
}


local number_validator_names = { "min", "max" }
local function add_min_or_max_validators(self, validators)
  for _, name in ipairs(number_validator_names) do
    if self[name] then
      table_insert(validators, 1, Validator[name](self[name], self:get_error_message(name)))
    end
  end
end

local integer_option_names = utils.list(basefield.option_names, { "min", "max", "step", "serial" })
local integer = basefield:class {
  type = "integer",
  db_type = "integer",
  option_names = integer_option_names,
  get_validators = function(self, validators)
    add_min_or_max_validators(self, validators)
    table_insert(validators, 1, Validator.integer)
    return basefield.get_validators(self, validators)
  end,
  json = function(self)
    local json = basefield.json(self)
    if json.primary_key and json.disabled == nil then
      json.disabled = true
    end
    return json
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end
}

local year = integer:class {
  type = "year",
  db_type = "integer",
  init = function(self, options)
    integer.init(self, utils.dict({ min = 1000, max = 9999 }, options))
  end,
}

local month = integer:class {
  type = "month",
  db_type = "integer",
  init = function(self, options)
    integer.init(self, utils.dict({ min = 1, max = 12 }, options))
  end,
}

local float_option_names = utils.list(basefield.option_names, { "min", "max", "step", "precision" })
local float = basefield:class {
  type = "float",
  db_type = "float",
  -- precision = 0,
  option_names = float_option_names,
  get_validators = function(self, validators)
    add_min_or_max_validators(self, validators)
    table_insert(validators, 1, Validator.number)
    return basefield.get_validators(self, validators)
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
}


local DEFAULT_BOOLEAN_CHOICES = { { label = '是', value = true }, { label = '否', value = false } }
local boolean_option_names = utils.list(basefield.option_names, { 'cn' })
local boolean = basefield:class {
  type = "boolean",
  db_type = "boolean",
  option_names = boolean_option_names,
  init = function(self, options)
    basefield.init(self, options)
    if self.choices == nil then
      self.choices = DEFAULT_BOOLEAN_CHOICES
    end
  end,
  get_validators = function(self, validators)
    if self.cn then
      table_insert(validators, 1, Validator.boolean_cn)
    else
      table_insert(validators, 1, Validator.boolean)
    end
    return basefield.get_validators(self, validators)
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
}

local datetime_option_names = utils.list(basefield.option_names, {
  'auto_now_add',
  'auto_now',
  'precision',
  'timezone',
})
local datetime = basefield:class {
  type = "datetime",
  db_type = "timestamp",
  precision = 0,
  timezone = true,
  option_names = datetime_option_names,
  init = function(self, options)
    basefield.init(self, options)
    if self.auto_now_add then
      self.default = ngx_localtime
    end
  end,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.datetime)
    return basefield.get_validators(self, validators)
  end,
  json = function(self)
    local ret = basefield.json(self)
    if ret.disabled == nil and (ret.auto_now or ret.auto_now_add) then
      ret.disabled = true
    end
    return ret
  end,
  prepare_for_db = function(self, value, data)
    if self.auto_now then
      return ngx_localtime()
    elseif value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
}
local date_option_names = utils.list(basefield.option_names, {})
local date = basefield:class {
  type = "date",
  db_type = "date",
  option_names = date_option_names,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.date)
    return basefield.get_validators(self, validators)
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
}

local time_option_names = utils.list(basefield.option_names, { 'precision', 'timezone' })
local time = basefield:class {
  type = "time",
  db_type = "time",
  precision = 0,
  timezone = true,
  option_names = time_option_names,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.time)
    return basefield.get_validators(self, validators)
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
}


local VALID_FOREIGN_KEY_TYPES = {
  foreignkey = tostring,
  string = tostring,
  sfzh = tostring,
  integer = Validator.integer,
  float = tonumber,
  datetime = Validator.datetime,
  date = Validator.date,
  time = Validator.time
}
local foreignkey_option_names = utils.list(basefield.option_names,
  { 'reference', 'reference_column', 'reference_label_column', 'reference_url', 'reference_url_admin',
    'on_delete', 'on_update', 'autocomplete', 'table_name',
    'admin_url_name', 'models_url_name', 'keyword_query_name', 'limit_query_name' })
local foreignkey = basefield:class {
  type = "foreignkey",
  FK_TYPE_NOT_DEFIEND = FK_TYPE_NOT_DEFIEND,
  on_delete = 'CASCADE',
  on_update = 'CASCADE',
  admin_url_name = 'admin',
  models_url_name = 'model',
  keyword_query_name = 'keyword',
  limit_query_name = 'limit',
  convert = tostring,
  option_names = foreignkey_option_names,
  init = function(self, options)
    basefield.init(self, utils.dict({ db_type = FK_TYPE_NOT_DEFIEND }, options))
    local fk_model = self.reference
    if fk_model == "self" then
      -- ** used with Xodel._make_model_class
      return self
    end
    self:setup_with_fk_model(fk_model)
    return self
  end,
  setup_with_fk_model = function(self, fk_model)
    --setup: reference_column, reference_label_column, db_type
    assert(type(fk_model) == "table" and fk_model.__is_model_class__,
      string_format("a foreignkey must define a reference model. not %s(type: %s)", fk_model, type(fk_model)))
    local rc = self.reference_column or fk_model.primary_key or fk_model.DEFAULT_PRIMARY_KEY or "id"
    local fk = fk_model.fields[rc]
    assert(fk, string_format("invalid foreignkey name %s for foreign model %s",
      rc,
      fk_model.table_name or "[TABLE NAME NOT DEFINED YET]"))
    self.reference_column = rc
    local rlc = self.reference_label_column or rc
    assert(fk_model.fields[rlc], string_format("invalid foreignkey label name %s for foreign model %s",
      rlc,
      fk_model.table_name or "[TABLE NAME NOT DEFINED YET]"))
    self.reference_label_column = rlc
    self.convert = assert(VALID_FOREIGN_KEY_TYPES[fk.type],
      string_format("invalid foreignkey (name:%s, type:%s)", fk.name, fk.type))
    assert(fk.primary_key or fk.unique, "foreignkey must be a primary key or unique key")
    if self.db_type == FK_TYPE_NOT_DEFIEND then
      self.db_type = fk.db_type or fk.type
    end
  end,
  get_validators = function(self, validators)
    local fk_name = self.reference_column
    local function foreignkey_validator(v)
      local err
      if type(v) == "table" then
        v = v[fk_name]
      end
      v, err = self.convert(v)
      if err then
        return nil, "error when converting foreign key:" .. tostring(err)
      end
      return v
    end

    table_insert(validators, 1, foreignkey_validator)
    return basefield.get_validators(self, validators)
  end,
  load = function(self, value)
    local fk_name = self.reference_column
    local fk_model = self.reference
    local function __index(t, key)
      if fk_model[key] then
        -- perform sql only when key is in fields:
        return fk_model[key]
      elseif fk_model.fields[key] then
        local pk = rawget(t, fk_name)
        if not pk then
          return nil
        end
        local res = fk_model:get { [fk_name] = pk }
        if not res then
          return nil
        end
        for k, v in pairs(res) do
          rawset(t, k, v)
        end
        -- become an instance of fk_model
        fk_model:create_record(t)
        return t[key]
      else
        return nil
      end
    end

    return setmetatable({ [fk_name] = value }, { __index = __index })
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return value
    end
  end,
  json = function(self)
    local ret = basefield.json(self)
    ret.reference = self.reference.table_name
    if ret.keyword_query_name == nil then
      ret.keyword_query_name = "keyword"
    end
    if ret.limit_query_name == nil then
      ret.limit_query_name = "limit"
    end
    ret.choices_url_admin = string_format([[/%s/%s/%s/fk/%s/%s]],
      ret.admin_url_name,
      ret.models_url_name,
      ret.table_name,
      ret.name,
      ret.reference_label_column)
    ret.reference_url_admin = string_format([[/%s/%s/%s]],
      ret.admin_url_name,
      ret.models_url_name,
      ret.reference)
    if ret.choices_url == nil then
      ret.choices_url = string_format([[/%s/choices?value=%s&label=%s]],
        ret.reference,
        ret.reference_column,
        ret.reference_label_column)
    end
    if ret.reference_url == nil then
      ret.reference_url = string_format([[/%s/json]], ret.reference)
    end
    return ret
  end,
}

local json = basefield:class {
  type = "json",
  db_type = "jsonb",
  json = function(self)
    local json = basefield.json(self)
    json.tag = "textarea"
    return json
  end,
  prepare_for_db = function(self, value, data)
    if value == "" or value == nil then
      return NULL
    else
      return Validator.encode(value)
    end
  end,
}

local function skip_validate_when_string(v)
  if type(v) == "string" then
    return v, v
  else
    return v
  end
end

local function check_array_type(v)
  if type(v) ~= "table" then
    return nil, "array field must be a table"
  else
    return v
  end
end

local function non_empty_array_required(message)
  message = message or "此项必填"
  local function array_validator(v)
    if #v == 0 then
      return nil, message
    else
      return v
    end
  end

  return array_validator
end


local basearray = json:class {
  init = function(self, options)
    json.init(self, options)
    if type(self.default) == 'string' then
      self.default = string_choices_to_array(self.default)
    end
  end,
  get_validators = function(self, validators)
    if self.required then
      table_insert(validators, 1, non_empty_array_required(self:get_error_message('required')))
    end
    table_insert(validators, 1, check_array_type)
    table_insert(validators, 1, skip_validate_when_string)
    -- 服务端暂时不校验
    -- table_insert(validators, function(v)

    -- end)
    table_insert(validators, Validator.encode_as_array)
    return json.get_validators(self, validators)
  end,
  get_empty_value_to_update = function()
    return utils.array()
  end
}

local array = basearray:class {
  type = "array",
  array_type = 'string',
  init = function(self, options)
    local fields = require("xodel.field")
    local array_field_cls = fields[options.array_type or self.array_type or 'string']
    if not array_field_cls then
      error("invalid array_type: " .. options.array_type)
    end
    self.option_names = utils.list(array_field_cls.option_names, { 'array_type' })
    self.array_field = array_field_cls:create_field(options)
    basearray.init(self, options)
  end,
}

local function make_empty_array()
  return utils.array()
end

local table_option_names = utils.list(basearray.option_names, { 'model', 'max_rows', 'uploadable', 'columns' })
local table = basearray:class {
  type = "table",
  max_rows = TABLE_MAX_ROWS,
  option_names = table_option_names,
  init = function(self, options)
    basearray.init(self, options)
    if type(self.model) ~= 'table' or not self.model.__is_model_class__ then
      error("please define model for a table field: " .. self.name)
    end
    if not self.default or self.default == "" then
      self.default = make_empty_array
    end
    if not self.model.table_name then
      self.model:materialize_with_table_name { table_name = self.name, label = self.label }
    end
  end,
  get_validators = function(self, validators)
    local function validate_by_each_field(rows)
      local err
      for i, row in ipairs(rows) do
        assert(type(row) == "table", "elements of table field must be table")
        row, err = self.model:validate_create(row)
        if row == nil then
          err.index = i
          -- err.type = 'field_error_batch'
          return nil, err
        end
        rows[i] = row
      end
      return rows
    end

    table_insert(validators, 1, validate_by_each_field)
    return basearray.get_validators(self, validators)
  end,
  json = function(self)
    local ret = basearray.json(self)
    local model = {
      field_names = lua_array {},
      fields = {},
      table_name = self.model.table_name,
      label = self.model.label
    }
    for _, name in ipairs(self.model.field_names) do
      local field = self.model.fields[name]
      model.field_names:push(name)
      model.fields[name] = field:json()
    end
    ret.model = model
    return ret
  end,
  load = function(self, rows)
    if type(rows) ~= 'table' then
      error('value of table field must be table, not ' .. type(rows))
    end
    for i = 1, #rows do
      rows[i] = self.model:load(rows[i])
    end
    return lua_array(rows)
  end,
}

local ALIOSS_BUCKET = env("ALIOSS_BUCKET") or ""
local ALIOSS_REGION = env("ALIOSS_REGION") or ""
local ALIOSS_SIZE = env("ALIOSS_SIZE") or "1M"

local alioss_option_names = utils.list(basefield.option_names, {
  'size', 'size_arg', 'policy', 'payload', 'lifetime', 'key_secret', 'key_id',
  'times', 'width', 'hash',
  'image', 'maxlength', 'prefix',
  'upload_url', 'payload_url', 'input_type', 'limit', 'media_type',
})
local alioss = string:class {
  type = "alioss",
  db_type = "varchar",
  option_names = alioss_option_names,
  init = function(self, options)
    string.init(self, utils.dict({ maxlength = 255 }, options))
    local size = options.size or ALIOSS_SIZE
    self.key_secret = options.key_secret
    self.key_id = options.key_id
    self.size_arg = size
    self.size = utils.byte_size_parser(size)
    self.lifetime = options.lifetime
    self.upload_url = string_format("//%s.%s.aliyuncs.com/",
      options.bucket or ALIOSS_BUCKET,
      options.region or ALIOSS_REGION)
  end,
  ---@param options {size:string,lifetime:number, bucket:string,key:string, key_secret?: string,key_id?:string,success_action_status?:number}
  ---@return {policy:string, OSSAccessKeyId:string, signature:string, success_action_status?:number}
  get_options = function(self, options)
    local ret = string.get_options(self, options)
    if ret.size_arg then
      ret.size = ret.size_arg
      ret.size_arg = nil
    end
    return ret
  end,
  get_payload = function(self, options)
    return get_payload(utils.dict(self, options))
  end,
  get_validators = function(self, validators)
    table_insert(validators, 1, Validator.url)
    return string.get_validators(self, validators)
  end,
  json = function(self)
    local ret = string.json(self)
    if ret.input_type == nil then
      ret.input_type = "file"
    end
    ret.key_secret = nil
    ret.key_id = nil
    return ret
  end,
}

local alioss_image = alioss:class {
  type = "alioss_image",
  image = true,
  media_type = 'image'
}

local alioss_list = array:class {
  type = "alioss_list",
  array_type = 'alioss',
  option_names = alioss_option_names,
  init = function(self, options)
    alioss.init(self, options)
    -- array在后确保default为数组
    array.init(self, options)
  end,
  ---@param options {size:string,lifetime:number, bucket:string,key:string, key_secret?: string,key_id?:string,success_action_status?:number}
  ---@return {policy:string, OSSAccessKeyId:string, signature:string, success_action_status?:number}
  get_payload = function(self, options)
    return get_payload(utils.dict(self, options))
  end,
  get_options = function(self, options)
    return utils.dict(
      array.get_options(self, options),
      alioss.get_options(self, options),
      { type = self.type, db_type = "jsonb" }
    )
  end,
  json = function(self)
    return utils.dict(
      array.json(self),
      alioss.json(self),
      { type = self.type, db_type = "jsonb" }
    )
  end,
}

local alioss_image_list = alioss_list:class {
  type = "alioss_image_list",
  array_type = 'alioss_image',
  image = true,
  media_type = 'image'
}

return {
  basefield = basefield,
  string = string,
  sfzh = sfzh,
  email = email,
  password = password,
  text = text,
  integer = integer,
  float = float,
  datetime = datetime,
  date = date,
  year_month = year_month,
  year = year,
  month = month,
  time = time,
  json = json,
  array = array,
  table = table,
  foreignkey = foreignkey,
  boolean = boolean,
  alioss = alioss,
  alioss_image = alioss_image,
  alioss_list = alioss_list,
  alioss_image_list = alioss_image_list,
}
