// Model definitions based on model_spec.test.mjs

const User = Model({
  table_name: "user",
  fields: {
    username: { maxlength: 20, minlength: 2, unique: true },
    password: { type: "text" },
  },
});

const Blog = Model({
  table_name: "blog",
  fields: {
    name: { maxlength: 20, minlength: 2, unique: true },
    tagline: { type: "text", default: "default tagline" },
  },
});

const BlogBin = Model({
  table_name: "blog_bin",
  mixins: [Blog],
  fields: {
    name: { unique: false },
    note: { type: "text" },
  },
});

const Resume = Model({
  auto_primary_key: false,
  table_name: "resume",
  unique_together: ["start_date", "end_date", "company", "position"],
  fields: {
    start_date: { type: "date" },
    end_date: { type: "date" },
    company: { maxlength: 20 },
    position: { maxlength: 20 },
    description: { maxlength: 200 },
  },
});

const Author = Model({
  table_name: "author",
  fields: {
    name: { label: "姓名", maxlength: 200, unique: true },
    email: { type: "email" },
    age: { type: "integer", max: 100, min: 10 },
    resume: { model: Resume },
  },
});

const Entry = Model({
  table_name: "entry",
  fields: {
    blog_id: { reference: Blog, related_query_name: "entry" },
    reposted_blog_id: { reference: Blog, related_query_name: "reposted_entry" },
    headline: { maxlength: 255, compact: false },
    body_text: { type: "text" },
    pub_date: { type: "date" },
    mod_date: { type: "date" },
    number_of_comments: { type: "integer" },
    number_of_pingbacks: { type: "integer" },
    rating: { type: "integer" },
  },
});

const ViewLog = Model({
  table_name: "view_log",
  fields: {
    entry_id: { reference: Entry },
    ctime: { type: "datetime" },
  },
});

const Publisher = Model({
  table_name: "publisher",
  fields: {
    name: { maxlength: 300 },
  },
});

const Book = Model({
  table_name: "book",
  fields: {
    name: { maxlength: 300, compact: false },
    pages: { type: "integer" },
    price: { type: "float" },
    rating: { type: "float" },
    author: { reference: Author },
    publisher_id: { reference: Publisher },
    pubdate: { type: "date" },
  },
});

const Store = Model({
  table_name: "store",
  fields: {
    name: { maxlength: 300 },
  },
});
