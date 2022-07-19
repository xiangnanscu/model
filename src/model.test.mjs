import Model from './model.mjs'
import postgres from 'postgres'

function p() {
  console.log.apply(this, arguments)
}
const sql = postgres({
  host: 'localhost',
  user: 'postgres',
  password: '111111',
  database: 'test',
  max: 20,
  idle_timeout: 20,
  connect_timeout: 2,
})
const query = async (statement) => {
  p(statement)
  return await sql.unsafe(statement)
}
await query(`drop table if exists info;create table info(id integer,code varchar(10),sex varchar(5))`)
let bank = Model.makeClass({
  query,
  tableName: "bank",
  fields: {
    amount: { label: "余额", type: "float" },
    addr: { label: "地址" },
  },
});
let usr = Model.makeClass({
  query,
  tableName: "usr",
  fields: {
    bankId: { label: "银行", reference: bank },
    name: { label: "姓名" },
    age: { label: "年龄" },
  },
});
let info = Model.makeClass({
  query,
  tableName: "info",
  fields: {
    code: { label: "身份证号", unique: true },
    sex: { label: "性别" },
  },
});
let profile = Model.makeClass({
  query,
  tableName: "profile",
  fields: {
    id: { type: 'integer' },
    sfzh: {type: 'sfzh'},
    usrId: { label: "用户", reference: usr },
    infoId: { label: "信息", reference: info, referenceColumn: "code" },
    name: { label: "姓名" },
  },
});

// p(profile.whereNot({ usrId: "a" }).statement());
// p(
//   profile
//     .where({
//       usrId__bankId__amount__gt: 100,
//       usrId__bankId__addr__contains: "wall",
//     })
//     .statement()
// );
// p(profile.where("id", 1).orWhere({ id: 2 }).select("id").statement());
// p(
//   profile.where({ usrId__name__contains: "a", usrId__name: "b" }).statement()
// );
// p(
//   profile
//     .where({
//       usrId__name__contains: "a",
//       usrId__bankId__amount__gt: 100,
//       usrId__bankId__addr__contains: "wall",
//     })
//     .statement()
// );
// p(
//   profile
//     .where({
//       usrId__name__contains: "a",
//       usrId__bankId__addr__contains: "wall",
//     })
//     .orWhereNot({ usrId__bankId__amount__gt: 100 })
//     .statement()
// );
// p(profile.whereIn("name", ["foo", "bar"]).statement());
// p(profile.whereIn(["id", "name"], usr.select("id", "name")).statement());
// p(profile.whereExists(usr.where("id=1")).statement());
// p(profile.where("name", "in", ["foo", "bar"]).statement());
// p(
//   profile.whereNull("name").orWhereNot({ name__null: false }).statement()
// );
// p(
//   profile
//     .whereNull("name")
//     .orWhereNot({ name__in: ["foo", "bar"] })
//     .statement()
// );
// p(
//   profile
//     .whereNull("name")
//     .whereNot({ name__notin: ["foo", "bar"] })
//     .statement()
// );
// p(
//   profile.loadFk("usrId", "name", "age").loadFk("infoId", "sex").statement()
// );
// p(profile.select(["id", "name"]).select("usrId as u").statement());
// p(profile.select(["id", "name"]).select("usrId").statement());
// p(profile.where({ name: "a", id: 1, foo: 2 }).statement());
// p(profile.where("name", "a").statement());
// p(profile.where("name", "like", "a").statement());
// p(usr.whereIn("name", ["foo", "bar"]).statement());
// p(usr.whereIn("names", ["foo", "bar"]).statement());
// p(usr.whereNull("name").orWhereBetween("age", 1, 10).statement());
// p(usr.whereExists(profile.where("name", "bar")).statement());
// p(
//   profile
//     .whereOr({
//       usrId__bankId__amount__gt: 10,
//       usrId__bankId__amount__lte: 20,
//       infoId__code__startswith: "a",
//     })
//     .statement()
// );
// let cb1 = function (sql) {
//   return this.where({ a: 1, b: "where" });
// };
// let cb2 = function (sql) {
//   return this.whereOr({ a: 1, b: "whereOr" });
// };
// let cb3 = function (sql) {
//   return this.orWhere({ a: 1, b: "orWhere" });
// };
// let cb4 = function (sql) {
//   return this.orWhereNot({ a: 1, b: "orWhereNot" });
// };
// let cb5 = function (sql) {
//   return this.whereNot({ a: 1, b: "whereNot" });
// };
// p(
//   profile.where(cb1).where(cb2).where(cb3).where(cb4).where(cb5).statement()
// );
// p(
//   profile
//     .select(true, false, true)
//     .whereNot({ name: "a", id: 1, foo: true })
//     .statement()
// );
// p(profile.insert({ name: "1" }).returning("name").statement());

const bsql = await info.commit(false).merge([{ id: 1, "code": "1", "sex": "男" }, { id: 2, "code": "2", "sex": "女" }], "id")
p(await bsql.execr())
p(await info.all())
test('select', () => {
  expect(1).toBe(1)
});
await sql.end()