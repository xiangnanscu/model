import { describe, test, expect } from "vitest";
import { generate_migration_sql, create_table_sql, compare_models } from "../lib/migrate.mjs";

// 测试数据
const test_model = {
  table_name: "users",
  field_names: ["id", "name", "email", "created_at"],
  fields: {
    id: {
      name: "id",
      type: "integer",
      primary_key: true,
      serial: true,
      null: false,
    },
    name: {
      name: "name",
      type: "string",
      maxlength: 100,
      null: false,
    },
    email: {
      name: "email",
      type: "email",
      maxlength: 255,
      unique: true,
      null: false,
    },
    created_at: {
      name: "created_at",
      type: "datetime",
      auto_now_add: true,
      null: false,
    },
  },
};

const updated_model = {
  table_name: "users",
  field_names: ["id", "name", "email", "phone", "created_at"],
  fields: {
    id: {
      name: "id",
      type: "integer",
      primary_key: true,
      serial: true,
      null: false,
    },
    name: {
      name: "name",
      type: "string",
      maxlength: 150, // 长度变更
      null: false,
    },
    email: {
      name: "email",
      type: "email",
      maxlength: 255,
      unique: true,
      null: false,
    },
    phone: {
      name: "phone",
      type: "string",
      maxlength: 20,
      null: true, // 新字段
    },
    created_at: {
      name: "created_at",
      type: "datetime",
      auto_now_add: true,
      null: false,
    },
  },
};

console.log("=== 测试创建表SQL ===");
const create_sql = create_table_sql(test_model);
console.log(create_sql);

console.log("\n=== 测试迁移SQL ===");
const migration_sql = generate_migration_sql(test_model, updated_model);
console.log(migration_sql);

console.log("\n=== 测试从无到有的迁移 ===");
const new_table_sql = generate_migration_sql(null, test_model);
console.log(new_table_sql);

console.log("\n测试完成！");

describe("数据库迁移工具测试", () => {
  // 基础模型定义
  const basic_model = {
    table_name: "users",
    field_names: ["id", "name", "email", "created_at"],
    fields: {
      id: {
        name: "id",
        type: "integer",
        primary_key: true,
        serial: true,
        null: false,
      },
      name: {
        name: "name",
        type: "string",
        maxlength: 100,
        null: false,
      },
      email: {
        name: "email",
        type: "email",
        maxlength: 255,
        unique: true,
        null: false,
      },
      created_at: {
        name: "created_at",
        type: "datetime",
        auto_now_add: true,
        null: false,
      },
    },
  };

  // 外键模型
  const category_model = {
    table_name: "categories",
    field_names: ["id", "name"],
    primary_key: "id",
    fields: {
      id: {
        name: "id",
        type: "integer",
        primary_key: true,
        serial: true,
        null: false,
      },
      name: {
        name: "name",
        type: "string",
        maxlength: 50,
        null: false,
      },
    },
  };

  const product_model = {
    table_name: "products",
    field_names: ["id", "name", "category_id", "price", "data"],
    fields: {
      id: {
        name: "id",
        type: "integer",
        primary_key: true,
        serial: true,
        null: false,
      },
      name: {
        name: "name",
        type: "string",
        maxlength: 200,
        null: false,
      },
      category_id: {
        name: "category_id",
        type: "foreignkey",
        reference: category_model,
        on_delete: "CASCADE",
        on_update: "CASCADE",
        null: false,
      },
      price: {
        name: "price",
        type: "float",
        precision: 2,
        default: 0.0,
        null: false,
      },
      data: {
        name: "data",
        type: "json",
        null: true,
      },
    },
  };

  describe("create_table_sql 测试", () => {
    test("基础表创建", () => {
      const sql = create_table_sql(basic_model);
      expect(sql).toContain("CREATE TABLE users");
      expect(sql).toContain("id SERIAL PRIMARY KEY NOT NULL");
      expect(sql).toContain("name varchar(100) NOT NULL");
      expect(sql).toContain("email varchar(255) NOT NULL UNIQUE");
      expect(sql).toContain("created_at timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP");
    });

    test("外键表创建", () => {
      const sql = create_table_sql(product_model);
      expect(sql).toContain("CREATE TABLE products");
      expect(sql).toContain(
        'category_id integer REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE NOT NULL',
      );
      expect(sql).toContain("price float(2) NOT NULL DEFAULT 0");
      expect(sql).toContain("data jsonb");
    });

    test("带索引的表创建", () => {
      const model_with_index = {
        table_name: "test_table",
        field_names: ["id", "indexed_field"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          indexed_field: {
            name: "indexed_field",
            type: "string",
            maxlength: 100,
            index: true,
            null: true,
          },
        },
      };
      const sql = create_table_sql(model_with_index);
      expect(sql).toContain(
        "CREATE INDEX test_table_indexed_field_idx ON test_table (indexed_field)",
      );
    });

    test("带unique_together的表创建", () => {
      const model_with_unique = {
        table_name: "test_unique",
        field_names: ["id", "field1", "field2"],
        unique_together: [["field1", "field2"]],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          field1: {
            name: "field1",
            type: "string",
            maxlength: 50,
            null: false,
          },
          field2: {
            name: "field2",
            type: "string",
            maxlength: 50,
            null: false,
          },
        },
      };
      const sql = create_table_sql(model_with_unique);
      expect(sql).toContain("UNIQUE(field1, field2)");
    });

    test("临时表创建", () => {
      const temp_model = {
        ...basic_model,
        tmp: true,
      };
      const sql = create_table_sql(temp_model);
      expect(sql).toContain("CREATE TEMPORARY TABLE users");
    });
  });

  describe("字段类型测试", () => {
    test("各种字段类型", () => {
      const type_model = {
        table_name: "type_test",
        field_names: [
          "uuid_field",
          "text_field",
          "boolean_field",
          "date_field",
          "time_field",
          "year_field",
          "month_field",
          "year_month_field",
        ],
        fields: {
          uuid_field: {
            name: "uuid_field",
            type: "uuid",
            null: false,
          },
          text_field: {
            name: "text_field",
            type: "text",
            null: true,
          },
          boolean_field: {
            name: "boolean_field",
            type: "boolean",
            default: false,
            null: false,
          },
          date_field: {
            name: "date_field",
            type: "date",
            null: true,
          },
          time_field: {
            name: "time_field",
            type: "time",
            precision: 3,
            timezone: true,
            null: true,
          },
          year_field: {
            name: "year_field",
            type: "year",
            null: true,
          },
          month_field: {
            name: "month_field",
            type: "month",
            null: true,
          },
          year_month_field: {
            name: "year_month_field",
            type: "year_month",
            null: true,
          },
        },
      };
      const sql = create_table_sql(type_model);
      expect(sql).toContain("uuid_field uuid NOT NULL DEFAULT gen_random_uuid()");
      expect(sql).toContain("text_field text");
      expect(sql).toContain("boolean_field boolean NOT NULL DEFAULT FALSE");
      expect(sql).toContain("date_field date");
      expect(sql).toContain("time_field time(3) WITH TIME ZONE");
      expect(sql).toContain("year_field integer");
      expect(sql).toContain("month_field integer");
      expect(sql).toContain("year_month_field varchar");
    });
  });

  describe("generate_migration_sql 测试", () => {
    test("从无到有创建表", () => {
      const sql = generate_migration_sql(null, basic_model);
      expect(sql).toContain("CREATE TABLE users");
      expect(sql).toContain("id SERIAL PRIMARY KEY NOT NULL");
    });

    test("添加新字段", () => {
      const updated_model = {
        ...basic_model,
        field_names: [...basic_model.field_names, "phone"],
        fields: {
          ...basic_model.fields,
          phone: {
            name: "phone",
            type: "string",
            maxlength: 20,
            null: true,
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users ADD COLUMN phone varchar(20)");
    });

    test("删除字段", () => {
      const reduced_model = {
        table_name: "users",
        field_names: ["id", "name", "created_at"],
        fields: {
          id: basic_model.fields.id,
          name: basic_model.fields.name,
          created_at: basic_model.fields.created_at,
        },
      };
      const sql = generate_migration_sql(basic_model, reduced_model);
      expect(sql).toContain("ALTER TABLE users DROP COLUMN email");
    });

    test("修改字段长度", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          name: {
            ...basic_model.fields.name,
            maxlength: 150,
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users ALTER COLUMN name TYPE varchar(150)");
    });

    test("修改字段类型", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          name: {
            ...basic_model.fields.name,
            type: "text",
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users ALTER COLUMN name TYPE text");
    });

    test("修改NULL约束", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          email: {
            ...basic_model.fields.email,
            null: true,
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users ALTER COLUMN email DROP NOT NULL");
    });

    test("添加/删除唯一约束", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          email: {
            ...basic_model.fields.email,
            unique: false,
          },
          name: {
            ...basic_model.fields.name,
            unique: true,
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users DROP CONSTRAINT users_email_key");
      expect(sql).toContain("ALTER TABLE users ADD CONSTRAINT users_name_key UNIQUE (name)");
    });

    test("添加/删除索引", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          name: {
            ...basic_model.fields.name,
            index: true,
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("CREATE INDEX users_name_idx ON users (name)");
    });

    test("修改默认值", () => {
      const updated_model = {
        ...basic_model,
        fields: {
          ...basic_model.fields,
          name: {
            ...basic_model.fields.name,
            default: "Unknown",
          },
        },
      };
      const sql = generate_migration_sql(basic_model, updated_model);
      expect(sql).toContain("ALTER TABLE users ALTER COLUMN name SET DEFAULT 'Unknown'");
    });
  });

  describe("外键测试", () => {
    test("添加外键", () => {
      const old_model = {
        table_name: "products",
        field_names: ["id", "name", "category_id"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          name: {
            name: "name",
            type: "string",
            maxlength: 200,
            null: false,
          },
          category_id: {
            name: "category_id",
            type: "integer",
            null: false,
          },
        },
      };

      const new_model = {
        table_name: "products",
        field_names: ["id", "name", "category_id"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          name: {
            name: "name",
            type: "string",
            maxlength: 200,
            null: false,
          },
          category_id: {
            name: "category_id",
            type: "foreignkey",
            reference: category_model,
            on_delete: "CASCADE",
            null: false,
          },
        },
      };

      const sql = generate_migration_sql(old_model, new_model);
      expect(sql).toContain(
        'ALTER TABLE products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE',
      );
    });

    test("删除外键", () => {
      const old_model = {
        table_name: "products",
        field_names: ["id", "name", "category_id"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          name: {
            name: "name",
            type: "string",
            maxlength: 200,
            null: false,
          },
          category_id: {
            name: "category_id",
            type: "foreignkey",
            reference: category_model,
            on_delete: "CASCADE",
            null: false,
          },
        },
      };

      const new_model = {
        table_name: "products",
        field_names: ["id", "name", "category_id"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          name: {
            name: "name",
            type: "string",
            maxlength: 200,
            null: false,
          },
          category_id: {
            name: "category_id",
            type: "integer",
            null: false,
          },
        },
      };

      const sql = generate_migration_sql(old_model, new_model);
      expect(sql).toContain("ALTER TABLE products DROP CONSTRAINT products_category_id_fkey");
    });
  });

  describe("unique_together 测试", () => {
    test("添加unique_together约束", () => {
      const old_model = {
        table_name: "test_table",
        field_names: ["id", "field1", "field2"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          field1: {
            name: "field1",
            type: "string",
            maxlength: 50,
            null: false,
          },
          field2: {
            name: "field2",
            type: "string",
            maxlength: 50,
            null: false,
          },
        },
      };

      const new_model = {
        ...old_model,
        unique_together: [["field1", "field2"]],
      };

      const sql = generate_migration_sql(old_model, new_model);
      expect(sql).toContain(
        "ALTER TABLE test_table ADD CONSTRAINT test_table_field1_field2_key UNIQUE (field1, field2)",
      );
    });

    test("删除unique_together约束", () => {
      const old_model = {
        table_name: "test_table",
        field_names: ["id", "field1", "field2"],
        unique_together: [["field1", "field2"]],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          field1: {
            name: "field1",
            type: "string",
            maxlength: 50,
            null: false,
          },
          field2: {
            name: "field2",
            type: "string",
            maxlength: 50,
            null: false,
          },
        },
      };

      const new_model = {
        ...old_model,
        unique_together: [],
      };

      const sql = generate_migration_sql(old_model, new_model);
      expect(sql).toContain("ALTER TABLE test_table DROP CONSTRAINT test_table_field1_field2_key");
    });
  });

  describe("字段重命名检测测试", () => {
    test("检测字段重命名", () => {
      const old_model = {
        table_name: "users",
        field_names: ["id", "old_name"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          old_name: {
            name: "old_name",
            type: "string",
            maxlength: 100,
            null: false,
          },
        },
      };

      const new_model = {
        table_name: "users",
        field_names: ["id", "new_name"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          new_name: {
            name: "new_name",
            type: "string",
            maxlength: 100,
            null: false,
          },
        },
      };

      const sql = generate_migration_sql(old_model, new_model);
      expect(sql).toContain("ALTER TABLE users RENAME old_name TO new_name");
    });
  });

  describe("错误处理测试", () => {
    test("不支持的类型转换", () => {
      const old_model = {
        table_name: "test_table",
        field_names: ["id", "test_field"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          test_field: {
            name: "test_field",
            type: "string",
            maxlength: 100,
            null: false,
          },
        },
      };

      const new_model = {
        table_name: "test_table",
        field_names: ["id", "test_field"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          test_field: {
            name: "test_field",
            type: "json", // 不支持从string到json的转换
            null: false,
          },
        },
      };

      expect(() => {
        generate_migration_sql(old_model, new_model);
      }).toThrow("is not supported");
    });

    test("无效的模型结构", () => {
      const invalid_model = {
        table_name: "test_table",
        field_names: "not_an_array", // 应该是数组
        fields: {},
      };

      expect(() => {
        compare_models({}, invalid_model);
      }).toThrow("invalid model json");
    });
  });

  describe("默认值处理测试", () => {
    test("各种默认值类型", () => {
      const model_with_defaults = {
        table_name: "defaults_test",
        field_names: ["id", "string_field", "number_field", "boolean_field", "json_field"],
        fields: {
          id: {
            name: "id",
            type: "integer",
            primary_key: true,
            serial: true,
            null: false,
          },
          string_field: {
            name: "string_field",
            type: "string",
            maxlength: 100,
            default: "default_value",
            null: false,
          },
          number_field: {
            name: "number_field",
            type: "integer",
            default: 42,
            null: false,
          },
          boolean_field: {
            name: "boolean_field",
            type: "boolean",
            default: true,
            null: false,
          },
          json_field: {
            name: "json_field",
            type: "json",
            default: { key: "value" },
            null: true,
          },
        },
      };

      const sql = create_table_sql(model_with_defaults);
      expect(sql).toContain("string_field varchar(100) NOT NULL DEFAULT 'default_value'");
      expect(sql).toContain("number_field integer NOT NULL DEFAULT 42");
      expect(sql).toContain("boolean_field boolean NOT NULL DEFAULT TRUE");
      expect(sql).toContain('json_field jsonb DEFAULT \'{"key":"value"}\'');
    });
  });
});
