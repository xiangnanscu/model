import Field from '@xiangnanscu/field'
import Modelsql from '@xiangnanscu/modelsql'
import Model from './model.mjs'
import pg from "pg"

const pool = new pg.Pool({
  host: 'localhost',
  user: 'postgres',
  password: '111111',
  database: 'shiye',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})



let bank = Model.makeClass({
  pool,
  tableName: "bank",
  fields: {
    amount: { label: "余额", type: "float" },
    addr: { label: "地址" },
  },
});
let usr = Model.makeClass({
  pool,
  tableName: "usr",
  fields: {
    bankId: { label: "银行", reference: bank },
    name: { label: "姓名" },
    age: { label: "年龄" },
  },
});
let info = Model.makeClass({
  pool,
  tableName: "info",
  fields: {
    code: { label: "身份证号", unique: true },
    sex: { label: "性别" },
  },
});
let profile = Model.makeClass({
  pool,
  tableName: "profile",
  fields: {
    id: { type: 'integer' },
    sfzh: {type: 'sfzh'},
    usrId: { label: "用户", reference: usr },
    infoId: { label: "信息", reference: info, referenceColumn: "code" },
    name: { label: "姓名" },
  },
});

console.log(profile.whereNot({ usrId: "a" }).statement());
console.log(
  profile
    .where({
      usrId__bankId__amount__gt: 100,
      usrId__bankId__addr__contains: "wall",
    })
    .statement()
);
console.log(profile.where("id", 1).orWhere({ id: 2 }).select("id").statement());
console.log(
  profile.where({ usrId__name__contains: "a", usrId__name: "b" }).statement()
);
console.log(
  profile
    .where({
      usrId__name__contains: "a",
      usrId__bankId__amount__gt: 100,
      usrId__bankId__addr__contains: "wall",
    })
    .statement()
);
console.log(
  profile
    .where({
      usrId__name__contains: "a",
      usrId__bankId__addr__contains: "wall",
    })
    .orWhereNot({ usrId__bankId__amount__gt: 100 })
    .statement()
);
console.log(profile.whereIn("name", ["foo", "bar"]).statement());
console.log(profile.whereIn(["id", "name"], usr.select("id", "name")).statement());
console.log(profile.whereExists(usr.where("id=1")).statement());
console.log(profile.where("name", "in", ["foo", "bar"]).statement());
console.log(
  profile.whereNull("name").orWhereNot({ name__null: false }).statement()
);
console.log(
  profile
    .whereNull("name")
    .orWhereNot({ name__in: ["foo", "bar"] })
    .statement()
);
console.log(
  profile
    .whereNull("name")
    .whereNot({ name__notin: ["foo", "bar"] })
    .statement()
);
console.log(
  profile.loadFk("usrId", "name", "age").loadFk("infoId", "sex").statement()
);
console.log(profile.select(["id", "name"]).select("usrId as u").statement());
console.log(profile.select(["id", "name"]).select("usrId").statement());
console.log(profile.where({ name: "a", id: 1, foo: 2 }).statement());
console.log(profile.where("name", "a").statement());
console.log(profile.where("name", "like", "a").statement());
console.log(usr.whereIn("name", ["foo", "bar"]).statement());
console.log(usr.whereIn("names", ["foo", "bar"]).statement());
console.log(usr.whereNull("name").orWhereBetween("age", 1, 10).statement());
console.log(usr.whereExists(profile.where("name", "bar")).statement());
console.log(
  profile
    .whereOr({
      usrId__bankId__amount__gt: 10,
      usrId__bankId__amount__lte: 20,
      infoId__code__startswith: "a",
    })
    .statement()
);
let cb1 = function (sql) {
  return this.where({ a: 1, b: "where" });
};
let cb2 = function (sql) {
  return this.whereOr({ a: 1, b: "whereOr" });
};
let cb3 = function (sql) {
  return this.orWhere({ a: 1, b: "orWhere" });
};
let cb4 = function (sql) {
  return this.orWhereNot({ a: 1, b: "orWhereNot" });
};
let cb5 = function (sql) {
  return this.whereNot({ a: 1, b: "whereNot" });
};
console.log(
  profile.where(cb1).where(cb2).where(cb3).where(cb4).where(cb5).statement()
);
console.log(
  profile
    .select(true, false, true)
    .whereNot({ name: "a", id: 1, foo: true })
    .statement()
);
console.log(profile.insert({ name: "1" }).returning("name").statement());
const {rows} = await pool.query("select xm,dwmc from profile limit 2")
console.log(rows)
test('select', () => {
  expect(1).toBe(1)
});
test('query profile', () => {
  expect(profile.select("id","sfzh").where({id__lt:100}).limit(1).execr()).toBe(1)
});