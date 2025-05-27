// 数据库迁移工具 - ES6版本
// 从Lua版本转换而来

import { smart_quote } from "./utils.mjs";

/**
 * 序列化默认值
 */
function serialize_default(val) {
  if (typeof val === "string") {
    return `'${val.replace(/'/g, "''")}'`;
  } else if (val === false) {
    return "FALSE";
  } else if (val === true) {
    return "TRUE";
  } else if (typeof val === "number") {
    return val.toString();
  } else if (typeof val === "function") {
    return serialize_default(val());
  } else if (typeof val === "object" && val !== null) {
    try {
      const jsonStr = JSON.stringify(val);
      return serialize_default(jsonStr);
    } catch (err) {
      throw new Error("table as a default value but can not be encoded");
    }
  } else if (val === null || val === undefined) {
    return "NULL";
  } else {
    throw new Error(`type \`${typeof val}\` is not supported as a default value`);
  }
}

/**
 * 获取外键引用的字段
 */
function get_foreign_field(field) {
  const fk_model = field.reference;
  const fk_name = field.reference_column || fk_model.primary_key;

  if (!fk_model.primary_key) {
    throw new Error(
      `model '${fk_model.table_name}' referenced by foreignkey must define primary_key`,
    );
  }

  const fk = fk_model.fields[fk_name];
  if (!fk) {
    throw new Error(`invalid field name '${fk_name}' for table '${fk_model.table_name}'`);
  }

  return fk;
}

/**
 * 获取字段的数据库类型
 */
function get_db_type(field) {
  const field_type = field.type;

  if (["string", "id_card", "password", "email", "alioss", "alioss_image"].includes(field_type)) {
    return `varchar(${field.maxlength || field.length})`;
  } else if (field_type === "uuid") {
    return "uuid";
  } else if (field_type === "text") {
    return "text";
  } else if (field_type === "integer") {
    return "integer";
  } else if (field_type === "float") {
    if (!field.precision) {
      return "float";
    } else {
      return `float(${field.precision})`;
    }
  } else if (["json", "array", "table", "alioss_list", "alioss_image_list"].includes(field_type)) {
    return "jsonb";
  } else if (field_type === "boolean") {
    return "boolean";
  } else if (field_type === "date") {
    return "date";
  } else if (["year", "month"].includes(field_type)) {
    return "integer";
  } else if (field_type === "year_month") {
    return "varchar";
  } else if (["datetime", "time"].includes(field_type)) {
    const base_type = field_type === "datetime" ? "timestamp" : "time";
    const timezone_token = field.timezone ? " WITH TIME ZONE" : "";
    return `${base_type}(${field.precision || 0})${timezone_token}`;
  } else if (field_type === "foreignkey") {
    // 对于外键，需要获取引用字段的类型
    const ref_field = get_foreign_field(field);
    return get_db_type(ref_field);
  } else {
    // 其他类型默认为varchar
    return `varchar(${field.maxlength || field.length || 255})`;
  }
}

/**
 * 生成约束名称
 */
function get_constraint_name(table_name, field_name, constraint_type) {
  if (constraint_type === "unique") {
    return `${table_name}_${field_name}_key`;
  } else if (constraint_type === "index") {
    return `${table_name}_${field_name}_idx`;
  } else if (constraint_type === "foreign_key") {
    return `${table_name}_${field_name}_fkey`;
  }
}

/**
 * 生成外键引用语句
 */
function get_foreign_key_reference(field) {
  const fk_model = field.reference;
  const fk = get_foreign_field(field);
  const fk_name = fk.name;
  return `REFERENCES "${fk_model.table_name}" ("${smart_quote(fk_name)}") ON DELETE ${field.on_delete || "NO ACTION"} ON UPDATE ${field.on_update || "CASCADE"}`;
}

/**
 * 生成字段创建语句
 */
function get_field_create_sql(table_name, field) {
  const tokens = [];
  const table_tokens = [];

  // 基础类型
  let db_type = get_db_type(field);

  // 特殊处理
  if (field.serial) {
    db_type = "SERIAL";
    field.null = false;
  } else if (field.type === "foreignkey") {
    const ref_sql = get_foreign_key_reference(field);
    db_type = `${db_type} ${ref_sql}`;
  }

  // 主键
  if (field.primary_key) {
    field.null = false;
    tokens.push("PRIMARY KEY");
  }

  // 非空约束
  if (!field.null) {
    tokens.push("NOT NULL");
  }

  // 默认值
  if (field.type === "uuid") {
    tokens.push("DEFAULT gen_random_uuid()");
  } else if (field.type === "datetime" && field.auto_now_add) {
    tokens.push("DEFAULT CURRENT_TIMESTAMP");
  } else if (field.default !== undefined && field.default !== null) {
    if (field.default === "CURRENT_TIMESTAMP") {
      // 模拟ngx.localtime
      tokens.push("DEFAULT CURRENT_TIMESTAMP");
    } else {
      try {
        const val = serialize_default(field.default);
        tokens.push("DEFAULT " + val);
      } catch (err) {
        throw new Error(
          `error when processing default value of field ${field.name} of ${table_name}: ${err.message}`,
        );
      }
    }
  }

  // 唯一约束
  if (field.unique) {
    tokens.push("UNIQUE");
  } else if (field.index) {
    // 创建索引
    const index_name = get_constraint_name(table_name, field.name, "index");
    table_tokens.push(
      `CREATE INDEX ${index_name} ON ${smart_quote(table_name)} (${smart_quote(field.name)})`,
    );
  }

  const field_sql = `${smart_quote(field.name)} ${db_type} ${tokens.join(" ")}`;
  return [field_sql, table_tokens];
}

/**
 * 比较字段变化并生成ALTER语句
 */
function compare_field_changes(table_name, old_field, new_field) {
  const tokens = [];

  // 比较类型
  if (old_field.type !== new_field.type) {
    const col = new_field.name;
    if (["string", "integer"].includes(new_field.type)) {
      const using_type = new_field.type === "string" ? "varchar" : new_field.type;
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${col} TYPE ${get_db_type(new_field)} USING(${col}::${using_type})`,
      );
    } else if (new_field.type === "text" && old_field.type === "string") {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${col} TYPE ${get_db_type(new_field)}`,
      );
    } else if (new_field.type === "year_month") {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${col} TYPE ${get_db_type(new_field)} USING(${col}::${new_field.db_type || "varchar"})`,
      );
    } else if (new_field.type === "date") {
      tokens.push(`ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${col} DROP DEFAULT`);
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${col} TYPE ${get_db_type(new_field)}`,
      );
    } else if (new_field.type === "foreignkey" && old_field.type === "integer") {
      // 从integer到foreignkey的转换是允许的，因为底层类型相同
      // 外键约束会在compare_foreign_key_changes中处理
    } else if (old_field.type === "foreignkey" && new_field.type === "integer") {
      // 从foreignkey到integer的转换也是允许的
      // 外键约束会在compare_foreign_key_changes中处理
    } else if (new_field.db_type && old_field.db_type && new_field.db_type === old_field.db_type) {
      // 如果db_type相同，则不需要转换
    } else {
      throw new Error(
        `table \`${table_name}\` field \`${new_field.name}\` alter type from \`${old_field.type}\` to \`${new_field.type}\` is not supported`,
      );
    }
  }

  // 比较NULL约束
  const old_null = !!old_field.null;
  const new_null = !!new_field.null;
  if (old_null !== new_null) {
    if (old_null && !new_null) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} SET NOT NULL`,
      );
    } else if (!old_null && new_null) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} DROP NOT NULL`,
      );
    }
  }

  // 比较默认值
  if (old_field.default !== new_field.default) {
    if (
      !(
        typeof old_field.default === "object" &&
        typeof new_field.default === "object" &&
        JSON.stringify(old_field.default) === JSON.stringify(new_field.default)
      )
    ) {
      if (new_field.default !== undefined && new_field.default !== null) {
        try {
          const val = serialize_default(new_field.default);
          tokens.push(
            `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} SET DEFAULT ${val}`,
          );
        } catch (err) {
          throw new Error(`error when processing default value: ${err.message}`);
        }
      } else {
        tokens.push(
          `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} DROP DEFAULT`,
        );
      }
    }
  }

  // 比较auto_now_add
  if (old_field.auto_now_add !== new_field.auto_now_add) {
    if (new_field.auto_now_add) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} SET DEFAULT CURRENT_TIMESTAMP`,
      );
    } else {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} DROP DEFAULT`,
      );
    }
  }

  // 比较主键
  const old_pk = !!old_field.primary_key;
  const new_pk = !!new_field.primary_key;
  if (old_pk !== new_pk) {
    if (old_pk && !new_pk) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} DROP CONSTRAINT ${smart_quote(new_field.name)}_pkey`,
      );
    } else if (!old_pk && new_pk) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ADD PRIMARY KEY (${smart_quote(new_field.name)})`,
      );
    }
  }

  // 比较唯一约束
  const old_unique = !!old_field.unique;
  const new_unique = !!new_field.unique;
  if (old_unique !== new_unique) {
    const constraint_name = get_constraint_name(table_name, new_field.name, "unique");
    if (old_unique && !new_unique) {
      tokens.push(`ALTER TABLE ${smart_quote(table_name)} DROP CONSTRAINT ${constraint_name}`);
    } else if (!old_unique && new_unique) {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ADD CONSTRAINT ${constraint_name} UNIQUE (${smart_quote(new_field.name)})`,
      );
    }
  }

  // 比较索引
  const old_index = !!old_field.index;
  const new_index = !!new_field.index;
  if (old_index !== new_index) {
    const index_name = get_constraint_name(table_name, new_field.name, "index");
    if (old_index && !new_index) {
      tokens.push(`DROP INDEX ${index_name}`);
    } else if (!old_index && new_index) {
      tokens.push(
        `CREATE INDEX ${index_name} ON ${smart_quote(table_name)} (${smart_quote(new_field.name)})`,
      );
    }
  }

  // 比较长度/精度等
  if (old_field.maxlength !== new_field.maxlength || old_field.length !== new_field.length) {
    if (new_field.type === "string") {
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} TYPE varchar(${new_field.maxlength || new_field.length})`,
      );
    }
  }

  if (old_field.precision !== new_field.precision && new_field.type === "datetime") {
    const timezone_token = new_field.timezone ? " WITH TIME ZONE" : "";
    tokens.push(
      `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} TYPE timestamp(${new_field.precision})${timezone_token}`,
    );
  }

  if (old_field.timezone !== new_field.timezone && new_field.type === "datetime") {
    const timezone_token = new_field.timezone ? " WITH TIME ZONE" : "";
    tokens.push(
      `ALTER TABLE ${smart_quote(table_name)} ALTER COLUMN ${smart_quote(new_field.name)} TYPE timestamp(${new_field.precision || 0})${timezone_token}`,
    );
  }

  return tokens;
}

/**
 * 比较外键变化
 */
function compare_foreign_key_changes(table_name, old_field, new_field) {
  const tokens = [];

  // 检查是否都是外键
  const old_is_fk = old_field.reference !== undefined && old_field.reference !== null;
  const new_is_fk = new_field.reference !== undefined && new_field.reference !== null;

  if (old_is_fk && !new_is_fk) {
    // 删除外键约束
    const constraint_name = get_constraint_name(table_name, old_field.name, "foreign_key");
    tokens.push(`ALTER TABLE ${smart_quote(table_name)} DROP CONSTRAINT ${constraint_name}`);
  } else if (!old_is_fk && new_is_fk) {
    // 添加外键约束
    const constraint_name = get_constraint_name(table_name, new_field.name, "foreign_key");
    const ref_sql = get_foreign_key_reference(new_field);
    tokens.push(
      `ALTER TABLE ${smart_quote(table_name)} ADD CONSTRAINT ${constraint_name} FOREIGN KEY (${smart_quote(new_field.name)}) ${ref_sql}`,
    );
  } else if (old_is_fk && new_is_fk) {
    // 比较外键引用是否相同
    const old_ref = old_field.reference;
    const new_ref = new_field.reference;

    let same = true;
    if (
      old_ref.table_name !== new_ref.table_name ||
      (old_field.reference_column || old_ref.primary_key) !==
        (new_field.reference_column || new_ref.primary_key) ||
      old_field.on_delete !== new_field.on_delete ||
      old_field.on_update !== new_field.on_update
    ) {
      same = false;
    }

    if (!same) {
      // 先删除旧约束，再添加新约束
      const constraint_name = get_constraint_name(table_name, old_field.name, "foreign_key");
      tokens.push(`ALTER TABLE ${smart_quote(table_name)} DROP CONSTRAINT ${constraint_name}`);

      const new_constraint_name = get_constraint_name(table_name, new_field.name, "foreign_key");
      const ref_sql = get_foreign_key_reference(new_field);
      tokens.push(
        `ALTER TABLE ${smart_quote(table_name)} ADD CONSTRAINT ${new_constraint_name} FOREIGN KEY (${smart_quote(new_field.name)}) ${ref_sql}`,
      );
    }
  }

  return tokens;
}

/**
 * 比较unique_together约束
 */
function compare_unique_together(old_model, new_model) {
  const tokens = [];
  const old_map = {};
  const new_map = {};

  // 构建映射
  for (const uniques of old_model.unique_together || []) {
    const key = [...uniques].sort().join(",");
    old_map[key] = uniques;
  }

  for (const uniques of new_model.unique_together || []) {
    const key = [...uniques].sort().join(",");
    new_map[key] = uniques;
  }

  // 删除旧约束
  for (const [key, uniques] of Object.entries(old_map)) {
    if (!new_map[key]) {
      tokens.push(
        `ALTER TABLE ${smart_quote(new_model.table_name)} DROP CONSTRAINT ${new_model.table_name}_${uniques.join("_")}_key`,
      );
    }
  }

  // 添加新约束
  for (const [key, uniques] of Object.entries(new_map)) {
    if (!old_map[key]) {
      tokens.push(
        `ALTER TABLE ${smart_quote(new_model.table_name)} ADD CONSTRAINT ${new_model.table_name}_${uniques.join("_")}_key UNIQUE (${uniques.join(", ")})`,
      );
    }
  }

  return tokens;
}

/**
 * 检测字段重命名
 */
function detect_field_renames(old_model, new_model) {
  const renames = {};
  const old_used = {};

  // 序列化字段用于比较
  function serialize_field_for_compare(field) {
    const tokens = [];
    const compare_attrs = [
      "type",
      "db_type",
      "null",
      "default",
      "index",
      "unique",
      "primary_key",
      "serial",
      "maxlength",
      "length",
      "timezone",
      "precision",
      "reference_column",
      "on_delete",
      "on_update",
      "auto_now_add",
      "label",
    ];

    for (const attr of compare_attrs) {
      let val = field[attr];
      if (attr === "reference" && val) {
        val = val.table_name;
      }
      tokens.push(`${attr}:${val}`);
    }
    return tokens.join("|");
  }

  // 查找可能的重命名
  for (const new_name of new_model.field_names) {
    const new_field = new_model.fields[new_name];
    if (!old_model.fields[new_name]) {
      // 新字段不存在于旧模型中，检查是否是重命名
      const new_serialized = serialize_field_for_compare(new_field);
      const candidates = [];

      for (const [old_name, old_field] of Object.entries(old_model.fields)) {
        if (!old_used[old_name]) {
          const old_serialized = serialize_field_for_compare(old_field);
          if (new_serialized === old_serialized) {
            candidates.push(old_name);
          }
        }
      }

      if (candidates.length === 1) {
        renames[candidates[0]] = new_name;
        old_used[candidates[0]] = true;
      }
    }
  }

  return renames;
}

/**
 * 主要的模型比较函数
 */
function compare_models(old_model, new_model) {
  if (!Array.isArray(new_model.field_names)) {
    throw new Error(`invalid model json:${new_model.table_name},${typeof new_model.field_names}`);
  }

  const all_tokens = [];
  const rename_tokens = [];
  const constraint_tokens = compare_unique_together(old_model, new_model);

  // 检测字段重命名
  const renames = detect_field_renames(old_model, new_model);

  // 生成重命名语句
  for (const [old_name, new_name] of Object.entries(renames)) {
    rename_tokens.push(
      `ALTER TABLE ${smart_quote(new_model.table_name)} RENAME ${old_name} TO ${new_name}`,
    );
  }

  // 处理字段变更
  for (const name of new_model.field_names) {
    const new_field = new_model.fields[name];
    const old_field = old_model.fields[name];

    if (!new_field) {
      throw new Error(`invalid field name ${name} for model ${new_model.table_name}`);
    } else if (!old_field) {
      // 检查是否是重命名操作
      let is_rename = false;
      for (const [old_name, new_name] of Object.entries(renames)) {
        if (new_name === name) {
          is_rename = true;
          break;
        }
      }

      if (!is_rename) {
        // 添加新字段
        const [field_sql, table_tokens] = get_field_create_sql(new_model.table_name, new_field);
        all_tokens.push(`ALTER TABLE ${smart_quote(new_model.table_name)} ADD COLUMN ${field_sql}`);
        all_tokens.push(...table_tokens);
      }
    } else {
      // 比较字段变更
      if (old_field.type === new_field.type) {
        const change_tokens = compare_field_changes(new_model.table_name, old_field, new_field);
        all_tokens.push(...change_tokens);
      } else {
        // 处理类型变更和外键变更
        const fk_tokens = compare_foreign_key_changes(new_model.table_name, old_field, new_field);
        all_tokens.push(...fk_tokens);

        const change_tokens = compare_field_changes(new_model.table_name, old_field, new_field);
        all_tokens.push(...change_tokens);
      }
    }
  }

  // 删除不存在的字段
  for (const name of old_model.field_names) {
    const new_field = new_model.fields[name];
    if (!new_field && !renames[name]) {
      all_tokens.push(`ALTER TABLE ${smart_quote(new_model.table_name)} DROP COLUMN ${name}`);
    }
  }

  // 组合所有SQL语句
  const final_tokens = [];
  final_tokens.push(...rename_tokens);
  final_tokens.push(...all_tokens);
  final_tokens.push(...constraint_tokens);

  return final_tokens;
}

/**
 * 创建表的SQL
 */
function create_table_sql(model) {
  const column_tokens = [];
  const table_tokens = [];

  for (const name of model.field_names) {
    const field = model.fields[name];
    const [field_sql, extra_tokens] = get_field_create_sql(model.table_name, field);
    column_tokens.push(field_sql);
    table_tokens.push(...extra_tokens);
  }

  // 添加unique_together约束
  for (const unique_group of model.unique_together || []) {
    column_tokens.push(`UNIQUE(${unique_group.join(", ")})`);
  }

  const tmp_token = model.tmp ? "TEMPORARY " : "";
  const column_token = column_tokens.join(",\n  ");
  const main_token = `CREATE ${tmp_token}TABLE ${smart_quote(model.table_name)}(\n  ${column_token}\n)`;

  return [main_token, ...table_tokens].join(";\n");
}

/**
 * 主要的迁移函数
 */
function generate_migration_sql(old_model, new_model) {
  if (!old_model) {
    // 创建新表
    return create_table_sql(new_model);
  } else {
    // 比较并生成迁移SQL
    const tokens = compare_models(old_model, new_model);
    return tokens.join(";\n");
  }
}

// 导出模块
export { generate_migration_sql, create_table_sql, compare_models };

export default {
  generate_migration_sql,
  create_table_sql,
  compare_models,
};
