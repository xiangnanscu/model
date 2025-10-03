import { Xodel, Q, F, Sum, Avg, Max, Min, Count, create_table_sql } from "xodel";

// Configure database connection
Xodel.db_config = {
  host: "localhost",
  port: "5432",
  user: "postgres",
  password: "postgres",
  database: "test",
  max: 20,
  idle_timeout: 20,
  connect_timeout: 3,
};

// Xodel definitions
const User = Xodel({
  table_name: "user",
  fields: {
    username: { type: "string", maxlength: 20, minlength: 2, unique: true },
    password: { type: "text" },
  },
});

const Blog = Xodel({
  table_name: "blog",
  fields: {
    name: { type: "string", maxlength: 20, minlength: 2, unique: true },
    tagline: { type: "text", default: "default tagline" },
  },
});

const BlogBin = Xodel({
  table_name: "blog_bin",
  mixins: [Blog],
  fields: {
    name: { type: "string", unique: false },
    note: { type: "text", default: "" },
  },
});

const Resume = Xodel({
  auto_primary_key: false,
  table_name: "resume",
  unique_together: ["start_date", "end_date", "company", "position"],
  fields: {
    start_date: { type: "date" },
    end_date: { type: "date" },
    company: { type: "string", maxlength: 20 },
    position: { type: "string", maxlength: 20 },
    description: { type: "string", maxlength: 200 },
  },
});

const Author = Xodel({
  table_name: "author",
  fields: {
    name: { label: "Name", type: "string", maxlength: 200, unique: true },
    email: { type: "email" },
    age: { type: "integer", max: 100, min: 10 },
    resume: { type: "table", model: Resume },
  },
});

const Entry = Xodel({
  table_name: "entry",
  fields: {
    blog_id: { type: "foreignkey", reference: Blog, related_query_name: "entry" },
    reposted_blog_id: { type: "foreignkey", reference: Blog, related_query_name: "reposted_entry" },
    headline: { type: "string", maxlength: 255, compact: false },
    body_text: { type: "text" },
    pub_date: { type: "date" },
    mod_date: { type: "date" },
    number_of_comments: { type: "integer", default: 0 },
    number_of_pingbacks: { type: "integer", default: 0 },
    rating: { type: "integer" },
  },
});

const ViewLog = Xodel({
  table_name: "view_log",
  fields: {
    entry_id: { type: "foreignkey", reference: Entry },
    ctime: { type: "datetime" },
  },
});

const Publisher = Xodel({
  table_name: "publisher",
  fields: {
    name: { type: "string", maxlength: 300 },
  },
});

const Book = Xodel({
  table_name: "book",
  fields: {
    name: { type: "string", maxlength: 300, compact: false },
    pages: { type: "integer" },
    price: { type: "float" },
    rating: { type: "float" },
    author: { type: "foreignkey", reference: Author },
    publisher_id: { type: "foreignkey", reference: Publisher },
    pubdate: { type: "date" },
  },
});

const Store = Xodel({
  table_name: "store",
  fields: {
    name: { type: "string", maxlength: 300 },
  },
});

const model_list = [User, Blog, BlogBin, Author, Entry, ViewLog, Publisher, Book, Store];

// Create tables from model definitions
for (const model of model_list) {
  const createSQL = create_table_sql(model);
  await Xodel.query(createSQL);
}
