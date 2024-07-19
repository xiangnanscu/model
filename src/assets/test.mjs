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
