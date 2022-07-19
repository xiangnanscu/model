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
  usr_id integer REFERENCES "usr" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
  info varchar(50));
`)
let usr = Model.makeClass({
  query,
  tableName: "usr",
  fields: {
    name: { label: "姓名",unique: true, maxlength:4, minlength:1 },
    age: { label: "年龄", type2:"integer", max:100, min:1 },
  },
});
let profile = Model.makeClass({
  query,
  tableName: "profile",
  fields: {
    usr_id: { label: "用户", reference: usr },
    info: { label: "信息", maxlength:50 },
  },
});
const usr_rows = [{"name": "tom", "age": 22 }, {"name": "kate", "age": 21 }]
await usr.merge(usr_rows, "name")
let res = await usr.all()
test('test merge', () => {
  for (const u of res) {
    expect(u).toMatchObject(usr_rows.find(e=>e.name==u.name))
  }
});
await sql.end()