/* eslint-disable no-undef */
import postgres from "postgres"
import {describe, expect, test} from 'vitest';
import Model from "~/lib/model";


const Query = options => {
  const sql_query = postgres({
    host: options.host || "localhost",
    port: options.port || "5432",
    database: options.database || "test",
    user: options.user || "postgres",
    password: options.password || "postgres",
    max: options.max || 20,
    idle_timeout: options.idle_timeout || 20,
    connect_timeout: options.connect_timeout || 2,
  });
  return async (statement) => {
    // console.log(statement);
    const result = await sql_query.unsafe(statement);
    // console.log(result);
    return result;
  };
}
Model.Query = Query
const db_options = {
  host: "localhost",
  port: "5432",
  user: "postgres",
  password: "postgres",
  database: "test",
  max: 20,
  idle_timeout: 20,
  connect_timeout: 2,
};
Model.db_options = db_options;
function p() {
  console.log.apply(this, arguments);
}
const sql_query = Model.Query(db_options);


async function main(params) {
  const Usr = Model.create_model({
    table_name: "usr",
    fields: {
      name: { label: "姓名", primary_key: true, maxlength: 4, minlength: 1 },
      age: { label: "年龄", type: "integer", max: 100, min: 1, required: true },
    },
  });

  const Profile = Model.create_model({
    table_name: "profile",
    fields: {
      usr_name: { label: "用户", reference: Usr, reference_column: "name" },
      info: { label: "信息", maxlength: 50 },
    },
  });

  await sql_query(`
    DROP TABLE IF EXISTS profile cascade;
    DROP TABLE IF EXISTS usr cascade;

    CREATE TABLE usr (
      id serial PRIMARY KEY,
      name varchar(4) UNIQUE,
      age integer);
    CREATE TABLE profile (
      id serial PRIMARY KEY,
      usr_name varchar(4) REFERENCES "usr" ("name") ON DELETE NO ACTION ON UPDATE CASCADE,
      info varchar(50));


    `);

  const first_user = { name: "tom", age: 22 };
  await Usr.insert(first_user).execr();
  const usrs_after_insert = await Usr.all();
  test("test insert one row", () => {
    expect(usrs_after_insert).toEqual([{ id: 1, ...first_user }]);
  });

  const bulk_insert_users = [
    { name: "kate", age: 21 },
    { name: "mike", age: 11 },
  ];
  const all_users = [first_user, ...bulk_insert_users];

  await Usr.insert(bulk_insert_users).execr();
  const usrs_after_bulk_insert = await Usr.all();
  test("test bulk insert", () => {
    for (const u of usrs_after_bulk_insert) {
      expect(u).toMatchObject(all_users.find((e) => e.name == u.name));
    }
  });

  const merged_users = [...all_users, { name: "foo", age: 11 }];
  await Usr.merge(merged_users, "name").exec();
  const usrs_after_merge = await Usr.all();
  test("test merge - update && insert", () => {
    expect(usrs_after_merge.length).toBe(4);
    for (const u of usrs_after_merge) {
      expect(u).toMatchObject(merged_users.find((e) => e.name == u.name));
    }
  });

  await Usr.delete({ name: "foo" }).execr();
  const users_after_delete = await Usr.all();
  test("test delete", () => {
    expect(users_after_delete.length).toBe(3);
    for (const u of users_after_delete) {
      expect(u).toMatchObject(all_users.find((e) => e.name == u.name));
    }
  });

  const merged_update_users = [
    { name: "kate", age: 50 },
    { name: "tom", age: 60 },
  ];
  await Usr.merge(merged_update_users, "name").exec();
  const users_after_merge_update = await Usr.all();
  test("test no new rows", () => {
    expect(users_after_merge_update.length).toBe(3);
  });
  const kate = await Usr.select("age").where({ name: "kate" }).get();
  test("test kate age changed and select age only", () => {
    expect(kate).toEqual({ age: 50 });
  });
  const tom = await Usr.select("age").get({ name: "tom" });
  test("test tom age changed and select age only and condition in get", () => {
    expect(tom).toEqual({ age: 60 });
  });

  await Usr.update({ age: 66 }).where({ name: "kate" }).execr();
  const usr_kate = await Usr.get({ name: "kate" });
  test("test update by where", () => {
    expect(usr_kate.age).toEqual(66);
  });

  const bulk_update_users = [
    { name: "tom", age: 22 },
    { name: "kate", age: 21 },
    { name: "foo", age: 21 },
  ];
  await Usr.updates(bulk_update_users, "name").exec();
  const users_after_updates = await Usr.all();
  test("test no new rows after sql.updates", () => {
    expect(users_after_updates.length).toBe(3);
  });
  const kate2 = await Usr.select("age").where({ name: "kate" }).get();
  test("test kate age changed back by updates", () => {
    expect(kate2).toEqual({ age: 21 });
  });
  const tom2 = await Usr.select("age").where({ name: "tom" }).get();
  test("test tom age changed back by updates", () => {
    expect(tom2).toEqual({ age: 22 });
  });
  const no_foo = await Usr.select("age").where({ name: "foo" }).execr();
  test("test foo is not inserted in sql.updates", () => {
    expect(no_foo.length).toBe(0);
  });
  const age_lt20Users = await Usr.select("name", "age").where({ age__lt: 20 }).execr();
  test("test select where by age less than 20", () => {
    for (const u of age_lt20Users) {
      expect(u).toMatchObject({ name: "mike", age: 11 });
    }
  });

  await Usr.update({ age: 30 }).where({ name: "kate" }).execr();
  const u30 = await Usr.get({ name: "kate" });
  test("test update where and get", () => {
    expect(u30).toMatchObject({ name: "kate", age: 30 });
  });

  const profile_users = [
    { usr_name: "tom", info: "dad" },
    { usr_name: "kate", info: "mom" },
  ];
  await Profile.merge(profile_users, "usr_name").exec();
  const p1 = await Profile.where({ usr_name__age: 30 }).get();
  test("test join get", () => {
    expect(p1).toMatchObject({ name: "kate", age: 30 });
  });

  const usr_from_save_create = await Usr.save_create({ name: "u1", age: 50 });
  const u1 = await Usr.get({ name: "u1" });
  test("test save_create", async () => {
    expect(u1).toMatchObject({ name: "u1", age: 50 });
  });

  usr_from_save_create.age = 66;
  await usr_from_save_create.save();
  const u1_after_save = await Usr.get({ name: "u1" });
  test("test save", async () => {
    expect(u1_after_save).toMatchObject({ name: "u1", age: 66 });
  });

  await Usr.save_update({ name: "u1", age: 13 }, ["age"], "name");
  const u1_after_modelsave = await Usr.get({ name: "u1" });
  test("test model class save", async () => {
    expect(u1_after_modelsave).toMatchObject({ name: "u1", age: 13 });
  });

  it("save_create raise required error", async () => {
    await expect(Usr.save_create({ name: "u1" })).rejects.toThrow(
      new Model.ValidateError({ name: "age", message: "此项必填" })
    );
  });
  it("save_create raise max error", async () => {
    await expect(Usr.save_create({ name: "u1", age: 500 })).rejects.toThrow(
      new Model.ValidateError({
        name: "age",
        message: `值不能大于${Usr.fields.age.max}`,
      })
    );
  });

  it("insert raise max batch error", () => {
    let err;
    try {
      Usr.insert([
        { name: "u2", age: 2 },
        { name: "u1", age: 500 },
      ]);
    } catch (error) {
      err = error;
    }
    expect(err).toMatchObject({
      name: "age",
      message: `值不能大于${Usr.fields.age.max}`,
      batch_index: 1,
    });
  });
  it("save_create raise maxlength error", async () => {
    await expect(Usr.save_create({ name: "u11111111111", age: 3 })).rejects.toThrow(
      new Model.ValidateError({
        name: "age",
        message: `字数不能多于${Usr.fields.name.maxlength}个`,
      })
    );
  });
  it("insert skip max batch error", () => {
    expect(
      Usr.skip_validate().insert([
        { name: "u2", age: 2 },
        { name: "u1", age: 500 },
      ])
    ).toMatchObject({ _skip_validate: true });
  });
}

main()