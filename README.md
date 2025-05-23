# @xiangnanscu/model

[@xiangnanscu/model](https://xiangnanscu.github.io/model/) straight forward and powerful orm library for postgresql.

# Install

```sh
npm install -g @xiangnanscu/model
```

# Usage

## example

```js
import { Model } from "@xiangnanscu/model";

const Usr = Model.create_model({
  table_name: "usr",
  fields: {
    id: { type: "integer", primary_key: true, serial: true },
    name: { type: "string", unique: true, maxlength: 4, minlength: 1, required: true },
    age: { type: "integer", max: 100, min: 1, default: 1 },
    parent: { type: "foreignkey", reference: "self" },
    child: { reference: "self" },
  },
});

// define abstract model for table field
const ResumeItem = Model.create_model({
  fields: {
    start_time: { type: "date", required: true },
    end_time: { type: "date" },
    content: { required: true },
  },
});

const Profile = Model.create_model({
  table_name: "profile",
  fields: {
    usr: { reference: Usr },
    info: { type: "text", maxlength: 50 },
    resume: { type: "table", model: ResumeItem },
  },
});

const Org = Model.create_model({
  table_name: "org",
  auto_primary_key: true, // auto insert a primary key named id
  fields: {
    name: { type: "string", unique: true },
  },
});

const OrgAdmin = Model.create_model({
  table_name: "org_admin",
  fields: {
    usr: { reference: Usr },
    org: { reference: Org },
  },
});

// test code
Usr.where({ name: "kate" });
Usr.where({ parent__name: "kate" });
Usr.where({ parent__age: 20 });
Usr.where({ parent__parent__age: 40 });

OrgAdmin.select("usr__name", "org__name");
Profile.where({ usr__age__gt: 12 }).select("info");
Profile.where({ usr__age__gt: 12, usr__parent__age__gt: 32 }).select("info");
Profile.where({ usr__parent__age__gt: 12 }).select("info");

Profile.update({ info: "big kids" }).where({ usr__age__gt: 12 }).returning("info");
Profile.where({ usr__age__gt: 12 }).delete().returning("info");

Usr.insert({ name: "tom", age: 1 });
Usr.insert([
  { name: "tom", age: 1 },
  { name: "kate", age: 2 },
]);
Usr.upsert([
  { name: "tom", age: 1 },
  { name: "kate", age: 2 },
]);
Usr.align([
  { name: "tom", age: 1 },
  { name: "kate", age: 2 },
]);
```

# F类 - ES6实现

这是一个将Lua版本的F类转写为ES6的等价实现。F类用于构建类似Django ORM的F表达式，用于数据库字段的动态引用和表达式构建。

## 特性

- ✅ 字段引用：`F('column_name')`
- ✅ 算术运算：加、减、乘、除、取模、幂运算
- ✅ 字符串连接运算
- ✅ 表达式树构建
- ✅ 字符串化表示
- ✅ 兼容原Lua版本的所有功能

## 使用方法

### 导入

```javascript
import F from './F.js';
// 或者
import { F } from './F.js';  // 导入类本身
```

### 基本用法

```javascript
// 创建字段引用
const price = F('price');
const quantity = F('quantity');

// 算术运算
const total = price.mul(quantity);
const discounted = total.sub(F('discount'));

// 复杂表达式
const complex = price.add(10).mul(quantity.sub(1));

console.log(complex.toString()); // 输出: ((price + 10) * (quantity - 1))
```

### 支持的运算

| 方法 | 操作符 | 说明 |
|------|--------|------|
| `add(other)` | `+` | 加法 |
| `sub(other)` | `-` | 减法 |
| `mul(other)` | `*` | 乘法 |
| `div(other)` | `/` | 除法 |
| `mod(other)` | `%` | 取模 |
| `pow(other)` | `^` | 幂运算 |
| `concat(other)` | `\|\|` | 字符串连接 |

### 与Lua版本的差异

1. **运算符重载**：由于JavaScript不支持运算符重载，需要使用方法调用而不是运算符
   - Lua: `F('a') + F('b')`
   - ES6: `F('a').add(F('b'))`

2. **函数调用语法**：使用Proxy实现了类似Lua `__call`元方法的行为
   - 两个版本都支持: `F('column_name')`

3. **类型安全**：ES6版本包含了JSDoc注释，提供更好的IDE支持

## 实现细节

- 使用ES6 class语法
- 通过Proxy实现函数调用行为
- 保持与原Lua版本完全相同的API结构
- 所有运算都返回新的F实例，不修改原对象（不可变性）

## 运行示例

```bash
node F_example.js
```

这将运行包含各种用法示例的测试文件。
