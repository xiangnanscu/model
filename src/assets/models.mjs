const Usr = Model.create_model({
  table_name: "usr",
  fields: {
    parent: { reference: "self" },
    child: { reference: "self" },
    name: { primary_key: true, maxlength: 4, minlength: 1 },
    age: { type: "integer", max: 100, min: 1, required: true },
  },
});

const Profile = Model.create_model({
  table_name: "profile",
  fields: {
    usr: { reference: Usr, reference_column: "name" },
    info: { maxlength: 50 },
  },
});
