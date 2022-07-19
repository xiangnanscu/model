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
await query(`
DROP TABLE IF EXISTS profile;
DROP TABLE IF EXISTS usr;

CREATE TABLE usr (
  id serial PRIMARY KEY,
  name varchar(4) UNIQUE,
  age integer);
CREATE TABLE profile (
  id serial PRIMARY KEY,
  usr_name varchar(4) REFERENCES "usr" ("name") ON DELETE NO ACTION ON UPDATE CASCADE,
  info varchar(50));
`)
let usr = Model.makeClass({
  query,
  tableName: "usr",
  fields: {
    name: { label: "姓名",unique: true, maxlength:4, minlength:1 },
    age: { label: "年龄", type:"integer", max:100, min:1 },
  },
});
let profile = Model.makeClass({
  query,
  tableName: "profile",
  fields: {
    usr_name: { label: "用户", reference: usr, referenceColumn: 'name' },
    info: { label: "信息", maxlength:50 },
  },
});
const usr_rows = [{ "name": "tom", "age": 22 }, { "name": "kate", "age": 21 }, { "name": "mike", "age": 11 }]
await usr.merge(usr_rows, "name")
let res = await usr.all()
let select_u = await usr.select("name", "age").where({age__lt:20}).execr()
test('test select where', () => {
  for (const u of select_u) {
    expect(u).toMatchObject({ "name": "mike", "age": 11 })
  }
});
let update_u = await usr.update({ age: 30 }).where({ name: "kate" }).execr()
let u30 = await usr.get({ name: "kate" })
test('test update where and get', () => {
  expect(u30).toMatchObject({ "name": "kate", "age": 30 })
});
test('test merge', () => {
  for (const u of res) {
    expect(u).toMatchObject(usr_rows.find(e=>e.name==u.name))
  }
});
const profile_rows = [{ usr_name: "tom", info: "dad" }, { usr_name: "kate", info: "mom" }]
await profile.merge(profile_rows, "usr_name")
p(await profile.all())
let p1 = await profile.where({ usr_name__age__lt: 22 }).execr()
p({p1})
await sql.end()