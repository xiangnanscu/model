Usr.where({ name: "kate" });
Usr.where({ parent__name: "kate" });
Profile.update({ info: "big kids" }).where({ usr__age__gt: 12 }).returning("info");
Profile.where({ usr__age__gt: 12 }).select("info");
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
