local cjson_encode = require "cjson.safe".encode
local utils = require "xodel.utils"
local object = require "xodel.object"
local array = require "xodel.array"
local smart_quote = require "xodel.model".smart_quote
local format = string.format

-- 序列化默认值
local function serialize_default(val)
  if type(val) == "string" then
    return "'" .. val:gsub("'", "''") .. "'"
  elseif val == false then
    return "FALSE"
  elseif val == true then
    return "TRUE"
  elseif type(val) == "number" then
    return tostring(val)
  elseif type(val) == "function" then
    return serialize_default(val())
  elseif type(val) == "table" then
    local s, err = cjson_encode(val)
    if err then
      return nil, "table as a default value but can not be encoded"
    end
    return serialize_default(s)
  elseif val == ngx.null then
    return 'NULL'
  else
    return nil, format("type `%s` is not supported as a default value", type(val))
  end
end

-- 获取外键引用的字段
local function get_foreign_field(field)
  local fk_model = field.reference
  local fk_name = field.reference_column or
      assert(fk_model.primary_key,
        format("model '%s' referenced by foreignkey must define primary_key", fk_model.table_name))
  local fk = assert(fk_model.fields[fk_name],
    format("invalid field name '%s' for table '%s'", fk_name, fk_model.table_name))
  return fk
end

-- 获取字段的数据库类型
local function get_db_type(field)
  local field_type = field.type

  if field_type == "string" or field_type == "id_card" or field_type == "password" or
      field_type == "email" or field_type == "alioss" or field_type == "alioss_image" then
    return format("varchar(%s)", field.maxlength or field.length)
  elseif field_type == "uuid" then
    return "uuid"
  elseif field_type == "text" then
    return "text"
  elseif field_type == "integer" then
    return "integer"
  elseif field_type == "float" then
    if not field.precision then
      return "float"
    else
      return format("float(%s)", field.precision)
    end
  elseif field_type == "json" or field_type == "array" or field_type == "table" or
      field_type == "alioss_list" or field_type == "alioss_image_list" then
    return "jsonb"
  elseif field_type == "boolean" then
    return "boolean"
  elseif field_type == "date" then
    return "date"
  elseif field_type == "year" or field_type == "month" then
    return "integer"
  elseif field_type == "year_month" then
    return "varchar"
  elseif field_type == "datetime" or field_type == "time" then
    local base_type = field_type == "datetime" and "timestamp" or "time"
    local timezone_token = field.timezone and " WITH TIME ZONE" or ""
    return format("%s(%s)%s", base_type, field.precision or 0, timezone_token)
  elseif field_type == "foreignkey" then
    -- 对于外键，需要获取引用字段的类型
    local ref_field = get_foreign_field(field)
    return get_db_type(ref_field)
  else
    -- 其他类型默认为varchar
    return format("varchar(%s)", field.maxlength or field.length or 255)
  end
end

-- 生成约束名称
local function get_constraint_name(table_name, field_name, constraint_type)
  if constraint_type == "unique" then
    return format("%s_%s_key", table_name, field_name)
  elseif constraint_type == "index" then
    return format("%s_%s_idx", table_name, field_name)
  elseif constraint_type == "foreign_key" then
    return format("%s_%s_fkey", table_name, field_name)
  end
end

-- 生成外键引用语句
local function get_foreign_key_reference(field)
  local fk_model = field.reference
  local fk = get_foreign_field(field)
  local fk_name = fk.name
  return format('REFERENCES "%s" ("%s") ON DELETE %s ON UPDATE %s',
    fk_model.table_name, smart_quote(fk_name),
    field.on_delete or "NO ACTION", field.on_update or "CASCADE")
end

-- 生成字段创建语句
local function get_field_create_sql(table_name, field)
  local tokens = {}
  local table_tokens = {}

  -- 基础类型
  local db_type = get_db_type(field)

  -- 特殊处理
  if field.type == "uuid" then
    tokens[#tokens + 1] = "DEFAULT gen_random_uuid()"
  elseif field.serial then
    db_type = "SERIAL"
    field.null = false
  elseif field.type == "foreignkey" then
    local ref_sql = get_foreign_key_reference(field)
    db_type = format("%s %s", db_type, ref_sql)
  end

  -- 主键
  if field.primary_key then
    field.null = false
    tokens[#tokens + 1] = 'PRIMARY KEY'
  end

  -- 非空约束
  if not field.null then
    tokens[#tokens + 1] = 'NOT NULL'
  end

  -- 默认值
  if field.type == "datetime" and field.auto_now_add then
    tokens[#tokens + 1] = 'DEFAULT CURRENT_TIMESTAMP'
  elseif field.default ~= nil then
    if field.default == ngx.localtime then
      tokens[#tokens + 1] = 'DEFAULT CURRENT_TIMESTAMP'
    else
      local val, err = serialize_default(field.default)
      if err then
        error(format("error when processing default value of field %s of %s: %s",
          field.name, table_name, err))
      end
      tokens[#tokens + 1] = "DEFAULT " .. val
    end
  end

  -- 唯一约束
  if field.unique then
    tokens[#tokens + 1] = "UNIQUE"
  elseif field.index then
    -- 创建索引
    local index_name = get_constraint_name(table_name, field.name, "index")
    table.insert(table_tokens, format("CREATE INDEX %s ON %s (%s)",
      index_name, smart_quote(table_name), smart_quote(field.name)))
  end

  local field_sql = format("%s %s %s", smart_quote(field.name), db_type, table.concat(tokens, " "))
  return field_sql, table_tokens
end

-- 比较字段变化并生成ALTER语句
local function compare_field_changes(table_name, old_field, new_field)
  local tokens = {}

  -- 比较类型
  if old_field.type ~= new_field.type then
    local col = new_field.name
    if new_field.type == 'string' or new_field.type == 'integer' then
      local using_type = new_field.type == 'string' and 'varchar' or new_field.type
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE %s USING(%s::%s)",
        smart_quote(table_name), col, get_db_type(new_field), col, using_type)
    elseif new_field.type == 'text' and old_field.type == 'string' then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
        smart_quote(table_name), col, get_db_type(new_field))
    elseif new_field.type == 'year_month' then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE %s USING(%s::%s)",
        smart_quote(table_name), col, get_db_type(new_field), col, new_field.db_type or "varchar")
    elseif new_field.type == 'date' then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT", smart_quote(table_name), col)
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE %s",
        smart_quote(table_name), col, get_db_type(new_field))
    elseif new_field.db_type and old_field.db_type and new_field.db_type == old_field.db_type then
      -- 如果db_type相同，则不需要转换
    else
      error(format("table `%s` field `%s` alter type from `%s` to `%s` is not supported",
        table_name, new_field.name, old_field.type, new_field.type))
    end
  end

  -- 比较NULL约束
  local old_null = not not old_field.null
  local new_null = not not new_field.null
  if old_null ~= new_null then
    if old_null and not new_null then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s SET NOT NULL",
        smart_quote(table_name), smart_quote(new_field.name))
    elseif not old_null and new_null then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s DROP NOT NULL",
        smart_quote(table_name), smart_quote(new_field.name))
    end
  end

  -- 比较默认值
  if old_field.default ~= new_field.default then
    if not (type(old_field.default) == 'table' and type(new_field.default) == 'table' and
          object.equals(old_field.default, new_field.default)) then
      if new_field.default ~= nil then
        tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s SET DEFAULT %s",
          smart_quote(table_name), smart_quote(new_field.name), serialize_default(new_field.default))
      else
        tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT",
          smart_quote(table_name), smart_quote(new_field.name))
      end
    end
  end

  -- 比较auto_now_add
  if old_field.auto_now_add ~= new_field.auto_now_add then
    if new_field.auto_now_add then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s SET DEFAULT CURRENT_TIMESTAMP",
        smart_quote(table_name), smart_quote(new_field.name))
    else
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s DROP DEFAULT",
        smart_quote(table_name), smart_quote(new_field.name))
    end
  end

  -- 比较主键
  local old_pk = not not old_field.primary_key
  local new_pk = not not new_field.primary_key
  if old_pk ~= new_pk then
    if old_pk and not new_pk then
      tokens[#tokens + 1] = format("ALTER TABLE %s DROP CONSTRAINT %s_pkey",
        smart_quote(table_name), smart_quote(new_field.name))
    elseif not old_pk and new_pk then
      tokens[#tokens + 1] = format("ALTER TABLE %s ADD PRIMARY KEY (%s)",
        smart_quote(table_name), smart_quote(new_field.name))
    end
  end

  -- 比较唯一约束
  local old_unique = not not old_field.unique
  local new_unique = not not new_field.unique
  if old_unique ~= new_unique then
    local constraint_name = get_constraint_name(table_name, new_field.name, "unique")
    if old_unique and not new_unique then
      tokens[#tokens + 1] = format("ALTER TABLE %s DROP CONSTRAINT %s",
        smart_quote(table_name), constraint_name)
    elseif not old_unique and new_unique then
      tokens[#tokens + 1] = format("ALTER TABLE %s ADD CONSTRAINT %s UNIQUE (%s)",
        smart_quote(table_name), constraint_name, smart_quote(new_field.name))
    end
  end

  -- 比较索引
  local old_index = not not old_field.index
  local new_index = not not new_field.index
  if old_index ~= new_index then
    local index_name = get_constraint_name(table_name, new_field.name, "index")
    if old_index and not new_index then
      tokens[#tokens + 1] = format("DROP INDEX %s", index_name)
    elseif not old_index and new_index then
      tokens[#tokens + 1] = format("CREATE INDEX %s ON %s (%s)",
        index_name, smart_quote(table_name), smart_quote(new_field.name))
    end
  end

  -- 比较长度/精度等
  if old_field.maxlength ~= new_field.maxlength or old_field.length ~= new_field.length then
    if new_field.type == "string" then
      tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE varchar(%s)",
        smart_quote(table_name), smart_quote(new_field.name), new_field.maxlength or new_field.length)
    end
  end

  if old_field.precision ~= new_field.precision and new_field.type == "datetime" then
    local timezone_token = new_field.timezone and " WITH TIME ZONE" or ""
    tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE timestamp(%s)%s",
      smart_quote(table_name), smart_quote(new_field.name), new_field.precision, timezone_token)
  end

  if old_field.timezone ~= new_field.timezone and new_field.type == "datetime" then
    local timezone_token = new_field.timezone and " WITH TIME ZONE" or ""
    tokens[#tokens + 1] = format("ALTER TABLE %s ALTER COLUMN %s TYPE timestamp(%s)%s",
      smart_quote(table_name), smart_quote(new_field.name), new_field.precision or 0, timezone_token)
  end

  return tokens
end

-- 比较外键变化
local function compare_foreign_key_changes(table_name, old_field, new_field)
  local tokens = {}

  -- 检查是否都是外键
  local old_is_fk = old_field.reference ~= nil
  local new_is_fk = new_field.reference ~= nil

  if old_is_fk and not new_is_fk then
    -- 删除外键约束
    local constraint_name = get_constraint_name(table_name, old_field.name, "foreign_key")
    tokens[#tokens + 1] = format("ALTER TABLE %s DROP CONSTRAINT %s", smart_quote(table_name), constraint_name)
  elseif not old_is_fk and new_is_fk then
    -- 添加外键约束
    local constraint_name = get_constraint_name(table_name, new_field.name, "foreign_key")
    local ref_sql = get_foreign_key_reference(new_field)
    tokens[#tokens + 1] = format("ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) %s",
      smart_quote(table_name), constraint_name, smart_quote(new_field.name), ref_sql)
  elseif old_is_fk and new_is_fk then
    -- 比较外键引用是否相同
    local old_ref = old_field.reference
    local new_ref = new_field.reference

    local same = true
    if old_ref.table_name ~= new_ref.table_name or
        (old_field.reference_column or old_ref.primary_key) ~= (new_field.reference_column or new_ref.primary_key) or
        old_field.on_delete ~= new_field.on_delete or
        old_field.on_update ~= new_field.on_update then
      same = false
    end

    if not same then
      -- 先删除旧约束，再添加新约束
      local constraint_name = get_constraint_name(table_name, old_field.name, "foreign_key")
      tokens[#tokens + 1] = format("ALTER TABLE %s DROP CONSTRAINT %s", smart_quote(table_name), constraint_name)

      local new_constraint_name = get_constraint_name(table_name, new_field.name, "foreign_key")
      local ref_sql = get_foreign_key_reference(new_field)
      tokens[#tokens + 1] = format("ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) %s",
        smart_quote(table_name), new_constraint_name, smart_quote(new_field.name), ref_sql)
    end
  end

  return tokens
end

-- 比较unique_together约束
local function compare_unique_together(old_model, new_model)
  local tokens = {}
  local old_map = {}
  local new_map = {}

  -- 构建映射
  for _, uniques in ipairs(old_model.unique_together or {}) do
    local key = table.concat(array(uniques):slice():sort(), ',')
    old_map[key] = array(uniques)
  end

  for _, uniques in ipairs(new_model.unique_together or {}) do
    local key = table.concat(array(uniques):slice():sort(), ',')
    new_map[key] = array(uniques)
  end

  -- 删除旧约束
  for key, uniques in pairs(old_map) do
    if not new_map[key] then
      tokens[#tokens + 1] = format("ALTER TABLE %s DROP CONSTRAINT %s_%s_key",
        smart_quote(new_model.table_name), new_model.table_name, uniques:join('_'))
    end
  end

  -- 添加新约束
  for key, uniques in pairs(new_map) do
    if not old_map[key] then
      tokens[#tokens + 1] = format("ALTER TABLE %s ADD CONSTRAINT %s_%s_key UNIQUE (%s)",
        smart_quote(new_model.table_name), new_model.table_name, uniques:join('_'), uniques:join(', '))
    end
  end

  return tokens
end

-- 检测字段重命名
local function detect_field_renames(old_model, new_model)
  local renames = {}
  local old_used = {}

  -- 序列化字段用于比较
  local function serialize_field_for_compare(field)
    local tokens = {}
    local compare_attrs = { 'type', 'db_type', 'null', 'default', 'index', 'unique', 'primary_key',
      'serial', 'maxlength', 'length', 'timezone', 'precision', 'reference_column',
      'on_delete', 'on_update', 'auto_now_add', 'label' }
    for _, attr in ipairs(compare_attrs) do
      local val = field[attr]
      if attr == 'reference' and val then
        val = val.table_name
      end
      tokens[#tokens + 1] = format("%s:%s", attr, val)
    end
    return table.concat(tokens, '|')
  end

  -- 查找可能的重命名
  for _, new_name in ipairs(new_model.field_names) do
    local new_field = new_model.fields[new_name]
    if not old_model.fields[new_name] then
      -- 新字段不存在于旧模型中，检查是否是重命名
      local new_serialized = serialize_field_for_compare(new_field)
      local candidates = {}

      for old_name, old_field in pairs(old_model.fields) do
        if not old_used[old_name] then
          local old_serialized = serialize_field_for_compare(old_field)
          if new_serialized == old_serialized then
            candidates[#candidates + 1] = old_name
          end
        end
      end

      if #candidates == 1 then
        renames[candidates[1]] = new_name
        old_used[candidates[1]] = true
      end
    end
  end

  return renames
end

-- 主要的模型比较函数
local function compare_models(old_model, new_model)
  if type(new_model.field_names) ~= 'table' then
    error(format("invalid model json:%s,%s", new_model.table_name, type(new_model.field_names)))
  end

  local all_tokens = {}
  local rename_tokens = {}
  local constraint_tokens = compare_unique_together(old_model, new_model)

  -- 检测字段重命名
  local renames = detect_field_renames(old_model, new_model)

  -- 生成重命名语句
  for old_name, new_name in pairs(renames) do
    rename_tokens[#rename_tokens + 1] = format("ALTER TABLE %s RENAME %s TO %s",
      smart_quote(new_model.table_name), old_name, new_name)
  end

  -- 处理字段变更
  for _, name in ipairs(new_model.field_names) do
    local new_field = new_model.fields[name]
    local old_field = old_model.fields[name]

    if not new_field then
      error(format("invalid field name %s for model %s", name, new_model.table_name))
    elseif not old_field then
      -- 检查是否是重命名操作
      local is_rename = false
      for old_name, new_name in pairs(renames) do
        if new_name == name then
          is_rename = true
          break
        end
      end

      if not is_rename then
        -- 添加新字段
        local field_sql, table_tokens = get_field_create_sql(new_model.table_name, new_field)
        all_tokens[#all_tokens + 1] = format("ALTER TABLE %s ADD COLUMN %s",
          smart_quote(new_model.table_name), field_sql)
        utils.list_extend(all_tokens, table_tokens)
      end
    else
      -- 比较字段变更
      if old_field.type == new_field.type then
        local change_tokens = compare_field_changes(new_model.table_name, old_field, new_field)
        utils.list_extend(all_tokens, change_tokens)
      else
        -- 处理类型变更和外键变更
        local fk_tokens = compare_foreign_key_changes(new_model.table_name, old_field, new_field)
        utils.list_extend(all_tokens, fk_tokens)

        local change_tokens = compare_field_changes(new_model.table_name, old_field, new_field)
        utils.list_extend(all_tokens, change_tokens)
      end
    end
  end

  -- 删除不存在的字段
  for _, name in ipairs(old_model.field_names) do
    local new_field = new_model.fields[name]
    if not new_field and not renames[name] then
      all_tokens[#all_tokens + 1] = format("ALTER TABLE %s DROP COLUMN %s",
        smart_quote(new_model.table_name), name)
    end
  end

  -- 组合所有SQL语句
  local final_tokens = {}
  utils.list_extend(final_tokens, rename_tokens)
  utils.list_extend(final_tokens, all_tokens)
  utils.list_extend(final_tokens, constraint_tokens)

  return final_tokens
end

-- 创建表的SQL
local function create_table_sql(model)
  local column_tokens = {}
  local table_tokens = {}

  for _, name in ipairs(model.field_names) do
    local field = model.fields[name]
    local field_sql, extra_tokens = get_field_create_sql(model.table_name, field)
    column_tokens[#column_tokens + 1] = field_sql
    utils.list_extend(table_tokens, extra_tokens)
  end

  -- 添加unique_together约束
  for _, unique_group in ipairs(model.unique_together or {}) do
    column_tokens[#column_tokens + 1] = format("UNIQUE(%s)", table.concat(unique_group, ', '))
  end

  local tmp_token = model.tmp and 'TEMPORARY ' or ''
  local column_token = table.concat(column_tokens, ",\n  ")
  local main_token = format("CREATE %sTABLE %s(\n  %s\n)", tmp_token, smart_quote(model.table_name), column_token)

  return table.concat(utils.list({ main_token }, table_tokens), ";\n")
end

-- 主要的迁移函数
local function generate_migration_sql(old_model, new_model)
  if not old_model then
    -- 创建新表
    return create_table_sql(new_model)
  else
    -- 比较并生成迁移SQL
    local tokens = compare_models(old_model, new_model)
    return table.concat(tokens, ";\n")
  end
end

return {
  generate_migration_sql = generate_migration_sql,
  create_table_sql = create_table_sql,
  compare_models = compare_models
}
