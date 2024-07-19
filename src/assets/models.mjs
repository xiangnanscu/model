const Usr = new Model({
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
const ResumeItem = new Model({
  fields: {
    start_time: { type: "date", required: true },
    end_time: { type: "date" },
    content: { required: true },
  },
});

const Profile = new Model({
  table_name: "profile",
  fields: {
    usr: { reference: Usr },
    info: { type: "text", maxlength: 50 },
    resume: { type: "table", model: ResumeItem },
  },
});
