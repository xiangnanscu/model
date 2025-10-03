# xodel

[xodel](https://xiangnanscu.github.io/model/) Declarative, intuitive and powerful PostgreSQL ORM library.

English | [简体中文](./README.zh-CN.md)

## Features

- **Declarative Model Definition**: Define your database models using simple JavaScript objects
- **Automatic Migration Generation**: Generate SQL migration scripts from model changes
- **Type Safety**: Full TypeScript support with type inference
- **Query Builder**: Intuitive query building with method chaining
- **Relationship Management**: Support for foreign keys and complex relationships
- **Schema Validation**: Built-in field validation and constraints

## Installation

```sh
npm install xodel
```

## Quick Start

```js
import { Model, Q, F, Sum, Avg, Max, Min, Count, create_table_sql } from "xodel";

// Configure database connection
Model.db_config = {
  host: "localhost",
  port: "5432",
  user: "postgres",
  password: "postgres",
  database: "test",
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

// Create tables from model definitions
for (const model of model_list) {
  const createSQL = create_table_sql(model);
  await Model.query(createSQL);
}
```

## Query Operations

### Basic Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Query all records
const blogs = await Blog.exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
```

</td>
</tr>
<tr>
<td>

```js
// Conditional query
const blog = await Blog.where({ id: 1 }).get();
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
const blogs = await Blog.where({ name: "First Blog" }).exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.name = 'First Blog'
```

</td>
</tr>
<tr>
<td>

```js
// String condition query
const result = await Blog.where("name", "First Blog").exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.name = 'First Blog'
```

</td>
</tr>
</table>

### Field Selection

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Select single field
const result = await Blog.select("name").where({ id: 1 }).exec();
// Result: [{ name: "First Blog" }]
```

</td>
<td>

```sql
SELECT T.name
FROM blog T
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Select multiple fields
const result = await Blog.select("name", "tagline").where({ id: 1 }).exec();
// Or using array form
const result = await Blog.select(["name", "tagline"]).where({ id: 1 }).exec();
```

</td>
<td>

```sql
SELECT T.name, T.tagline
FROM blog T
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Field aliases
const result = await Blog.select_as({
  name: "blog_name",
  tagline: "blog_tagline"
}).where({ id: 1 }).exec();
```

</td>
<td>

```sql
SELECT T.name AS blog_name, T.tagline AS blog_tagline
FROM blog T
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Literal selection
const result = await Blog.select_literal("Hello World")
  .select("name")
  .where({ id: 1 })
  .exec();
```

</td>
<td>

```sql
SELECT 'Hello World' AS "?column?", T.name
FROM blog T
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Literal aliases
const result = await Blog.select_literal_as({
  "Hello World": "greeting"
}).select("id").where({ id: 1 }).exec();
```

</td>
<td>

```sql
SELECT 'Hello World' AS greeting, T.id
FROM blog T
WHERE T.id = 1
```

</td>
</tr>
</table>

### Foreign Key Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Query foreign key fields
const result = await Book.select("name", "author__name").where({ id: 1 }).exec();
```

</td>
<td>

```sql
SELECT T.name, T1.name AS author__name
FROM book T
INNER JOIN author T1 ON (T.author = T1.id)
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Nested foreign key query
const result = await ViewLog.select("entry_id__blog_id__name").where({ id: 1 }).exec();
```

</td>
<td>

```sql
SELECT T2.name AS entry_id__blog_id__name
FROM view_log T
INNER JOIN entry T1 ON (T.entry_id = T1.id)
INNER JOIN blog T2 ON (T1.blog_id = T2.id)
WHERE T.id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Reverse foreign key query
const result = await Blog.select("id", "name", "entry__rating")
  .where({ name: "Second Blog" })
  .exec();
```

</td>
<td>

```sql
SELECT T.id, T.name, T1.rating AS entry__rating
FROM blog T
INNER JOIN entry T1 ON (T.id = T1.blog_id)
WHERE T.name = 'Second Blog'
```

</td>
</tr>
</table>

### Conditional Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Basic conditions
const result = await Book.where({ price: 100 }).exec();
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE T.price = 100
```

</td>
</tr>
<tr>
<td>

```js
// Comparison operators
const result = await Book.where({ price__gt: 100 }).exec(); // greater than
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE T.price > 100
```

</td>
</tr>
<tr>
<td>

```js
const result = await Book.where({ price__lt: 100 }).exec(); // less than
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE T.price < 100
```

</td>
</tr>
<tr>
<td>

```js
const result = await Book.where({ price__gte: 100 }).exec(); // greater than or equal
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE T.price >= 100
```

</td>
</tr>
<tr>
<td>

```js
const result = await Book.where({ price__lte: 100 }).exec(); // less than or equal
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE T.price <= 100
```

</td>
</tr>
<tr>
<td>

```js
// String operations
const result = await Blog.where({ name__contains: "blog" }).exec(); // contains
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.name LIKE '%blog%'
```

</td>
</tr>
<tr>
<td>

```js
const result = await Blog.where({ name__startswith: "First" }).exec(); // starts with
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.name LIKE 'First%'
```

</td>
</tr>
<tr>
<td>

```js
const result = await Blog.where({ name__endswith: "Blog" }).exec(); // ends with
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.name LIKE '%Blog'
```

</td>
</tr>
<tr>
<td>

```js
// List operations
const result = await Blog.where({ id__in: [1, 2, 3] }).exec(); // in list
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.id IN (1, 2, 3)
```

</td>
</tr>
<tr>
<td>

```js
const result = await Blog.where({ id__notin: [1, 2, 3] }).exec(); // not in list
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.id NOT IN (1, 2, 3)
```

</td>
</tr>
<tr>
<td>

```js
// Null checks
const result = await Blog.where({ tagline__isnull: true }).exec(); // is null
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.tagline IS NULL
```

</td>
</tr>
<tr>
<td>

```js
const result = await Blog.where({ tagline__notnull: true }).exec(); // is not null
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.tagline IS NOT NULL
```

</td>
</tr>
</table>

### Complex Conditional Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Using Q objects for complex queries
const result = await Book.where(
  Q({ price__gt: 100 }).or(Q({ price__lt: 200 }))
).exec();
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE (T.price > 100) OR (T.price < 200)
```

</td>
</tr>
<tr>
<td>

```js
// Negation conditions
const result = await Book.where(Q({ price__gt: 100 }).not()).exec();
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE NOT (T.price > 100)
```

</td>
</tr>
<tr>
<td>

```js
// Combined conditions
const result = await Book.where(
  Q({ id: 1 }).and(Q({ price__gt: 100 }).or(Q({ price__lt: 200 })))
).exec();
```

</td>
<td>

```sql
SELECT * FROM book T
WHERE (T.id = 1) AND ((T.price > 100) OR (T.price < 200))
```

</td>
</tr>
</table>

### Foreign Key Conditional Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Foreign key equality query
const result = await Entry.where({ blog_id: 1 }).exec();
const result = await Entry.where({ blog_id__id: 1 }).exec(); // equivalent
```

</td>
<td>

```sql
SELECT * FROM entry T
WHERE T.blog_id = 1
```

</td>
</tr>
<tr>
<td>

```js
// Foreign key field query
const result = await Entry.where({ blog_id__name: "my blog name" }).exec();
```

</td>
<td>

```sql
SELECT * FROM entry T
INNER JOIN blog T1 ON (T.blog_id = T1.id)
WHERE T1.name = 'my blog name'
```

</td>
</tr>
<tr>
<td>

```js
// Nested foreign key query
const result = await ViewLog.where({ entry_id__blog_id__name: "my blog name" }).exec();
```

</td>
<td>

```sql
SELECT * FROM view_log T
INNER JOIN entry T1 ON (T.entry_id = T1.id)
INNER JOIN blog T2 ON (T1.blog_id = T2.id)
WHERE T2.name = 'my blog name'
```

</td>
</tr>
<tr>
<td>

```js
// Reverse foreign key query
const result = await Blog.where({ entry__rating: 1 }).exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
INNER JOIN entry T1 ON (T.id = T1.blog_id)
WHERE T1.rating = 1
```

</td>
</tr>
</table>

### JSON Field Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// JSON key existence check
const result = await Author.where({ resume__has_key: "start_date" }).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume) ? 'start_date'
```

</td>
</tr>
<tr>
<td>

```js
// JSON multiple keys existence check
const result = await Author.where({ resume__0__has_keys: ["a", "b"] }).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume #> ARRAY['0']) ?& ARRAY['a', 'b']
```

</td>
</tr>
<tr>
<td>

```js
// JSON any keys existence check
const result = await Author.where({ resume__has_any_keys: ["a", "b"] }).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume) ?| ARRAY['a', 'b']
```

</td>
</tr>
<tr>
<td>

```js
// JSON path access
const result = await Author.where({ resume__start_date__time: "12:00:00" }).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume #> ARRAY['start_date', 'time']) = '"12:00:00"'
```

</td>
</tr>
<tr>
<td>

```js
// JSON contains check
const result = await Author.where({
  resume__contains: { start_date: "2025-01-01" }
}).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume) @> '{"start_date":"2025-01-01"}'
```

</td>
</tr>
<tr>
<td>

```js
// JSON contained by check
const result = await Author.where({
  resume__contained_by: { start_date: "2025-01-01" }
}).exec();
```

</td>
<td>

```sql
SELECT * FROM author T
WHERE (T.resume) <@ '{"start_date":"2025-01-01"}'
```

</td>
</tr>
</table>

### Date Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Year query
const result = await ViewLog.where({ ctime__year: 2025 }).exec();
```

</td>
<td>

```sql
SELECT * FROM view_log T
WHERE T.ctime BETWEEN '2025-01-01' AND '2025-12-31'
```

</td>
</tr>
<tr>
<td>

```js
// Month query
const result = await ViewLog.where({ ctime__month: 1 }).exec();
```

</td>
<td>

```sql
SELECT * FROM view_log T
WHERE EXTRACT(MONTH FROM T.ctime) = 1
```

</td>
</tr>
<tr>
<td>

```js
// Day query
const result = await ViewLog.where({ ctime__day: 15 }).exec();
```

</td>
<td>

```sql
SELECT * FROM view_log T
WHERE EXTRACT(DAY FROM T.ctime) = 15
```

</td>
</tr>
</table>

### Ordering

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Single field ordering
const result = await Blog.order_by("name").exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
ORDER BY T.name
```

</td>
</tr>
<tr>
<td>

```js
// Descending order
const result = await Blog.order_by("-name").exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
ORDER BY T.name DESC
```

</td>
</tr>
<tr>
<td>

```js
// Multiple field ordering
const result = await Blog.order_by("name", "-id").exec();
```

</td>
<td>

```sql
SELECT * FROM blog T
ORDER BY T.name, T.id DESC
```

</td>
</tr>
<tr>
<td>

```js
// Foreign key field ordering
const result = await Entry.order_by("blog_id__name").exec();
```

</td>
<td>

```sql
SELECT * FROM entry T
INNER JOIN blog T1 ON (T.blog_id = T1.id)
ORDER BY T1.name
```

</td>
</tr>
</table>

### Aggregation Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Group by query
const result = await Book.group_by("name")
  .annotate({ price_total: Sum("price") })
  .exec();
```

</td>
<td>

```sql
SELECT T.name, SUM(T.price) AS price_total
FROM book T
GROUP BY T.name
```

</td>
</tr>
<tr>
<td>

```js
// Aggregation functions
const result = await Book.annotate({ price_total: Sum("price") }).exec();
```

</td>
<td>

```sql
SELECT SUM(T.price) AS price_total
FROM book T
```

</td>
</tr>
<tr>
<td>

```js
const result = await Book.annotate([Sum("price")]).exec(); // auto alias as price_sum
```

</td>
<td>

```sql
SELECT SUM(T.price) AS price_sum
FROM book T
```

</td>
</tr>
<tr>
<td>

```js
// Multiple aggregations
const result = await Book.annotate({
  price_sum: Sum("price"),
  price_avg: Avg("price"),
  price_max: Max("price"),
  price_min: Min("price"),
  book_count: Count("id")
}).exec();
```

</td>
<td>

```sql
SELECT
  SUM(T.price) AS price_sum,
  AVG(T.price) AS price_avg,
  MAX(T.price) AS price_max,
  MIN(T.price) AS price_min,
  COUNT(T.id) AS book_count
FROM book T
```

</td>
</tr>
<tr>
<td>

```js
// HAVING clause
const result = await Book.group_by("name")
  .annotate([Sum("price")])
  .having({ price_sum__gt: 100 })
  .exec();
```

</td>
<td>

```sql
SELECT T.name, SUM(T.price) AS price_sum
FROM book T
GROUP BY T.name
HAVING SUM(T.price) > 100
```

</td>
</tr>
<tr>
<td>

```js
// Complex HAVING conditions
const result = await Book.group_by("name")
  .annotate([Sum("price")])
  .having(Q({ price_sum__lt: 100 }).or(Q({ price_sum__gt: 200 })))
  .exec();
```

</td>
<td>

```sql
SELECT T.name, SUM(T.price) AS price_sum
FROM book T
GROUP BY T.name
HAVING (SUM(T.price) < 100) OR (SUM(T.price) > 200)
```

</td>
</tr>
</table>

### Field Expressions

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Field operations
const result = await Book.annotate({
  double_price: F("price").mul(2)
}).exec();
```

</td>
<td>

```sql
SELECT (T.price * 2) AS double_price
FROM book T
```

</td>
</tr>
<tr>
<td>

```js
// Field-to-field operations
const result = await Book.annotate({
  price_per_page: F("price").div(F("pages"))
}).exec();
```

</td>
<td>

```sql
SELECT (T.price / T.pages) AS price_per_page
FROM book T
```

</td>
</tr>
<tr>
<td>

```js
// String concatenation
const result = await Entry.update({
  headline: F("headline") + " suffix by function"
}).where({ id: 1 }).exec();
```

</td>
<td>

```sql
UPDATE entry T
SET headline = (T.headline || ' suffix by function')
WHERE T.id = 1
```

</td>
</tr>
</table>

### Related Query Counting

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Left join counting
const result = await Blog.annotate({
  entry_count: Count("entry")
}).exec();
```

</td>
<td>

```sql
SELECT COUNT(T1.id) AS entry_count
FROM blog T
LEFT JOIN entry T1 ON (T.id = T1.blog_id)
```

</td>
</tr>
</table>

## Insert Operations

### Basic Insert

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Insert single record
const result = await Blog.insert({
  name: "New Blog",
  tagline: "New blog tagline"
}).exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES ('New Blog', 'New blog tagline')
```

</td>
</tr>
<tr>
<td>

```js
// Insert and return specified fields
const result = await Blog.insert({
  name: "Return Test Blog",
  tagline: "Return test tagline"
}).returning("id", "name").exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES ('Return Test Blog', 'Return test tagline')
RETURNING id, name
```

</td>
</tr>
<tr>
<td>

```js
// Return all fields
const result = await Blog.insert({
  name: "All Fields Blog"
}).returning("*").exec();
```

</td>
<td>

```sql
INSERT INTO blog (name)
VALUES ('All Fields Blog')
RETURNING *
```

</td>
</tr>
</table>

### Bulk Insert

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Bulk insert
const result = await Blog.insert([
  { name: "bulk insert 1", tagline: "bulk insert 1" },
  { name: "bulk insert 2", tagline: "bulk insert 2" }
]).exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('bulk insert 1', 'bulk insert 1'),
  ('bulk insert 2', 'bulk insert 2')
```

</td>
</tr>
<tr>
<td>

```js
// Bulk insert with return
const result = await Blog.insert([
  { name: "bulk return 1", tagline: "bulk return 1" },
  { name: "bulk return 2", tagline: "bulk return 2" }
]).returning("*").exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('bulk return 1', 'bulk return 1'),
  ('bulk return 2', 'bulk return 2')
RETURNING *
```

</td>
</tr>
</table>

### Insert from Subquery

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Insert from SELECT subquery
const result = await BlogBin.insert(
  Blog.where({ name: "Second Blog" }).select("name", "tagline")
).exec();
```

</td>
<td>

```sql
INSERT INTO blog_bin (name, tagline)
SELECT T.name, T.tagline
FROM blog T
WHERE T.name = 'Second Blog'
```

</td>
</tr>
<tr>
<td>

```js
// Insert with specified column names
const result = await BlogBin.insert(
  Blog.where({ name: "First Blog" })
    .select("name", "tagline")
    .select_literal("select from another blog"),
  ["name", "tagline", "note"]
).exec();
```

</td>
<td>

```sql
INSERT INTO blog_bin (name, tagline, note)
SELECT T.name, T.tagline, 'select from another blog'
FROM blog T
WHERE T.name = 'First Blog'
```

</td>
</tr>
<tr>
<td>

```js
// Insert from UPDATE RETURNING
const result = await BlogBin.insert(
  Blog.update({ name: "update returning 2" })
    .where({ name: "update returning" })
    .returning("name", "tagline")
    .returning_literal("'update from another blog'"),
  ["name", "tagline", "note"]
).returning("name", "tagline", "note").exec();
```

</td>
<td>

```sql
INSERT INTO blog_bin (name, tagline, note)
WITH updated AS (
  UPDATE blog T
  SET name = 'update returning 2'
  WHERE T.name = 'update returning'
  RETURNING T.name, T.tagline, 'update from another blog' AS note
)
SELECT * FROM updated
RETURNING name, tagline, note
```

</td>
</tr>
<tr>
<td>

```js
// Insert from DELETE RETURNING
const result = await BlogBin.insert(
  Blog.delete({ name: "delete returning" })
    .returning("name", "tagline")
    .returning_literal("'deleted from another blog'"),
  ["name", "tagline", "note"]
).returning("name", "tagline", "note").exec();
```

</td>
<td>

```sql
INSERT INTO blog_bin (name, tagline, note)
WITH deleted AS (
  DELETE FROM blog T
  WHERE T.name = 'delete returning'
  RETURNING T.name, T.tagline, 'deleted from another blog' AS note
)
SELECT * FROM deleted
RETURNING name, tagline, note
```

</td>
</tr>
</table>

### Column-Specific Insert

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Insert only specified columns
const result = await BlogBin.insert(
  {
    name: "Column Test Blog",
    tagline: "Column test tagline",
    note: "should not be inserted"
  },
  ["name", "tagline"] // Only insert these two columns
).returning("name", "tagline", "note").exec();
```

</td>
<td>

```sql
INSERT INTO blog_bin (name, tagline)
VALUES ('Column Test Blog', 'Column test tagline')
RETURNING name, tagline, note
```

</td>
</tr>
</table>

## Update Operations

### Basic Update

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Basic update
const result = await Blog.where({ name: "First Blog" })
  .update({ tagline: "changed tagline" })
  .returning("*")
  .exec();
```

</td>
<td>

```sql
UPDATE blog T
SET tagline = 'changed tagline'
WHERE T.name = 'First Blog'
RETURNING *
```

</td>
</tr>
<tr>
<td>

```js
// Update using field expressions
const result = await Entry.update({ headline: F("blog_id__name") })
  .where({ id: 1 })
  .returning("headline")
  .exec();
```

</td>
<td>

```sql
UPDATE entry T
SET headline = T1.name
FROM blog T1
WHERE T.blog_id = T1.id AND T.id = 1
RETURNING T.headline
```

</td>
</tr>
<tr>
<td>

```js
// Field arithmetic update
const result = await Entry.update({
  headline: F("headline") + " suffix by function"
}).where({ id: 1 }).returning("headline").exec();
```

</td>
<td>

```sql
UPDATE entry T
SET headline = (T.headline || ' suffix by function')
WHERE T.id = 1
RETURNING T.headline
```

</td>
</tr>
</table>

### Field Increment

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Single field increment
const result = await Entry.increase({ rating: 1 })
  .where({ id: 1 })
  .returning("rating")
  .exec();
```

</td>
<td>

```sql
UPDATE entry T
SET rating = (T.rating + 1)
WHERE T.id = 1
RETURNING T.rating
```

</td>
</tr>
<tr>
<td>

```js
// Multiple field increment
const result = await Entry.increase({
  number_of_comments: 1,
  number_of_pingbacks: 2
}).where({ id: 1 }).returning("*").exec();
```

</td>
<td>

```sql
UPDATE entry T
SET
  number_of_comments = (T.number_of_comments + 1),
  number_of_pingbacks = (T.number_of_pingbacks + 2)
WHERE T.id = 1
RETURNING *
```

</td>
</tr>
<tr>
<td>

```js
// String parameter increment
const result = await Entry.increase("rating", 2)
  .where({ id: 1 })
  .returning("rating")
  .exec();
```

</td>
<td>

```sql
UPDATE entry T
SET rating = (T.rating + 2)
WHERE T.id = 1
RETURNING T.rating
```

</td>
</tr>
</table>

### Update with Joins

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Update with foreign key conditions
const result = await Entry.update({
  headline: F("headline") + " from first blog"
}).where({
  blog_id__name: "First Blog"
}).returning("id", "headline").exec();
```

</td>
<td>

```sql
UPDATE entry T
SET headline = (T.headline || ' from first blog')
FROM blog T1
WHERE T.blog_id = T1.id AND T1.name = 'First Blog'
RETURNING T.id, T.headline
```

</td>
</tr>
</table>

## Advanced Operations

### MERGE Operations

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Basic merge (update if exists, insert if not)
const result = await Blog.merge([
  { name: "First Blog", tagline: "updated by merge" },
  { name: "Blog added by merge", tagline: "inserted by merge" }
]).exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('First Blog', 'updated by merge'),
  ('Blog added by merge', 'inserted by merge')
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
```

</td>
</tr>
<tr>
<td>

```js
// Insert only non-existing records
const result = await Blog.merge([
  { name: "First Blog" }, // exists, no update
  { name: "Blog added by merge" } // doesn't exist, insert
]).exec();
```

</td>
<td>

```sql
INSERT INTO blog (name)
VALUES ('First Blog'), ('Blog added by merge')
ON CONFLICT (name) DO NOTHING
```

</td>
</tr>
</table>

### UPSERT Operations

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// UPSERT (update if exists, insert if not, return both)
const result = await Blog.upsert([
  { name: "First Blog", tagline: "updated by upsert" },
  { name: "Blog added by upsert", tagline: "inserted by upsert" }
]).exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('First Blog', 'updated by upsert'),
  ('Blog added by upsert', 'inserted by upsert')
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
RETURNING *
```

</td>
</tr>
<tr>
<td>

```js
// UPSERT from subquery
const result = await Blog.upsert(
  BlogBin.update({ tagline: "updated by upsert returning" })
    .returning("name", "tagline")
).returning("id", "name", "tagline").exec();
```

</td>
<td>

```sql
WITH source AS (
  UPDATE blog_bin T
  SET tagline = 'updated by upsert returning'
  RETURNING T.name, T.tagline
)
INSERT INTO blog (name, tagline)
SELECT name, tagline FROM source
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
RETURNING id, name, tagline
```

</td>
</tr>
<tr>
<td>

```js
// UPSERT from SELECT subquery
const result = await Blog.upsert(
  BlogBin.where({
    name__notin: Blog.select("name").distinct()
  }).select("name", "tagline").distinct("name")
).returning("id", "name", "tagline").exec();
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
SELECT DISTINCT T.name, T.tagline
FROM blog_bin T
WHERE T.name NOT IN (
  SELECT DISTINCT T.name FROM blog T
)
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
RETURNING id, name, tagline
```

</td>
</tr>
</table>

### UPDATES Operations

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Bulk update (only update existing records)
const result = await Blog.updates([
  { name: "Third Blog", tagline: "Updated by updates" },
  { name: "Fourth Blog", tagline: "wont update" } // doesn't exist, no update
]).exec();
```

</td>
<td>

```sql
WITH V(name, tagline) AS (
  VALUES
    ('Third Blog', 'Updated by updates'),
    ('Fourth Blog', 'wont update')
)
UPDATE blog T
SET tagline = V.tagline
FROM V
WHERE V.name = T.name
```

</td>
</tr>
<tr>
<td>

```js
// Bulk update from SELECT subquery
const result = await BlogBin.updates(
  Blog.where({ name: "Second Blog" }).select("name", "tagline"),
  "name" // match field
).returning("*").exec();
```

</td>
<td>

```sql
WITH V(name, tagline) AS (
  SELECT T.name, T.tagline
  FROM blog T
  WHERE T.name = 'Second Blog'
)
UPDATE blog_bin T
SET tagline = V.tagline
FROM V
WHERE V.name = T.name
RETURNING *
```

</td>
</tr>
<tr>
<td>

```js
// Bulk update from UPDATE subquery
const result = await BlogBin.updates(
  Blog.where({ name: "Third Blog" })
    .update({ tagline: "XXX" })
    .returning("name", "tagline"),
  "name"
).exec();
```

</td>
<td>

```sql
WITH V(name, tagline) AS (
  UPDATE blog T
  SET tagline = 'XXX'
  WHERE T.name = 'Third Blog'
  RETURNING T.name, T.tagline
)
UPDATE blog_bin T
SET tagline = V.tagline
FROM V
WHERE V.name = T.name
```

</td>
</tr>
</table>

### MERGE_GETS Operations

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Merge then query
const result = await Blog.select("name")
  .merge_gets([
    { id: 1, name: "Merged First Blog" },
    { id: 2, name: "Merged Second Blog" }
  ], "id")
  .exec();
```

</td>
<td>

```sql
WITH V(id, name) AS (
  VALUES (1, 'Merged First Blog'), (2, 'Merged Second Blog')
)
INSERT INTO blog (id, name)
SELECT * FROM V
ON CONFLICT (id)
DO UPDATE SET name = EXCLUDED.name;

SELECT T.name
FROM blog T
WHERE T.id IN (1, 2)
```

</td>
</tr>
<tr>
<td>

```js
// Merge then query (query after)
const result = await Blog.merge_gets([
  { id: 1, name: "Merged First Blog" },
  { id: 2, name: "Merged Second Blog" }
], "id")
.select("name")
.exec();
```

</td>
<td>

```sql
WITH V(id, name) AS (
  VALUES (1, 'Merged First Blog'), (2, 'Merged Second Blog')
)
INSERT INTO blog (id, name)
SELECT * FROM V
ON CONFLICT (id)
DO UPDATE SET name = EXCLUDED.name;

SELECT T.name
FROM blog T
WHERE T.id IN (1, 2)
```

</td>
</tr>
</table>

## Delete Operations

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Basic delete
const result = await Blog.delete({ name: "Blog to delete" }).exec();
```

</td>
<td>

```sql
DELETE FROM blog T
WHERE T.name = 'Blog to delete'
```

</td>
</tr>
<tr>
<td>

```js
// Delete with return
const result = await Blog.delete({ name: "Blog to delete" })
  .returning("*")
  .exec();
```

</td>
<td>

```sql
DELETE FROM blog T
WHERE T.name = 'Blog to delete'
RETURNING *
```

</td>
</tr>
<tr>
<td>

```js
// Conditional delete
const result = await Blog.delete({ name__startswith: "temp" }).exec();
```

</td>
<td>

```sql
DELETE FROM blog T
WHERE T.name LIKE 'temp%'
```

</td>
</tr>
<tr>
<td>

```js
// Delete all records
const result = await Blog.delete().exec();
```

</td>
<td>

```sql
DELETE FROM blog T
```

</td>
</tr>
</table>

## Convenience Methods

### Create Records

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Create single record and return complete object
const blog = await Blog.create({
  name: "Created Blog",
  tagline: "Created tagline"
});
```

</td>
<td>

```sql
INSERT INTO blog (name, tagline)
VALUES ('Created Blog', 'Created tagline')
RETURNING *
```

</td>
</tr>
</table>

### Get Single Record

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Get single record
const blog = await Blog.where({ id: 1 }).get();
```

</td>
<td>

```sql
SELECT * FROM blog T
WHERE T.id = 1
LIMIT 1
```

</td>
</tr>
<tr>
<td>

```js
// Get specific fields of single record
const blog = await Blog.where({ id: 1 }).select("name").get();
```

</td>
<td>

```sql
SELECT T.name
FROM blog T
WHERE T.id = 1
LIMIT 1
```

</td>
</tr>
</table>

### Flatten Results

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Get array of single column values
const names = await Blog.flat("name");
```

</td>
<td>

```sql
SELECT T.name
FROM blog T
```

</td>
</tr>
<tr>
<td>

```js
// Flatten with conditions
const names = await Blog.where({ tagline__contains: "blog" })
  .order_by("name")
  .flat("name");
```

</td>
<td>

```sql
SELECT T.name
FROM blog T
WHERE T.tagline LIKE '%blog%'
ORDER BY T.name
```

</td>
</tr>
</table>

## Raw Queries

<table>
<tr>
<th>JavaScript</th>
<th>SQL</th>
</tr>
<tr>
<td>

```js
// Execute raw SQL
const result = await Blog.query("SELECT * FROM blog WHERE id = $1", [1]);
```

</td>
<td>

```sql
-- Execute raw SQL (parameterized query)
SELECT * FROM blog WHERE id = $1
-- Parameters: [1]
```

</td>
</tr>
<tr>
<td>

```js
// Get SQL statement (without execution)
const sql = Blog.where({ id: 1 }).statement();
console.log(sql); // "SELECT * FROM blog T WHERE T.id = 1"
```

</td>
<td>

```sql
-- Returns SQL string without execution
SELECT * FROM blog T WHERE T.id = 1
```

</td>
</tr>
</table>

## Field Types

### Basic Types

```js
const Model = Model({
  table_name: "example",
  fields: {
    // String type
    name: { type: "string", maxlength: 100, minlength: 2 },
    title: { maxlength: 200 }, // defaults to string type

    // Text type
    content: { type: "text" },

    // Integer type
    age: { type: "integer", min: 0, max: 150 },

    // Float type
    price: { type: "float" },

    // Boolean type
    is_active: { type: "boolean", default: true },

    // Date type
    birth_date: { type: "date" },

    // DateTime type
    created_at: { type: "datetime" },

    // Email type
    email: { type: "email" },

    // JSON type
    metadata: { type: "json" },

    // Foreign key reference
    user_id: { reference: User },

    // Composite field
    profile: { model: Profile }
  }
});
```

### Field Constraints

```js
const Model = Model({
  table_name: "example",
  fields: {
    // Unique constraint
    username: { unique: true },

    // Not null constraint
    email: { null: false },

    // Default value
    status: { default: "active" },

    // Label (for form display, etc.)
    name: { label: "Name" },

    // Compact storage (for long text)
    content: { compact: false }
  }
});
```

### Model Options

```js
const Model = Model({
  // Table name
  table_name: "my_table",

  // Auto create primary key
  auto_primary_key: true, // default true

  // Composite unique constraint
  unique_together: ["field1", "field2"],

  // Model inheritance
  mixins: [BaseModel],

  // Field definitions
  fields: {
    // ...
  }
});
```

## Error Handling

```js
try {
  // Unique constraint violation
  await Blog.insert({ name: "First Blog" }).exec();
} catch (error) {
  console.error("Insert failed:", error.message);
}

try {
  // Field length exceeded
  await Blog.insert({
    name: "This name is way too long and exceeds the maximum length"
  }).exec();
} catch (error) {
  console.error("Field validation failed:", error.message);
}

try {
  // Age out of range
  await Author.insert({ name: "Tom", age: 101 }).exec();
} catch (error) {
  console.error("Age validation failed:", error.message);
}
```

## Debugging

```js
// Get SQL statement without execution
const sql = Blog.where({ id: 1 }).statement();
console.log(sql);

// Enable full SQL matching (for testing)
process.env.SQL_WHOLE_MATCH = true;
```

## Best Practices

1. **Model Definition**: Define related models in the same file for easier foreign key relationship management
2. **Field Validation**: Make full use of field constraints for data validation
3. **Query Optimization**: Use `select()` to query only needed fields
4. **Transaction Handling**: Consider using database transactions for complex operations
5. **Error Handling**: Always wrap database operations in try-catch blocks
6. **Index Optimization**: Add database indexes for frequently queried fields

This ORM provides rich query interfaces and flexible data manipulation methods that can meet the needs of most PostgreSQL applications.

## Database Migration Tool

The library includes a powerful database migration tool that can generate SQL migration scripts by comparing model definitions.

### Usage

```javascript
import { generate_migration_sql, create_table_sql } from './lib/migrate.mjs';

// Define your model
const user_model = {
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

// Create table SQL
const create_sql = create_table_sql(user_model);
console.log(create_sql);

// Generate migration SQL (from old model to new model)
const migration_sql = generate_migration_sql(old_model, new_model);
console.log(migration_sql);
```

### Supported Field Types

- **string**: VARCHAR with specified length
- **text**: TEXT field for long content
- **integer**: Integer numbers
- **float**: Floating point numbers with optional precision
- **boolean**: Boolean true/false values
- **date**: Date only (YYYY-MM-DD)
- **datetime**: Timestamp with optional timezone
- **time**: Time only with optional timezone
- **uuid**: UUID with automatic generation
- **json**: JSONB for structured data
- **foreignkey**: Foreign key relationships
- **year/month**: Integer fields for year/month values
- **year_month**: VARCHAR for year-month combinations

### Migration Features

- **Table Creation**: Generate CREATE TABLE statements
- **Field Addition/Removal**: Add or remove columns
- **Type Changes**: Convert between compatible field types
- **Constraint Management**: Handle PRIMARY KEY, UNIQUE, NOT NULL constraints
- **Index Management**: Create and drop indexes
- **Foreign Key Management**: Add, remove, and modify foreign key relationships
- **Default Values**: Handle default value changes
- **Field Renaming**: Automatic detection of field renames
- **Unique Together**: Manage composite unique constraints

### Example Migration Output

```sql
-- Creating a new table
CREATE TABLE users(
  id SERIAL PRIMARY KEY NOT NULL,
  name varchar(100) NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  created_at timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Adding a field
ALTER TABLE users ADD COLUMN phone varchar(20);

-- Modifying field type
ALTER TABLE users ALTER COLUMN name TYPE text;

-- Adding foreign key
ALTER TABLE products ADD CONSTRAINT products_category_id_fkey
FOREIGN KEY (category_id) REFERENCES "categories" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

## Testing

Run the test suite:

```bash
npm test
```

Run migration tool tests specifically:

```bash
npm test __test__/migrate.test.mjs
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
