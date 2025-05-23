/**
 * 从 SQL 部分提取列名
 * @param {string} sql_part - SQL 部分字符串
 * @returns {string|null} - 提取的列名或 null
 */
const extract_column_name = (sql_part) => {
  // 1. T.col, user.name 格式
  const table_column_match = sql_part.match(/^(\w+)\.(\w+)$/);
  if (table_column_match) {
    return table_column_match[2]; // 返回列名部分
  }

  // 2. T.col AS alias, col AS alias 格式
  const alias_match = sql_part.match(/[Aa][Ss]\s+(\w+)\s*$/);
  if (alias_match) {
    return alias_match[1]; // 返回别名
  }

  // 3. 忽略函数调用（包含括号的情况）
  if (sql_part.match(/\([^)]*\)/)) {
    return null;
  }

  // 4. 直接的列名
  const direct_column_match = sql_part.match(/^(\w+)$/);
  return direct_column_match ? direct_column_match[1] : null;
};

export { extract_column_name };

// 如果需要 CommonJS 导出，可以使用：
// module.exports = { extract_column_name };
