function getModels() {
  const Usr = Model.create_model({
    table_name: "usr",
    fields: {
      name: { primary_key: true, maxlength: 4, minlength: 1 },
      age: { type: "integer", max: 100, min: 1, required: true },
    },
  });

  const Profile = Model.create_model({
    table_name: "profile",
    fields: {
      usr_name: { label: "用户", reference: Usr, reference_column: "name" },
      info: { label: "信息", maxlength: 50 },
    },
  });

  return { Usr, Profile };
}
window.getModels = getModels;
