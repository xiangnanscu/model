# @xiangnanscu/model

[English](README.md) | [中文](README.zh-CN.md)

[@xiangnanscu/model](https://xiangnanscu.github.io/model/) 一个声明式的、直观且强大的 PostgreSQL ORM 库。

## 安装

```sh
npm install -g @xiangnanscu/model
```

## 快速开始

### 数据库配置

```js
import Model from "@xiangnanscu/model";
import postgres from "postgres";

// 配置数据库连接
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
```

### 模型定义

```js
// 基础模型定义
const User = Model({
  table_name: "user",
  fields: {
    username: { maxlength: 20, minlength: 2, unique: true },
    password: { type: "text" },
  },
});

const Blog = Model({
  table_name: "blog",
  fields: {
    name: { maxlength: 20, minlength: 2, unique: true },
    tagline: { type: "text", default: "default tagline" },
  },
});

// 带外键关系的模型
const Entry = Model({
  table_name: "entry",
  fields: {
    blog_id: { reference: Blog, related_query_name: "entry" },
    reposted_blog_id: { reference: Blog, related_query_name: "reposted_entry" },
    headline: { maxlength: 255, compact: false },
    body_text: { type: "text" },
    pub_date: { type: "date" },
    mod_date: { type: "date" },
    number_of_comments: { type: "integer" },
    number_of_pingbacks: { type: "integer" },
    rating: { type: "integer" },
  },
});

// 带复合字段的模型
const Author = Model({
  table_name: "author",
  fields: {
    name: { label: "姓名", maxlength: 200, unique: true },
    email: { type: "email" },
    age: { type: "integer", max: 100, min: 10 },
    resume: { model: Resume }, // JSON 字段
  },
});

// 模型继承（mixins）
const BlogBin = Model({
  table_name: "blog_bin",
  mixins: [Blog],
  fields: {
    name: { unique: false }, // 覆盖父模型的 unique 属性
    note: { type: "text" },
  },
});

// 无自动主键的模型
const Resume = Model({
  auto_primary_key: false,
  table_name: "resume",
  unique_together: ["start_date", "end_date", "company", "position"],
  fields: {
    start_date: { type: "date" },
    end_date: { type: "date" },
    company: { maxlength: 20 },
    position: { maxlength: 20 },
    description: { maxlength: 200 },
  },
});
```

## 查询操作

```js
// 获取辅助函数
const Q = Model.Q;
const F = Model.F;
const Sum = Model.Sum;
const Avg = Model.Avg;
const Max = Model.Max;
const Min = Model.Min;
const Count = Model.Count;
```
### 基础查询

```js
// 查询所有记录
const blogs = await Blog.exec();
```

```sql
SELECT * FROM blog T
```

---

```js
// 条件查询
const blog = await Blog.where({ id: 1 }).get();
```

```sql
SELECT * FROM blog T
WHERE T.id = 1
```

---

```js
const blogs = await Blog.where({ name: "First Blog" }).exec();
```

```sql
SELECT * FROM blog T
WHERE T.name = 'First Blog'
```

---

```js
// 字符串条件查询
const result = await Blog.where("name", "First Blog").exec();
```

```sql
SELECT * FROM blog T
WHERE T.name = 'First Blog'
```

### 字段选择

```js
// 选择单个字段
const result = await Blog.select("name").where({ id: 1 }).exec();
// 结果: [{ name: "First Blog" }]
```

```sql
SELECT T.name
FROM blog T
WHERE T.id = 1
```

---

```js
// 选择多个字段
const result = await Blog.select("name", "tagline").where({ id: 1 }).exec();
// 或者使用数组形式
const result = await Blog.select(["name", "tagline"]).where({ id: 1 }).exec();
```

```sql
SELECT T.name, T.tagline
FROM blog T
WHERE T.id = 1
```

---

```js
// 字段别名
const result = await Blog.select_as({
  name: "blog_name",
  tagline: "blog_tagline"
}).where({ id: 1 }).exec();
```

```sql
SELECT T.name AS blog_name, T.tagline AS blog_tagline
FROM blog T
WHERE T.id = 1
```

---

```js
// 字面量选择
const result = await Blog.select_literal("'Hello World'")
  .select(["name"])
  .where({ id: 1 })
  .exec();
```

```sql
SELECT 'Hello World' AS "?column?", T.name
FROM blog T
WHERE T.id = 1
```

---

```js
// 字面量别名
const result = await Blog.select_literal_as({
  "'Hello World'": "greeting"
}).select(["id"]).where({ id: 1 }).exec();
```

```sql
SELECT 'Hello World' AS greeting, T.id
FROM blog T
WHERE T.id = 1
```

### 外键查询

```js
// 查询外键字段
const result = await Book.select("name", "author__name").where({ id: 1 }).exec();
```

```sql
SELECT T.name, T1.name AS author__name
FROM book T
INNER JOIN author T1 ON (T.author = T1.id)
WHERE T.id = 1
```

---

```js
// 嵌套外键查询
const result = await ViewLog.select("entry_id__blog_id__name").where({ id: 1 }).exec();
```

```sql
SELECT T2.name AS entry_id__blog_id__name
FROM view_log T
INNER JOIN entry T1 ON (T.entry_id = T1.id)
INNER JOIN blog T2 ON (T1.blog_id = T2.id)
WHERE T.id = 1
```

---

```js
// 反向外键查询
const result = await Blog.select("id", "name", "entry__rating")
  .where({ name: "Second Blog" })
  .exec();
```

```sql
SELECT T.id, T.name, T1.rating AS entry__rating
FROM blog T
INNER JOIN entry T1 ON (T.id = T1.blog_id)
WHERE T.name = 'Second Blog'
```

### 条件查询

```js
// 基础条件
const result = await Book.where({ price: 100 }).exec();
```

```sql
SELECT * FROM book T
WHERE T.price = 100
```

---

```js
// 比较操作符
const result = await Book.where({ price__gt: 100 }).exec(); // 大于
```

```sql
SELECT * FROM book T
WHERE T.price > 100
```

---

```js
const result = await Book.where({ price__lt: 100 }).exec(); // 小于
```

```sql
SELECT * FROM book T
WHERE T.price < 100
```

---

```js
const result = await Book.where({ price__gte: 100 }).exec(); // 大于等于
```

```sql
SELECT * FROM book T
WHERE T.price >= 100
```

---

```js
const result = await Book.where({ price__lte: 100 }).exec(); // 小于等于
```

```sql
SELECT * FROM book T
WHERE T.price <= 100
```

---

```js
// 字符串操作
const result = await Blog.where({ name__contains: "blog" }).exec(); // 包含
```

```sql
SELECT * FROM blog T
WHERE T.name LIKE '%blog%'
```

---

```js
const result = await Blog.where({ name__startswith: "First" }).exec(); // 开始于
```

```sql
SELECT * FROM blog T
WHERE T.name LIKE 'First%'
```

---

```js
const result = await Blog.where({ name__endswith: "Blog" }).exec(); // 结束于
```

```sql
SELECT * FROM blog T
WHERE T.name LIKE '%Blog'
```

---

```js
// 列表操作
const result = await Blog.where({ id__in: [1, 2, 3] }).exec(); // 在列表中
```

```sql
SELECT * FROM blog T
WHERE T.id IN (1, 2, 3)
```

---

```js
const result = await Blog.where({ id__notin: [1, 2, 3] }).exec(); // 不在列表中
```

```sql
SELECT * FROM blog T
WHERE T.id NOT IN (1, 2, 3)
```

---

```js
// 空值检查
const result = await Blog.where({ tagline__isnull: true }).exec(); // 为空
```

```sql
SELECT * FROM blog T
WHERE T.tagline IS NULL
```

---

```js
const result = await Blog.where({ tagline__notnull: true }).exec(); // 不为空
```

```sql
SELECT * FROM blog T
WHERE T.tagline IS NOT NULL
```

### 复杂条件查询

```js
// 使用 Q 对象进行复杂查询
const result = await Book.where(
  Q({ price__gt: 100 }).or(Q({ price__lt: 200 }))
).exec();
```

```sql
SELECT * FROM book T
WHERE (T.price > 100) OR (T.price < 200)
```

---

```js
// 否定条件
const result = await Book.where(Q({ price__gt: 100 }).not()).exec();
```

```sql
SELECT * FROM book T
WHERE NOT (T.price > 100)
```

---

```js
// 组合条件
const result = await Book.where(
  Q({ id: 1 }).and(Q({ price__gt: 100 }).or(Q({ price__lt: 200 })))
).exec();
```

```sql
SELECT * FROM book T
WHERE (T.id = 1) AND ((T.price > 100) OR (T.price < 200))
```

### 外键条件查询

```js
// 外键等值查询
const result = await Entry.where({ blog_id: 1 }).exec();
const result = await Entry.where({ blog_id__id: 1 }).exec(); // 等效
```

```sql
SELECT * FROM entry T
WHERE T.blog_id = 1
```

---

```js
// 外键字段查询
const result = await Entry.where({ blog_id__name: "my blog name" }).exec();
```

```sql
SELECT * FROM entry T
INNER JOIN blog T1 ON (T.blog_id = T1.id)
WHERE T1.name = 'my blog name'
```

---

```js
// 嵌套外键查询
const result = await ViewLog.where({ entry_id__blog_id__name: "my blog name" }).exec();
```

```sql
SELECT * FROM view_log T
INNER JOIN entry T1 ON (T.entry_id = T1.id)
INNER JOIN blog T2 ON (T1.blog_id = T2.id)
WHERE T2.name = 'my blog name'
```

---

```js
// 反向外键查询
const result = await Blog.where({ entry__rating: 1 }).exec();
```

```sql
SELECT * FROM blog T
INNER JOIN entry T1 ON (T.id = T1.blog_id)
WHERE T1.rating = 1
```

### JSON 字段查询

```js
// JSON 键存在检查
const result = await Author.where({ resume__has_key: "start_date" }).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume) ? 'start_date'
```

---

```js
// JSON 多键存在检查
const result = await Author.where({ resume__0__has_keys: ["a", "b"] }).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume #> ARRAY['0']) ?& ARRAY['a', 'b']
```

---

```js
// JSON 任意键存在检查
const result = await Author.where({ resume__has_any_keys: ["a", "b"] }).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume) ?| ARRAY['a', 'b']
```

---

```js
// JSON 路径访问
const result = await Author.where({ resume__start_date__time: "12:00:00" }).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume #> ARRAY['start_date', 'time']) = '"12:00:00"'
```

---

```js
// JSON 包含检查
const result = await Author.where({
  resume__contains: { start_date: "2025-01-01" }
}).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume) @> '{"start_date":"2025-01-01"}'
```

---

```js
// JSON 被包含检查
const result = await Author.where({
  resume__contained_by: { start_date: "2025-01-01" }
}).exec();
```

```sql
SELECT * FROM author T
WHERE (T.resume) <@ '{"start_date":"2025-01-01"}'
```

### 日期查询

```js
// 年份查询
const result = await ViewLog.where({ ctime__year: 2025 }).exec();
```

```sql
SELECT * FROM view_log T
WHERE T.ctime BETWEEN '2025-01-01' AND '2025-12-31'
```

---

```js
// 月份查询
const result = await ViewLog.where({ ctime__month: 1 }).exec();
```

```sql
SELECT * FROM view_log T
WHERE EXTRACT(MONTH FROM T.ctime) = 1
```

---

```js
// 日期查询
const result = await ViewLog.where({ ctime__day: 15 }).exec();
```

```sql
SELECT * FROM view_log T
WHERE EXTRACT(DAY FROM T.ctime) = 15
```

### 排序

```js
// 单字段排序
const result = await Blog.order_by(["name"]).exec();
```

```sql
SELECT * FROM blog T
ORDER BY T.name
```

---

```js
// 降序排序
const result = await Blog.order_by(["-name"]).exec();
```

```sql
SELECT * FROM blog T
ORDER BY T.name DESC
```

---

```js
// 多字段排序
const result = await Blog.order_by(["name", "-id"]).exec();
```

```sql
SELECT * FROM blog T
ORDER BY T.name, T.id DESC
```

---

```js
// 外键字段排序
const result = await Entry.order_by(["blog_id__name"]).exec();
```

```sql
SELECT * FROM entry T
INNER JOIN blog T1 ON (T.blog_id = T1.id)
ORDER BY T1.name
```

### 聚合查询

```js
// 分组查询
const result = await Book.group_by(["name"])
  .annotate({ price_total: Sum("price") })
  .exec();
```

```sql
SELECT T.name, SUM(T.price) AS price_total
FROM book T
GROUP BY T.name
```

---

```js
// 聚合函数
const result = await Book.annotate({ price_total: Sum("price") }).exec();
```

```sql
SELECT SUM(T.price) AS price_total
FROM book T
```

---

```js
const result = await Book.annotate([Sum("price")]).exec(); // 自动别名为 price_sum
```

```sql
SELECT SUM(T.price) AS price_sum
FROM book T
```

---

```js
// 多种聚合
const result = await Book.annotate({
  price_sum: Sum("price"),
  price_avg: Avg("price"),
  price_max: Max("price"),
  price_min: Min("price"),
  book_count: Count("id")
}).exec();
```

```sql
SELECT
  SUM(T.price) AS price_sum,
  AVG(T.price) AS price_avg,
  MAX(T.price) AS price_max,
  MIN(T.price) AS price_min,
  COUNT(T.id) AS book_count
FROM book T
```

---

```js
// HAVING 子句
const result = await Book.group_by(["name"])
  .annotate([Sum("price")])
  .having({ price_sum__gt: 100 })
  .exec();
```

```sql
SELECT T.name, SUM(T.price) AS price_sum
FROM book T
GROUP BY T.name
HAVING SUM(T.price) > 100
```

---

```js
// 复杂 HAVING 条件
const result = await Book.group_by(["name"])
  .annotate([Sum("price")])
  .having(Q({ price_sum__lt: 100 }).or(Q({ price_sum__gt: 200 })))
  .exec();
```

```sql
SELECT T.name, SUM(T.price) AS price_sum
FROM book T
GROUP BY T.name
HAVING (SUM(T.price) < 100) OR (SUM(T.price) > 200)
```

### 字段表达式

```js
// 字段运算
const result = await Book.annotate({
  double_price: F("price").mul(2)
}).exec();
```

```sql
SELECT (T.price * 2) AS double_price
FROM book T
```

---

```js
// 字段间运算
const result = await Book.annotate({
  price_per_page: F("price").div(F("pages"))
}).exec();
```

```sql
SELECT (T.price / T.pages) AS price_per_page
FROM book T
```

```js
// 字符串连接
const result = await Entry.update({
  headline: F("headline") + " suffix by function"
}).where({ id: 1 }).exec();
```

```sql
UPDATE entry T
SET headline = (T.headline || ' suffix by function')
WHERE T.id = 1
```

### 关联查询计数

```js
// 左连接计数
const result = await Blog.annotate({
  entry_count: Count("entry")
}).exec();
```

```sql
SELECT COUNT(T1.id) AS entry_count
FROM blog T
LEFT JOIN entry T1 ON (T.id = T1.blog_id)
```

## 插入操作

### 基础插入

```js
// 插入单条记录
const result = await Blog.insert({
  name: "New Blog",
  tagline: "New blog tagline"
}).exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES ('New Blog', 'New blog tagline')
```

---

```js
// 插入并返回指定字段
const result = await Blog.insert({
  name: "Return Test Blog",
  tagline: "Return test tagline"
}).returning(["id", "name"]).exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES ('Return Test Blog', 'Return test tagline')
RETURNING id, name
```

---

```js
// 返回所有字段
const result = await Blog.insert({
  name: "All Fields Blog"
}).returning("*").exec();
```

```sql
INSERT INTO blog (name)
VALUES ('All Fields Blog')
RETURNING *
```

### 批量插入

```js
// 批量插入
const result = await Blog.insert([
  { name: "bulk insert 1", tagline: "bulk insert 1" },
  { name: "bulk insert 2", tagline: "bulk insert 2" }
]).exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('bulk insert 1', 'bulk insert 1'),
  ('bulk insert 2', 'bulk insert 2')
```

---

```js
// 批量插入并返回
const result = await Blog.insert([
  { name: "bulk return 1", tagline: "bulk return 1" },
  { name: "bulk return 2", tagline: "bulk return 2" }
]).returning("*").exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('bulk return 1', 'bulk return 1'),
  ('bulk return 2', 'bulk return 2')
RETURNING *
```

### 从子查询插入

```js
// 从 SELECT 子查询插入
const result = await BlogBin.insert(
  Blog.where({ name: "Second Blog" }).select(["name", "tagline"])
).exec();
```

```sql
INSERT INTO blog_bin (name, tagline)
SELECT T.name, T.tagline
FROM blog T
WHERE T.name = 'Second Blog'
```

---

```js
// 指定列名插入
const result = await BlogBin.insert(
  Blog.where({ name: "First Blog" })
    .select(["name", "tagline"])
    .select_literal("'select from another blog'"),
  ["name", "tagline", "note"]
).exec();
```

```sql
INSERT INTO blog_bin (name, tagline, note)
SELECT T.name, T.tagline, 'select from another blog'
FROM blog T
WHERE T.name = 'First Blog'
```

---

```js
// 从 UPDATE RETURNING 插入
const result = await BlogBin.insert(
  Blog.update({ name: "update returning 2" })
    .where({ name: "update returning" })
    .returning(["name", "tagline"])
    .returning_literal("'update from another blog'"),
  ["name", "tagline", "note"]
).returning(["name", "tagline", "note"]).exec();
```

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

---

```js
// 从 DELETE RETURNING 插入
const result = await BlogBin.insert(
  Blog.delete({ name: "delete returning" })
    .returning(["name", "tagline"])
    .returning_literal("'deleted from another blog'"),
  ["name", "tagline", "note"]
).returning(["name", "tagline", "note"]).exec();
```

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

### 指定列插入

```js
// 只插入指定列
const result = await BlogBin.insert(
  {
    name: "Column Test Blog",
    tagline: "Column test tagline",
    note: "should not be inserted"
  },
  ["name", "tagline"] // 只插入这两列
).returning("name", "tagline", "note").exec();
```

```sql
INSERT INTO blog_bin (name, tagline)
VALUES ('Column Test Blog', 'Column test tagline')
RETURNING name, tagline, note
```

## 更新操作

### 基础更新

```js
// 基础更新
const result = await Blog.where({ name: "First Blog" })
  .update({ tagline: "changed tagline" })
  .returning("*")
  .exec();
```

```sql
UPDATE blog T
SET tagline = 'changed tagline'
WHERE T.name = 'First Blog'
RETURNING *
```

---

```js
// 使用字段表达式更新
const result = await Entry.update({ headline: F("blog_id__name") })
  .where({ id: 1 })
  .returning("headline")
  .exec();
```

```sql
UPDATE entry T
SET headline = T1.name
FROM blog T1
WHERE T.blog_id = T1.id AND T.id = 1
RETURNING T.headline
```

---

```js
// 字段运算更新
const result = await Entry.update({
  headline: F("headline") + " suffix by function"
}).where({ id: 1 }).returning("headline").exec();
```

```sql
UPDATE entry T
SET headline = (T.headline || ' suffix by function')
WHERE T.id = 1
RETURNING T.headline
```

### 字段递增

```js
// 单字段递增
const result = await Entry.increase({ rating: 1 })
  .where({ id: 1 })
  .returning("rating")
  .exec();
```

```sql
UPDATE entry T
SET rating = (T.rating + 1)
WHERE T.id = 1
RETURNING T.rating
```

---

```js
// 多字段递增
const result = await Entry.increase({
  number_of_comments: 1,
  number_of_pingbacks: 2
}).where({ id: 1 }).returning("*").exec();
```

```sql
UPDATE entry T
SET
  number_of_comments = (T.number_of_comments + 1),
  number_of_pingbacks = (T.number_of_pingbacks + 2)
WHERE T.id = 1
RETURNING *
```

---

```js
// 字符串参数递增
const result = await Entry.increase("rating", 2)
  .where({ id: 1 })
  .returning("rating")
  .exec();
```

```sql
UPDATE entry T
SET rating = (T.rating + 2)
WHERE T.id = 1
RETURNING T.rating
```

### 带连接的更新

```js
// 带外键条件的更新
const result = await Entry.update({
  headline: F("headline") + " from first blog"
}).where({
  blog_id__name: "First Blog"
}).returning("id", "headline").exec();
```

```sql
UPDATE entry T
SET headline = (T.headline || ' from first blog')
FROM blog T1
WHERE T.blog_id = T1.id AND T1.name = 'First Blog'
RETURNING T.id, T.headline
```

## 高级操作

### MERGE 操作

```js
// 基础 merge（存在则更新，不存在则插入）
const result = await Blog.merge([
  { name: "First Blog", tagline: "updated by merge" },
  { name: "Blog added by merge", tagline: "inserted by merge" }
]).exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('First Blog', 'updated by merge'),
  ('Blog added by merge', 'inserted by merge')
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
```

---

```js
// 只插入不存在的记录
const result = await Blog.merge([
  { name: "First Blog" }, // 存在，不更新
  { name: "Blog added by merge" } // 不存在，插入
]).exec();
```

```sql
INSERT INTO blog (name)
VALUES ('First Blog'), ('Blog added by merge')
ON CONFLICT (name) DO NOTHING
```

### UPSERT 操作

```js
// UPSERT（存在则更新，不存在则插入，都返回）
const result = await Blog.upsert([
  { name: "First Blog", tagline: "updated by upsert" },
  { name: "Blog added by upsert", tagline: "inserted by upsert" }
]).exec();
```

```sql
INSERT INTO blog (name, tagline)
VALUES
  ('First Blog', 'updated by upsert'),
  ('Blog added by upsert', 'inserted by upsert')
ON CONFLICT (name)
DO UPDATE SET tagline = EXCLUDED.tagline
RETURNING *
```

---

```js
// 从子查询 UPSERT
const result = await Blog.upsert(
  BlogBin.update({ tagline: "updated by upsert returning" })
    .returning(["name", "tagline"])
).returning(["id", "name", "tagline"]).exec();
```

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

---

```js
// 从 SELECT 子查询 UPSERT
const result = await Blog.upsert(
  BlogBin.where({
    name__notin: Blog.select(["name"]).distinct()
  }).select(["name", "tagline"]).distinct("name")
).returning(["id", "name", "tagline"]).exec();
```

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

### UPDATES 操作

```js
// 批量更新（只更新存在的记录）
const result = await Blog.updates([
  { name: "Third Blog", tagline: "Updated by updates" },
  { name: "Fourth Blog", tagline: "wont update" } // 不存在，不更新
]).exec();
```

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

---

```js
// 从 SELECT 子查询批量更新
const result = await BlogBin.updates(
  Blog.where({ name: "Second Blog" }).select(["name", "tagline"]),
  "name" // 匹配字段
).returning("*").exec();
```

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

---

```js
// 从 UPDATE 子查询批量更新
const result = await BlogBin.updates(
  Blog.where({ name: "Third Blog" })
    .update({ tagline: "XXX" })
    .returning(["name", "tagline"]),
  "name"
).exec();
```

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

### MERGE_GETS 操作

```js
// 先 merge 再查询
const result = await Blog.select("name")
  .merge_gets([
    { id: 1, name: "Merged First Blog" },
    { id: 2, name: "Merged Second Blog" }
  ], "id")
  .exec();
```

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

---

```js
// 先 merge 再查询（查询在后）
const result = await Blog.merge_gets([
  { id: 1, name: "Merged First Blog" },
  { id: 2, name: "Merged Second Blog" }
], "id")
.select("name")
.exec();
```

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

## 删除操作

```js
// 基础删除
const result = await Blog.delete({ name: "Blog to delete" }).exec();
```

```sql
DELETE FROM blog T
WHERE T.name = 'Blog to delete'
```

---

```js
// 带返回的删除
const result = await Blog.delete({ name: "Blog to delete" })
  .returning("*")
  .exec();
```

```sql
DELETE FROM blog T
WHERE T.name = 'Blog to delete'
RETURNING *
```

---

```js
// 条件删除
const result = await Blog.delete({ name__startswith: "temp" }).exec();
```

```sql
DELETE FROM blog T
WHERE T.name LIKE 'temp%'
```

---

```js
// 删除所有记录
const result = await Blog.delete().exec();
```

```sql
DELETE FROM blog T
```

## 便捷方法

### 创建记录

```js
// 创建单条记录并返回完整对象
const blog = await Blog.create({
  name: "Created Blog",
  tagline: "Created tagline"
});
```

```sql
INSERT INTO blog (name, tagline)
VALUES ('Created Blog', 'Created tagline')
RETURNING *
```

---

```js
// 等效于
const result = await Blog.insert({
  name: "Created Blog",
  tagline: "Created tagline"
}).returning("*").exec();
const blog = result[0];
```

### 获取单条记录

```js
// 获取单条记录
const blog = await Blog.where({ id: 1 }).get();
```

```sql
SELECT * FROM blog T
WHERE T.id = 1
LIMIT 1
```

---

```js
// 获取单条记录的特定字段
const blog = await Blog.where({ id: 1 }).select(["name"]).get();
```

```sql
SELECT T.name
FROM blog T
WHERE T.id = 1
LIMIT 1
```

### 扁平化结果

```js
// 获取单列值的数组
const names = await Blog.flat("name");
```

```sql
SELECT T.name
FROM blog T
```

---

```js
// 带条件的扁平化
const names = await Blog.where({ tagline__contains: "blog" })
  .order_by(["name"])
  .flat("name");
```

```sql
SELECT T.name
FROM blog T
WHERE T.tagline LIKE '%blog%'
ORDER BY T.name
```

## 原生查询

```js
// 执行原生 SQL
const result = await Blog.query("SELECT * FROM blog WHERE id = $1", [1]);
```

```sql
-- 执行原生 SQL（参数化查询）
SELECT * FROM blog WHERE id = $1
-- 参数: [1]
```

---

```js
// 获取 SQL 语句（不执行）
const sql = Blog.where({ id: 1 }).statement();
console.log(sql); // "SELECT * FROM blog T WHERE T.id = 1"
```

## 字段类型

### 基础类型

```js
const Model = Model({
  table_name: "example",
  fields: {
    // 字符串类型
    name: { type: "string", maxlength: 100, minlength: 2 },
    title: { maxlength: 200 }, // 默认为 string 类型

    // 文本类型
    content: { type: "text" },

    // 整数类型
    age: { type: "integer", min: 0, max: 150 },

    // 浮点数类型
    price: { type: "float" },

    // 布尔类型
    is_active: { type: "boolean", default: true },

    // 日期类型
    birth_date: { type: "date" },

    // 日期时间类型
    created_at: { type: "datetime" },

    // 邮箱类型
    email: { type: "email" },

    // JSON 类型
    metadata: { type: "json" },

    // 外键引用
    user_id: { reference: User },

    // 复合字段
    profile: { model: Profile }
  }
});
```

### 字段约束

```js
const Model = Model({
  table_name: "example",
  fields: {
    // 唯一约束
    username: { unique: true },

    // 非空约束
    email: { null: false },

    // 默认值
    status: { default: "active" },

    // 标签（用于表单显示等）
    name: { label: "姓名" },

    // 压缩存储（用于长文本）
    content: { compact: false }
  }
});
```

### 模型选项

```js
const Model = Model({
  // 表名
  table_name: "my_table",

  // 是否自动创建主键
  auto_primary_key: true, // 默认 true

  // 联合唯一约束
  unique_together: ["field1", "field2"],

  // 模型继承
  mixins: [BaseModel],

  // 字段定义
  fields: {
    // ...
  }
});
```

## 错误处理

```js
try {
  // 违反唯一约束
  await Blog.insert({ name: "First Blog" }).exec();
} catch (error) {
  console.error("插入失败:", error.message);
}

try {
  // 字段长度超限
  await Blog.insert({
    name: "This name is way too long and exceeds the maximum length"
  }).exec();
} catch (error) {
  console.error("字段验证失败:", error.message);
}

try {
  // 年龄超出范围
  await Author.insert({ name: "Tom", age: 101 }).exec();
} catch (error) {
  console.error("年龄验证失败:", error.message);
}
```

## 调试

```js
// 获取 SQL 语句而不执行
const sql = Blog.where({ id: 1 }).statement();
console.log(sql);

// 启用完整 SQL 匹配（用于测试）
process.env.SQL_WHOLE_MATCH = true;
```

## 最佳实践

1. **模型定义**: 将相关模型定义在同一个文件中，便于管理外键关系
2. **字段验证**: 充分利用字段约束进行数据验证
3. **查询优化**: 使用 `select()` 只查询需要的字段
4. **事务处理**: 对于复杂操作，考虑使用数据库事务
5. **错误处理**: 始终包装数据库操作在 try-catch 中
6. **索引优化**: 为经常查询的字段添加数据库索引

这个 ORM 提供了丰富的查询接口和灵活的数据操作方法，能够满足大多数 PostgreSQL 应用的需求。
</rewritten_file>