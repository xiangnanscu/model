---@param sql_part string
---@return string?
local function extract_column_name(sql_part)
  -- 1. T.col, user.name
  local _, col = sql_part:match("^([%w_]+)%.([%w_]+)$")
  if col then
    return col
  end

  -- 2.  T.col AS alias, col AS alias
  local alias = sql_part:match("[Aa][Ss]%s+([%w_]+)%s*$")
  if alias then
    return alias
  end

  -- 3. ignore function call
  if sql_part:match("%b()") then
    return nil
  end

  return sql_part:match("^([%w_]+)$")
end
