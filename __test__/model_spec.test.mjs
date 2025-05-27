/* eslint-disable no-undef */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Model from "~/lib/xodel";
import { create_table_sql } from "~/lib/migrate.mjs";
const { Q, F, Sum, Avg, Max, Min, Count } = Model;

process.env.SQL_WHOLE_MATCH = true;

// Database configuration
Model.db_config = {
  host: "localhost",
  port: "5432",
  database: "test",
  user: "postgres",
  password: "postgres",
  max: 20,
  idle_timeout: 20,
  connect_timeout: 3,
};

// Model definitions
const User = Model({
  table_name: "user",
  fields: {
    username: { type: "string", maxlength: 20, minlength: 2, unique: true },
    password: { type: "text" },
  },
});

const Blog = Model({
  table_name: "blog",
  fields: {
    name: { type: "string", maxlength: 20, minlength: 2, unique: true },
    tagline: { type: "text", default: "default tagline" },
  },
});

const BlogBin = Model({
  table_name: "blog_bin",
  mixins: [Blog],
  fields: {
    name: { type: "string", unique: false },
    note: { type: "text", default: "" },
  },
});

const Resume = Model({
  auto_primary_key: false,
  table_name: "resume",
  unique_together: ["start_date", "end_date", "company", "position"],
  fields: {
    start_date: { type: "date" },
    end_date: { type: "date" },
    company: { type: "string", maxlength: 20 },
    position: { type: "string", maxlength: 20 },
    description: { type: "string", maxlength: 200 },
  },
});

const Author = Model({
  table_name: "author",
  fields: {
    name: { label: "Name", type: "string", maxlength: 200, unique: true },
    email: { type: "email" },
    age: { type: "integer", max: 100, min: 10 },
    resume: { type: "table", model: Resume },
  },
});

const Entry = Model({
  table_name: "entry",
  fields: {
    blog_id: { type: "foreignkey", reference: Blog, related_query_name: "entry" },
    reposted_blog_id: { type: "foreignkey", reference: Blog, related_query_name: "reposted_entry" },
    headline: { type: "string", maxlength: 255, compact: false },
    body_text: { type: "text" },
    pub_date: { type: "date" },
    mod_date: { type: "date" },
    number_of_comments: { type: "integer", default: 0 },
    number_of_pingbacks: { type: "integer", default: 0 },
    rating: { type: "integer" },
  },
});

const ViewLog = Model({
  table_name: "view_log",
  fields: {
    entry_id: { type: "foreignkey", reference: Entry },
    ctime: { type: "datetime" },
  },
});

const Publisher = Model({
  table_name: "publisher",
  fields: {
    name: { type: "string", maxlength: 300 },
  },
});

const Book = Model({
  table_name: "book",
  fields: {
    name: { type: "string", maxlength: 300, compact: false },
    pages: { type: "integer" },
    price: { type: "float" },
    rating: { type: "float" },
    author: { type: "foreignkey", reference: Author },
    publisher_id: { type: "foreignkey", reference: Publisher },
    pubdate: { type: "date" },
  },
});

const Store = Model({
  table_name: "store",
  fields: {
    name: { type: "string", maxlength: 300 },
  },
});

const model_list = [User, Blog, BlogBin, Author, Entry, ViewLog, Publisher, Book, Store];

// Helper function to create tables using migrate.mjs
async function createTablesFromModels() {
  // Drop tables in reverse order
  for (const model of [...model_list].reverse()) {
    await Model.query(`DROP TABLE IF EXISTS "${model.table_name}" CASCADE`);
    // Also drop sequences to avoid conflicts
    await Model.query(`DROP SEQUENCE IF EXISTS "${model.table_name}_id_seq" CASCADE`);
  }

  // Create tables using migrate.mjs
  for (const model of model_list) {
    const createSQL = create_table_sql(model);
    console.log(`Creating table ${model.table_name}:`);
    console.log(createSQL);
    await Model.query(createSQL);
  }
}

// Initialize test data
async function initializeTestData() {
  // Initialize User data
  await User.insert({ username: "admin", password: "password" }).exec();
  await User.insert({ username: "user", password: "password" }).exec();

  // Initialize Blog data
  await Blog.insert({ name: "First Blog", tagline: "Welcome to my blog" }).exec();
  await Blog.insert({ name: "Second Blog", tagline: "Another interesting blog" }).exec();

  // Initialize Author data
  await Author.insert({
    name: "John Doe",
    email: "john@example.com",
    age: 30,
    resume: [
      {
        start_date: "2015-01-01",
        end_date: "2020-01-01",
        company: "Company A",
        position: "Developer",
        description: "Worked on various projects.",
      },
    ],
  }).exec();

  await Author.insert({
    name: "Jane Smith",
    email: "jane@example.com",
    age: 28,
    resume: [
      {
        start_date: "2016-01-01",
        end_date: "2021-01-01",
        company: "Company B",
        position: "Designer",
        description: "Designed user interfaces.",
      },
    ],
  }).exec();

  // Initialize Entry data
  await Entry.insert({
    blog_id: 1,
    headline: "First Entry",
    body_text: "This is the first entry in my blog.",
    pub_date: "2023-01-01",
    mod_date: "2023-01-02",
    number_of_comments: 5,
    number_of_pingbacks: 2,
    rating: 4,
  }).exec();

  await Entry.insert({
    blog_id: 2,
    headline: "Second Entry",
    body_text: "This is the second entry in another blog.",
    pub_date: "2023-01-03",
    mod_date: "2023-01-04",
    number_of_comments: 3,
    number_of_pingbacks: 1,
    rating: 5,
  }).exec();

  await Entry.insert({
    blog_id: 1,
    headline: "Third Entry",
    body_text: "This is the third entry in my blog.",
    pub_date: "2023-01-01",
    mod_date: "2023-01-02",
    number_of_comments: 5,
    number_of_pingbacks: 2,
    rating: 4,
  }).exec();

  // Initialize ViewLog data
  await ViewLog.insert({ entry_id: 1, ctime: "2023-01-01 10:00:00" }).exec();
  await ViewLog.insert({ entry_id: 2, ctime: "2023-01-03 12:00:00" }).exec();

  // Initialize Publisher data
  await Publisher.insert({ name: "Publisher A" }).exec();
  await Publisher.insert({ name: "Publisher B" }).exec();

  // Initialize Book data
  await Book.insert({
    name: "Book One",
    pages: 300,
    price: 29.99,
    rating: 4.5,
    author: 1,
    publisher_id: 1,
    pubdate: "2022-01-01",
  }).exec();

  await Book.insert({
    name: "Book Two",
    pages: 250,
    price: 19.99,
    rating: 4.0,
    author: 2,
    publisher_id: 2,
    pubdate: "2022-02-01",
  }).exec();

  // Initialize Store data
  await Store.insert([{ name: "Book Store A" }, { name: "Book Store B" }]).exec();
}

// Test setup
beforeAll(async () => {
  console.log("Setting up test database and data...");
  await createTablesFromModels();
  await initializeTestData();
});

afterAll(async () => {
  console.log("Cleaning up test data...");
  // Cleanup would go here
});

describe("Model Tests", () => {
  describe("Model:create_model mixins: unique property overridden by mixed model", () => {
    it("should override unique property from mixed model", () => {
      expect(BlogBin.fields.name.unique).toBe(false);
    });
  });

  describe("Xodel:select(a:(fun(ctx:table):string|table)|DBValue, b?:DBValue, ...:DBValue)", () => {
    it("select single field", async () => {
      const result = await Blog.select("name").where({ id: 1 }).exec();
      expect(result).toEqual([{ name: "First Blog" }]);
    });

    it("select multiple fields", async () => {
      const result = await Blog.select("name", "tagline").where({ id: 1 }).exec();
      expect(result).toEqual([{ name: "First Blog", tagline: "Welcome to my blog" }]);
    });

    it("select multiple fields, using table and vararg are equivalent", () => {
      const s1 = Blog.select(["name", "tagline"]).where({ id: 1 }).statement();
      const s2 = Blog.select("name", "tagline").where({ id: 1 }).statement();
      expect(s1).toBe(s2);
    });

    it("select literal without alias", async () => {
      const result = await Blog.select_literal("XXX").select("name").where({ id: 1 }).exec();
      expect(result[0]).toHaveProperty("name", "First Blog");
      expect(result[0]).toHaveProperty("?column?", "XXX");
    });

    it("select literal as", async () => {
      const result = await Blog.select_literal_as({ "XXX YYY": "blog_name" })
        .select("id")
        .where({ id: 1 })
        .exec();
      expect(result[0]).toHaveProperty("blog_name", "XXX YYY");
      expect(result[0]).toHaveProperty("id", 1);
    });

    it("select literal as with underscore", async () => {
      const result = await Blog.select_literal_as({ XXX_YYY: "blog_name" })
        .select("id")
        .where({ id: 2 })
        .exec();
      expect(result[0]).toHaveProperty("blog_name", "XXX_YYY");
      expect(result[0]).toHaveProperty("id", 2);
    });

    it("select foreign key", async () => {
      const result = await Book.select("name", "author__name").where({ id: 1 }).exec();
      expect(result[0]).toHaveProperty("name", "Book One");
      expect(result[0]).toHaveProperty("author__name");
    });

    it("select as foreign key", async () => {
      const result = await Book.select_as({ name: "book_name", author__name: "author_name" })
        .where({ id: 1 })
        .exec();
      expect(result[0]).toHaveProperty("book_name", "Book One");
      expect(result[0]).toHaveProperty("author_name");
    });

    it("select nested foreign key", async () => {
      const result = await ViewLog.select("entry_id__blog_id__name").where({ id: 1 }).exec();
      expect(result[0]).toHaveProperty("entry_id__blog_id__name");
    });

    it("select as nested foreign key", async () => {
      const result = await ViewLog.select_as({ entry_id__blog_id__name: "blog_name" })
        .where({ id: 1 })
        .exec();
      expect(result[0]).toHaveProperty("blog_name");
    });

    it("select reversed foreign key", async () => {
      const result = await Blog.select("id", "name", "entry__rating")
        .where({ name: "Second Blog" })
        .exec();
      expect(result[0]).toHaveProperty("id", 2);
      expect(result[0]).toHaveProperty("name", "Second Blog");
      expect(result[0]).toHaveProperty("entry__rating");
    });

    it("select reversed foreign key with order_by", async () => {
      const result = await Blog.select("id", "name", "entry__headline")
        .where({ name: "First Blog" })
        .order_by("entry__headline")
        .exec();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("name", "First Blog");
    });

    it("select reversed foreign key with order_by DESC", async () => {
      const result = await Blog.select("id", "name", "entry__headline")
        .where({ name: "First Blog" })
        .order_by("-entry__headline")
        .exec();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("name", "First Blog");
    });
  });

  describe("Xodel:where", () => {
    describe("where basic equal", () => {
      it("should generate correct SQL for basic equality", () => {
        const result = Book.where({ price: 100 }).statement();
        expect(result).toContain("WHERE");
        expect(result).toContain("price = 100");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM book T WHERE T.price = 100");
      });
    });

    describe("where greater than", () => {
      it("should generate correct SQL for greater than", () => {
        const result = Book.where({ price__gt: 100 }).statement();
        expect(result).toContain("WHERE");
        expect(result).toContain("price > 100");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM book T WHERE T.price > 100");
      });
    });

    describe("where negative condition", () => {
      it("should generate correct SQL for negative condition", () => {
        const result = Book.where(Q({ price__gt: 100 }).not()).statement();
        expect(result).toContain("NOT");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM book T WHERE NOT (T.price > 100)");
      });
    });

    describe("where combined conditions", () => {
      it("should generate correct SQL for OR conditions", () => {
        const result = Book.where(Q({ price__gt: 100 }).or(Q({ price__lt: 200 }))).statement();
        expect(result).toContain("OR");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM book T WHERE (T.price > 100) OR (T.price < 200)");
      });
    });

    describe("where negated combined conditions", () => {
      it("should generate correct SQL for negated OR conditions", () => {
        const result = Book.where(
          Q({ price__gt: 100 })
            .or(Q({ price__lt: 200 }))
            .not(),
        ).statement();
        expect(result).toContain("NOT");
        expect(result).toContain("OR");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM book T WHERE NOT ((T.price > 100) OR (T.price < 200))",
          );
      });
    });

    describe("where combined with AND", () => {
      it("should generate correct SQL for AND with OR conditions", () => {
        const result = Book.where(
          Q({ id: 1 }).and(Q({ price__gt: 100 }).or(Q({ price__lt: 200 }))),
        ).statement();
        expect(result).toContain("AND");
        expect(result).toContain("OR");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM book T WHERE (T.id = 1) AND ((T.price > 100) OR (T.price < 200))",
          );
      });
    });

    describe("where blog_id equals", () => {
      it("should generate correct SQL for foreign key equality", () => {
        const result = Entry.where({ blog_id: 1 }).statement();
        expect(result).toContain("WHERE");
        expect(result).toContain("blog_id = 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM entry T WHERE T.blog_id = 1");
      });
    });

    describe("where blog_id reference id", () => {
      it("should generate correct SQL for foreign key reference id", () => {
        const result = Entry.where({ blog_id__id: 1 }).statement();
        expect(result).toContain("blog_id = 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM entry T WHERE T.blog_id = 1");
      });
    });

    describe("where blog_id greater than", () => {
      it("should generate correct SQL for foreign key greater than", () => {
        const result = Entry.where({ blog_id__gt: 1 }).statement();
        expect(result).toContain("blog_id > 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM entry T WHERE T.blog_id > 1");
      });
    });

    describe("where blog_id reference id greater than", () => {
      it("should generate correct SQL for foreign key reference id greater than", () => {
        const result = Entry.where({ blog_id__id__gt: 1 }).statement();
        expect(result).toContain("blog_id > 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM entry T WHERE T.blog_id > 1");
      });
    });

    describe("where blog_id name equals", () => {
      it("should generate correct SQL for foreign key field access", () => {
        const result = Entry.where({ blog_id__name: "my blog name" }).statement();
        expect(result).toContain("JOIN");
        expect(result).toContain("blog");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM entry T INNER JOIN blog T1 ON (T.blog_id = T1.id) WHERE T1.name = 'my blog name'",
          );
      });
    });

    describe("where blog_id name contains", () => {
      it("should generate correct SQL for foreign key field contains", () => {
        const result = Entry.where({ blog_id__name__contains: "my blog" }).statement();
        expect(result).toContain("LIKE");
        expect(result).toContain("%my blog%");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM entry T INNER JOIN blog T1 ON (T.blog_id = T1.id) WHERE T1.name LIKE '%my blog%'",
          );
      });
    });

    describe("where view log entry_id blog_id equals", () => {
      it("should generate correct SQL for nested foreign key", () => {
        const result = ViewLog.where({ entry_id__blog_id: 1 }).statement();
        expect(result).toContain("JOIN");
        expect(result).toContain("entry");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) WHERE T1.blog_id = 1",
          );
      });
    });

    describe("where view log entry_id blog_id reference id", () => {
      it("should generate correct SQL for nested foreign key reference id", () => {
        const result = ViewLog.where({ entry_id__blog_id__id: 1 }).statement();
        expect(result).toContain("blog_id = 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) WHERE T1.blog_id = 1",
          );
      });
    });

    describe("where view log entry_id blog_id name equals", () => {
      it("should generate correct SQL for nested foreign key access", () => {
        const result = ViewLog.where({ entry_id__blog_id__name: "my blog name" }).statement();
        expect(result).toContain("JOIN");
        expect(result).toContain("entry");
        expect(result).toContain("blog");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) INNER JOIN blog T2 ON (T1.blog_id = T2.id) WHERE T2.name = 'my blog name'",
          );
      });
    });

    describe("where view log entry_id blog_id name starts with", () => {
      it("should generate correct SQL for nested foreign key startswith", () => {
        const result = ViewLog.where({ entry_id__blog_id__name__startswith: "my" }).statement();
        expect(result).toContain("LIKE");
        expect(result).toContain("my%");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) INNER JOIN blog T2 ON (T1.blog_id = T2.id) WHERE T2.name LIKE 'my%'",
          );
      });
    });

    describe("where view log entry_id blog_id name starts with and headline equals", () => {
      it("should generate correct SQL for multiple nested conditions", () => {
        const result = ViewLog.where({ entry_id__blog_id__name__startswith: "my" })
          .where({ entry_id__headline: "aa" })
          .statement();
        expect(result).toContain("LIKE");
        expect(result).toContain("AND");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) INNER JOIN blog T2 ON (T1.blog_id = T2.id) WHERE (T2.name LIKE 'my%') AND (T1.headline = 'aa')",
          );
      });
    });

    describe("where blog entry equals", () => {
      it("should generate equivalent SQL for entry and entry__id", () => {
        const s1 = Blog.where({ entry: 1 }).statement();
        const s2 = Blog.where({ entry__id: 1 }).statement();
        expect(s1).toBe(s2);
      });
    });

    describe("where blog entry rating equals", () => {
      it("should generate correct SQL for reversed foreign key", () => {
        const result = Blog.where({ entry__rating: 1 }).statement();
        expect(result).toContain("JOIN");
        expect(result).toContain("entry");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM blog T INNER JOIN entry T1 ON (T.id = T1.blog_id) WHERE T1.rating = 1",
          );
      });
    });

    describe("where blog entry view log equals", () => {
      it("should generate correct SQL for double reversed foreign key", () => {
        const result = Blog.where({ entry__view_log: 1 }).statement();
        expect(result).toContain("JOIN");
        expect(result).toContain("entry");
        expect(result).toContain("view_log");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM blog T INNER JOIN entry T1 ON (T.id = T1.blog_id) INNER JOIN view_log T2 ON (T1.id = T2.entry_id) WHERE T2.id = 1",
          );
      });
    });

    describe("where blog entry view log ctime year equals", () => {
      it("should generate correct SQL for date year extraction", () => {
        const result = Blog.where({ entry__view_log__ctime__year: 2025 }).statement();
        expect(result).toContain("BETWEEN");
        expect(result).toContain("2025-01-01");
        expect(result).toContain("2025-12-31");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM blog T INNER JOIN entry T1 ON (T.id = T1.blog_id) INNER JOIN view_log T2 ON (T1.id = T2.entry_id) WHERE T2.ctime BETWEEN '2025-01-01' AND '2025-12-31'",
          );
      });
    });

    describe("where blog entry view log combined conditions", () => {
      it("should generate correct SQL for combined view log conditions", () => {
        const result = Blog.where(
          Q({ entry__view_log: 1 }).or(Q({ entry__view_log: 2 })),
        ).statement();
        expect(result).toContain("OR");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM blog T INNER JOIN entry T1 ON (T.id = T1.blog_id) INNER JOIN view_log T2 ON (T1.id = T2.entry_id) WHERE (T2.id = 1) OR (T2.id = 2)",
          );
      });
    });

    describe("group by book name with total price", () => {
      it("should generate correct SQL for group by with aggregation", () => {
        const result = Book.group_by("name")
          .annotate({ price_total: Sum("price") })
          .statement();
        expect(result).toContain("GROUP BY");
        expect(result).toContain("SUM");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT T.name, SUM(T.price) AS price_total FROM book T GROUP BY T.name",
          );
      });
    });

    describe("annotate book with total price", () => {
      it("should generate correct SQL for annotation without group by", () => {
        const result = Book.annotate({ price_total: Sum("price") }).statement();
        expect(result).toContain("SUM");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT SUM(T.price) AS price_total FROM book T");
      });
    });

    describe("annotate book with sum price", () => {
      it("should generate correct SQL for sum annotation", () => {
        const result = Book.annotate([Sum("price")]).statement();
        expect(result).toEqual("SELECT SUM(T.price) AS price_sum FROM book T");
      });
    });

    describe("group by book name with sum price", () => {
      it("should generate correct SQL for group by with sum", () => {
        const result = Book.group_by("name")
          .annotate([Sum("price")])
          .statement();
        expect(result).toContain("GROUP BY");
        expect(result).toContain("SUM");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT T.name, SUM(T.price) AS price_sum FROM book T GROUP BY T.name",
          );
      });
    });

    describe("group by book name with having condition", () => {
      it("should generate correct SQL for having clause", () => {
        const result = Book.group_by("name")
          .annotate([Sum("price")])
          .having({ price_sum__gt: 100 })
          .statement();
        expect(result).toContain("HAVING");
        expect(result).toContain("SUM");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT T.name, SUM(T.price) AS price_sum FROM book T GROUP BY T.name HAVING SUM(T.price) > 100",
          );
      });
    });

    describe("group by book name with having condition with Q object", () => {
      it("should generate correct SQL for having with Q object", () => {
        const result = Book.group_by("name")
          .annotate([Sum("price")])
          .having(Q({ price_sum__lt: 100 }).or(Q({ price_sum__gt: 200 })))
          .statement();
        expect(result).toEqual(
          "SELECT T.name, SUM(T.price) AS price_sum FROM book T GROUP BY T.name HAVING (SUM(T.price) < 100) OR (SUM(T.price) > 200)",
        );
      });
    });

    describe("group by book name with having total price condition", () => {
      it("should generate correct SQL for having with alias", () => {
        const result = Book.group_by("name")
          .annotate({ price_total: Sum("price") })
          .having({ price_total__gt: 100 })
          .statement();
        expect(result).toContain("HAVING");
        expect(result).toContain("SUM");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT T.name, SUM(T.price) AS price_total FROM book T GROUP BY T.name HAVING SUM(T.price) > 100",
          );
      });
    });

    describe("group by book name with having total price condition and order by", () => {
      it("should generate correct SQL for having with order by", () => {
        const result = Book.group_by("name")
          .annotate({ price_total: Sum("price") })
          .having({ price_total__gt: 100 })
          .order_by("-price_total")
          .statement();
        expect(result).toContain("HAVING");
        expect(result).toContain("ORDER BY");
        expect(result).toContain("DESC");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT T.name, SUM(T.price) AS price_total FROM book T GROUP BY T.name HAVING SUM(T.price) > 100 ORDER BY SUM(T.price) DESC",
          );
      });
    });

    describe("annotate book with double price", () => {
      it("should generate correct SQL for field expression", () => {
        const result = Book.annotate({ double_price: F("price").mul(2) }).statement();
        expect(result).toEqual("SELECT (T.price * 2) AS double_price FROM book T");
      });
    });

    describe("annotate book with price per page", () => {
      it("should generate correct SQL for field division", () => {
        const result = Book.annotate({ price_per_page: F("price").div(F("pages")) }).statement();
        expect(result).toEqual("SELECT (T.price / T.pages) AS price_per_page FROM book T");
      });
    });

    describe("annotate blog with entry count", () => {
      it("should generate correct SQL for count with left join", () => {
        const result = Blog.annotate({ entry_count: Count("entry") }).statement();
        expect(result).toContain("COUNT");
        expect(result).toContain("LEFT JOIN");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT COUNT(T1.id) AS entry_count FROM blog T LEFT JOIN entry T1 ON (T.id = T1.blog_id)",
          );
      });
    });

    describe("where author resume has key", () => {
      it("should generate correct SQL for JSON has key operation", () => {
        const result = Author.where({ resume__has_key: "start_date" }).statement();
        expect(result).toContain("?");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM author T WHERE (T.resume) ? start_date");
      });
    });

    describe("where author resume has keys", () => {
      it("should generate correct SQL for JSON has keys operation", () => {
        const result = Author.where({ resume__0__has_keys: ["a", "b"] }).statement();
        expect(result).toContain("?&");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM author T WHERE (T.resume #> ['0']) ?& ['a', 'b']");
      });
    });

    describe("where author resume has any keys", () => {
      it("should generate correct SQL for JSON has any keys operation", () => {
        const result = Author.where({ resume__has_any_keys: ["a", "b"] }).statement();
        expect(result).toContain("?|");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe("SELECT * FROM author T WHERE (T.resume) ?| ['a', 'b']");
      });
    });

    describe("where author resume start date time equals", () => {
      it("should generate correct SQL for JSON path access", () => {
        const result = Author.where({ resume__start_date__time: "12:00:00" }).statement();
        expect(result).toContain("#>");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM author T WHERE (T.resume #> ['start_date', 'time']) = '\"12:00:00\"'",
          );
      });
    });

    describe("where author resume contains", () => {
      it("should generate correct SQL for JSON contains operation", () => {
        const result = Author.where({ resume__contains: { start_date: "2025-01-01" } }).statement();
        expect(result).toContain("@>");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            'SELECT * FROM author T WHERE (T.resume) @> \'{"start_date":"2025-01-01"}\'',
          );
      });
    });

    describe("where author resume contained by", () => {
      it("should generate correct SQL for JSON contained by operation", () => {
        const result = Author.where({
          resume__contained_by: { start_date: "2025-01-01" },
        }).statement();
        expect(result).toContain("<@");
        expect(result).toContain("resume");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            'SELECT * FROM author T WHERE (T.resume) <@ \'{"start_date":"2025-01-01"}\'',
          );
      });
    });

    describe("where view log entry_id equals", () => {
      it("should generate correct SQL for where with string and value", () => {
        const result = ViewLog.where("entry_id__blog_id", 1).statement();
        expect(result).toContain("blog_id = 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) WHERE T1.blog_id = 1",
          );
      });
    });

    describe("where view log entry_id greater than", () => {
      it("should generate correct SQL for nested foreign key greater than", () => {
        const result = ViewLog.where({ entry_id__blog_id__gt: 1 }).statement();
        expect(result).toContain("blog_id > 1");
        process.env.SQL_WHOLE_MATCH &&
          expect(result).toBe(
            "SELECT * FROM view_log T INNER JOIN entry T1 ON (T.entry_id = T1.id) WHERE T1.blog_id > 1",
          );
      });
    });
  });

  describe("Xodel:insert(rows:table|table[]|Sql, columns?:string[])", () => {
    it("insert single row", async () => {
      const result = await Blog.insert({
        name: "insert one row",
        tagline: "insert one row",
      }).exec();
      expect(result.count).toEqual(1);

      // Cleanup
      await Blog.delete({ name: "insert one row" }).exec();
    });

    it("insert single row and return specific fields", async () => {
      const result = await Blog.insert({
        name: "Return Test Blog",
        tagline: "Return test tagline",
      })
        .returning("id", "name")
        .exec();

      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name", "Return Test Blog");
      expect(typeof result[0].id).toBe("number");

      // Cleanup
      await Blog.delete({ id: result[0].id }).exec();
    });

    it("returning using vararg and table are equivalent", () => {
      const s1 = Blog.insert({
        name: "Return Test Blog",
        tagline: "Return test tagline",
      })
        .returning("id", "name")
        .statement();
      const s2 = Blog.insert({
        name: "Return Test Blog",
        tagline: "Return test tagline",
      })
        .returning("id", "name")
        .statement();
      expect(s1).toBe(s2);
    });

    it("bulk insert multiple rows", async () => {
      const result = await Blog.insert([
        { name: "bulk insert 1", tagline: "bulk insert 1" },
        { name: "bulk insert 2", tagline: "bulk insert 2" },
      ]).exec();
      expect(result.count).toEqual(2);

      // Cleanup
      await Blog.delete({ name__startswith: "bulk insert" }).exec();
    });

    it("bulk insert and return all fields", async () => {
      const result = await Blog.insert([
        { name: "bulk insert return 1", tagline: "bulk insert return 1" },
        { name: "bulk insert return 2", tagline: "bulk insert return 2" },
      ])
        .returning("*")
        .exec();

      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty("name", "bulk insert return 1");
      expect(result[1]).toHaveProperty("name", "bulk insert return 2");

      // Cleanup
      await Blog.delete({ name__startswith: "bulk insert return" }).exec();
    });

    it("insert data from subquery select", async () => {
      const result = await BlogBin.insert(
        Blog.where({ name: "Second Blog" }).select("name", "tagline"),
      ).exec();
      expect(result.count).toEqual(1);
    });

    it("verify the inserted data above", async () => {
      const result = await BlogBin.where({ name: "Second Blog" }).select("tagline").get();
      expect(result).toHaveProperty("tagline", "Another interesting blog");
    });

    it("insert data from subquery select_literal", async () => {
      const result = await BlogBin.insert(
        Blog.where({ name: "First Blog" })
          .select("name", "tagline")
          .select_literal("select from another blog"),
        ["name", "tagline", "note"],
      ).exec();
      expect(result.count).toEqual(1);
    });

    it("verify the inserted data above select_literal", async () => {
      const result = await BlogBin.where({ name: "First Blog" }).select("note").get();
      expect(result).toHaveProperty("note", "select from another blog");
    });

    it("insert data from subquery update+returning", async () => {
      await Blog.insert({ name: "update returning" }).exec();
      const result = await BlogBin.insert(
        Blog.update({ name: "update returning 2" })
          .where({ name: "update returning" })
          .returning("name", "tagline")
          .returning_literal("update from another blog"),
        ["name", "tagline", "note"],
      )
        .returning("name", "tagline", "note")
        .exec();

      const inserted = await BlogBin.where({ name: "update returning 2" })
        .select("name", "tagline", "note")
        .exec();
      expect(inserted).toEqual([
        {
          name: "update returning 2",
          tagline: "default tagline",
          note: "update from another blog",
        },
      ]);

      // Cleanup
      await Blog.delete({ name: "update returning 2" }).exec();
    });

    it("insert data from subquery delete+returning", async () => {
      await Blog.insert({ name: "delete returning", tagline: "delete returning tagline" }).exec();
      const result = await BlogBin.insert(
        Blog.delete({ name: "delete returning" })
          .returning("name", "tagline")
          .returning_literal("deleted from another blog"),
        ["name", "tagline", "note"],
      )
        .returning("name", "tagline", "note")
        .exec();

      expect(result).toEqual([
        {
          name: "delete returning",
          tagline: "delete returning tagline",
          note: "deleted from another blog",
        },
      ]);

      // Cleanup
      const deleted = await Blog.delete({ name: "delete returning" }).exec();
      expect(deleted.count).toEqual(0); // already deleted
    });

    it("insert data from subquery delete+returning, without explicitly specifying columns", async () => {
      await Blog.insert({ name: "delete returning", tagline: "no column" }).exec();
      const result = await BlogBin.insert(
        Blog.delete({ name: "delete returning" }).returning("name", "tagline"),
      )
        .returning("name", "tagline", "note")
        .exec();

      expect(result).toEqual([{ name: "delete returning", tagline: "no column", note: "" }]);

      // Cleanup
      const deleted = await Blog.delete({ name: "delete returning" }).exec();
      expect(deleted.count).toEqual(0); // already deleted
    });

    it("insert data with specified column names", async () => {
      const result = await BlogBin.insert(
        {
          name: "Column Test Blog",
          tagline: "Column test tagline",
          note: "should not be inserted",
        },
        ["name", "tagline"],
      )
        .returning("name", "tagline", "note")
        .exec();

      expect(result[0]).toHaveProperty("name", "Column Test Blog");
      expect(result[0]).toHaveProperty("tagline", "Column test tagline");
      expect(result[0]).toHaveProperty("note", "");

      // Cleanup
      await BlogBin.delete({ name: "Column Test Blog" }).exec();
    });

    it("insert data and use default values", async () => {
      const result = await Blog.insert({ name: "Default Test Blog" })
        .returning("name", "tagline")
        .exec();
      expect(result[0]).toHaveProperty("tagline", "default tagline");
      expect(result[0]).toHaveProperty("name", "Default Test Blog");

      // Cleanup
      await Blog.delete({ name: "Default Test Blog" }).exec();
    });
  });

  describe("Xodel:insert exception cases", () => {
    it("uniqueness error", async () => {
      await expect(async () => {
        await Blog.insert({ name: "First Blog" }).exec();
      }).rejects.toThrow();
    });

    it("name too long", async () => {
      await expect(async () => {
        await Blog.insert({
          name: "This name is way too long and exceeds the maximum length",
          tagline: "Test tagline",
        }).exec();
      }).rejects.toThrow();
    });

    it("one of multiple rows has name too long", async () => {
      await expect(async () => {
        await Blog.insert([
          { name: "Valid Blog", tagline: "Valid tagline" },
          {
            name: "This name is way too long and exceeds the maximum length",
            tagline: "Another tagline",
          },
        ]).exec();
      }).rejects.toThrow();
    });

    it("insert composite field error (Author's resume field)", async () => {
      await expect(async () => {
        await Author.insert({
          resume: [{ company: "123456789012345678901234567890" }],
        }).exec();
      }).rejects.toThrow();
    });

    it("insert multiple rows composite field error (Author's resume field)", async () => {
      await expect(async () => {
        await Author.insert([{ resume: [{ company: "123456789012345678901234567890" }] }]).exec();
      }).rejects.toThrow();
    });

    it("insert from subquery with mismatched column count error 1", async () => {
      await expect(async () => {
        await BlogBin.insert(Blog.where({ name: "First Blog" }).select("name", "tagline"), [
          "name",
        ]).exec();
      }).rejects.toThrow();
    });

    it("insert from subquery with mismatched column count error 2", async () => {
      await expect(async () => {
        await BlogBin.insert(Blog.where({ name: "First Blog" }).select("name", "tagline"), [
          "name",
          "tagline",
          "note",
        ]).exec();
      }).rejects.toThrow();
    });
  });

  describe("Xodel:update", () => {
    it("update basic", async () => {
      const result = await Blog.where({ name: "First Blog" })
        .update({ tagline: "changed tagline" })
        .returning("*")
        .exec();

      expect(result[0]).toHaveProperty("name", "First Blog");
      expect(result[0]).toHaveProperty("tagline", "changed tagline");
      expect(result[0]).toHaveProperty("id", 1);
    });

    it("update with join", async () => {
      const result = await Entry.update({ headline: F("blog_id__name") })
        .where({ id: 1 })
        .returning("headline")
        .exec();

      const entry = await Entry.where({ id: 1 }).select("headline").get();
      expect(result[0]).toEqual(entry);
    });

    it("update with function", async () => {
      const result = await Entry.update({
        headline: F("headline") + " suffix by function",
      })
        .where({ id: 1 })
        .returning("headline")
        .exec();

      const entry = await Entry.where({ id: 1 }).select("headline").get();
      expect(result[0]).toEqual(entry);
    });

    it("increase", async () => {
      const entry = await Entry.where({ id: 1 }).select("rating").get();
      const result = await Entry.increase({ rating: 1 })
        .where({ id: 1 })
        .returning("rating")
        .exec();
      expect(result[0].rating).toBe(entry.rating + 1);
    });

    it("increase two fields", async () => {
      const entry = await Entry.where({ id: 1 }).get();
      const result = await Entry.increase({
        number_of_comments: 1,
        number_of_pingbacks: 2,
      })
        .where({ id: 1 })
        .returning("*")
        .exec();

      expect(result[0].number_of_comments).toBe(entry.number_of_comments + 1);
      expect(result[0].number_of_pingbacks).toBe(entry.number_of_pingbacks + 2);
    });

    it("increase string args", async () => {
      const entry = await Entry.where({ id: 1 }).select("rating").get();
      const result = await Entry.increase("rating", 2).where({ id: 1 }).returning("rating").exec();
      expect(result[0].rating).toBe(entry.rating + 2);
    });

    it("update with where join", async () => {
      const result = await Entry.update({
        headline: F("headline") + " from first blog",
      })
        .where({
          blog_id__name: "First Blog",
        })
        .returning("id", "headline")
        .exec();

      const updated = await Entry.where({ headline__endswith: " from first blog" })
        .select("id", "headline")
        .exec();
      expect(result).toEqual(updated);
    });
  });

  describe("Xodel:merge", () => {
    it("merge basic", async () => {
      const result = await Blog.merge([
        { name: "First Blog", tagline: "updated by merge" },
        { name: "Blog added by merge", tagline: "inserted by merge" },
      ]).exec();
      expect(result.count).toEqual(1);

      const updated = await Blog.where({ name: "First Blog" }).select("tagline").get();
      expect(updated.tagline).toBe("updated by merge");

      // Cleanup
      await Blog.delete({ name: "Blog added by merge" }).exec();
    });

    it("merge insert only", async () => {
      const origin = await Blog.where({ name: "First Blog" }).get();
      const result = await Blog.merge([
        { name: "First Blog" },
        { name: "Blog added by merge" },
      ]).exec();
      expect(result.count).toEqual(1);

      const updated = await Blog.where({ name: "First Blog" }).get();
      expect(updated).toEqual(origin);

      const inserted = await Blog.where({ name: "Blog added by merge" })
        .select("name", "tagline")
        .get();
      expect(inserted).toEqual({ name: "Blog added by merge", tagline: "default tagline" });

      // Cleanup
      await Blog.delete({ name: "Blog added by merge" }).exec();
    });

    it("merge throw exception cases", async () => {
      await expect(async () => {
        await Author.merge([
          { name: "Tom", age: 11 },
          { name: "Jerry", age: 101 },
        ]).exec();
      }).rejects.toThrow();

      await expect(async () => {
        await Author.merge([{ name2: "Tom", age: 11 }]).exec();
      }).rejects.toThrow();

      await expect(async () => {
        await Author.merge([{ name: "Tom", age: 11 }], "name1").exec();
      }).rejects.toThrow();
    });
  });

  describe("Xodel:upsert", () => {
    it("upsert basic", async () => {
      const result = await Blog.upsert([
        { name: "First Blog", tagline: "updated by upsert" },
        { name: "Blog added by upsert", tagline: "inserted by upsert" },
      ]).exec();
      expect(result.count).toEqual(2);

      const updated = await Blog.where({ name: "First Blog" }).select("tagline").get();
      expect(updated.tagline).toBe("updated by upsert");

      const inserted = await Blog.where({ name: "Blog added by upsert" })
        .select("name", "tagline")
        .get();
      expect(inserted).toEqual({ name: "Blog added by upsert", tagline: "inserted by upsert" });

      // Cleanup
      await Blog.delete({ name: "Blog added by upsert" }).exec();
    });

    it("upsert from returning", async () => {
      const backup = await BlogBin.exec();
      await BlogBin.delete().exec();
      await BlogBin.insert([
        { name: "B1", tagline: "tag1" },
        { name: "B2", tagline: "tag2" },
      ]).exec();

      const result = await Blog.upsert(
        BlogBin.update({ tagline: "updated by upsert returning" }).returning("name", "tagline"),
      )
        .returning("id", "name", "tagline")
        .exec();

      expect(result.length).toBe(2);
      const names = await Blog.where({ tagline: "updated by upsert returning" })
        .order("name")
        .flat("name");
      try {
        expect(names).toEqual(["B1", "B2"]);
      } finally {
        // Cleanup
        await Blog.where({ tagline: "updated by upsert returning" }).delete().exec();
        await BlogBin.delete().exec();
        await BlogBin.insert(backup).exec();
      }
    });

    it("upsert from select", async () => {
      const result = await Blog.upsert(
        BlogBin.where({
          name__notin: Blog.select("name").distinct(),
        })
          .select("name", "tagline")
          .distinct("name"),
      )
        .returning("id", "name", "tagline")
        .exec();

      expect(result.length).toBe(2);
      await Blog.delete({ id__in: [result[0].id, result[1].id] }).exec();
    });
  });

  describe("upsert exception cases", () => {
    it("single upsert", async () => {
      await expect(async () => {
        await Author.upsert([{ name: "Tom", age: 111 }]).exec();
      }).rejects.toThrow();
    });

    it("multiple upsert", async () => {
      await expect(async () => {
        await Author.upsert([
          { name: "Tom", age: 11 },
          { name: "Jerry", age: 101 },
        ]).exec();
      }).rejects.toThrow();
    });
  });

  describe("Xodel:updates", () => {
    it("updates basic", async () => {
      await Blog.insert({ name: "Third Blog" }).exec();
      const result = await Blog.updates([
        { name: "Third Blog", tagline: "Updated by updates" },
        { name: "Fourth Blog", tagline: "wont update" },
      ]).exec();
      expect(result.count).toEqual(1);

      const updated_blog = await Blog.where({ name: "Third Blog" }).select("tagline").get();
      expect(updated_blog.tagline).toBe("Updated by updates");

      // Cleanup
      await Blog.delete({ name: "Third Blog" }).exec();
    });

    it("updates from SELECT subquery", async () => {
      const result = await BlogBin.updates(
        Blog.where({ name: "Second Blog" }).select("name", "tagline"),
        "name",
      )
        .returning("*")
        .exec();
      //   const result = await BlogBin.query(`
      //   WITH V(name, tagline) AS (
      //     SELECT T.name, T.tagline
      //     FROM blog T
      //     WHERE T.name = 'Second Blog'
      //   )
      //   UPDATE blog_bin T
      //   SET tagline = V.tagline
      //   FROM V
      //   WHERE V.name = T.name
      //   RETURNING T.id;

      // `);
      expect(result.count).toEqual(1);

      const updated = await BlogBin.where({ name: "Second Blog" }).select("tagline").get();
      expect(updated.tagline).toBe("Another interesting blog");
    });

    it("updates from UPDATE subquery", async () => {
      await BlogBin.insert(
        Blog.insert({
          name: "Third Blog",
          tagline: "Third interesting blog",
        }).returning("name", "tagline"),
      ).exec();

      const result = await BlogBin.updates(
        Blog.where({ name: "Third Blog" }).update({ tagline: "XXX" }).returning("name", "tagline"),
        "name",
      ).exec();
      expect(result.count).toEqual(1);

      const updated1 = await BlogBin.where({ name: "Third Blog" }).select("tagline").get();
      const updated2 = await Blog.where({ name: "Third Blog" }).select("tagline").get();
      expect(updated2.tagline).toBe("XXX");
      expect(updated1.tagline).toBe("XXX");

      // Cleanup
      await Blog.delete({ name: "Third Blog" }).exec();
    });
  });

  describe("updates exception cases", () => {
    it("updates without primary key", async () => {
      await expect(async () => {
        await Blog.updates([{ tagline: "Missing ID" }]).exec();
      }).rejects.toThrow();
    });

    it("multiple updates", async () => {
      await expect(async () => {
        await Author.updates([
          { id: 1, age: 11 },
          { id: 2, age: 101 },
        ]).exec();
      }).rejects.toThrow();
    });

    it("updates with invalid field", async () => {
      await expect(async () => {
        await Author.updates([{ name: "John Doe", age2: 9 }]).exec();
      }).rejects.toThrow();
    });
  });

  describe("merge_gets", () => {
    it("merge_gets with select first", async () => {
      const first = await Blog.create({ name: "First Merge Blog", tagline: "First tagline" });
      const second = await Blog.create({ name: "Second Merge Blog", tagline: "Second tagline" });

      const result = await Blog.select("name")
        .merge_gets(
          [
            { id: first.id, name: "Merged First Blog" },
            { id: second.id, name: "Merged Second Blog" },
          ],
          "id",
        )
        .exec();

      expect(result).toEqual([
        { id: first.id, name: "Merged First Blog" },
        { id: second.id, name: "Merged Second Blog" },
      ]);

      // Cleanup
      await Blog.delete({ id__in: [first.id, second.id] }).exec();
    });

    it("merge_gets with select last", async () => {
      const first = await Blog.insert({ name: "First Merge Blog", tagline: "First tagline" })
        .returning("*")
        .exec();
      const second = await Blog.insert({ name: "Second Merge Blog", tagline: "Second tagline" })
        .returning("*")
        .exec();

      const result = await Blog.merge_gets(
        [
          { id: first[0].id, name: "Merged First Blog" },
          { id: second[0].id, name: "Merged Second Blog" },
        ],
        "id",
      )
        .select("name")
        .exec();

      expect(result).toEqual([
        { id: first[0].id, name: "First Merge Blog" },
        { id: second[0].id, name: "Second Merge Blog" },
      ]);

      // Cleanup
      await Blog.delete({ id__in: [first[0].id, second[0].id] }).exec();
    });
  });

  describe("User model tests", () => {
    it("table name is escaped", async () => {
      const user = await User.create({ username: "testuser", password: "password" });
      expect(user.username).toBe("testuser");
      expect(user.password).toBe("password");
    });
  });
});
