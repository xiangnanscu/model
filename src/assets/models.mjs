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
