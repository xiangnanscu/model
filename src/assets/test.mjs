// Basic where queries
User.where({ username: "admin" });
Blog.where({ name: "First Blog" });
Book.where({ price: 100 });
Book.where({ price__gt: 100 });
Entry.where({ blog_id: 1 });

// Select queries
Blog.select("name").where({ id: 1 });
Blog.select("name", "tagline").where({ id: 1 });
Book.select("name", "author__name").where({ id: 1 });
ViewLog.select("entry_id__blog_id__name").where({ id: 1 });

// Foreign key queries
Entry.where({ blog_id__name: "my blog name" });
Entry.where({ blog_id__name__contains: "my blog" });
ViewLog.where({ entry_id__blog_id: 1 });
ViewLog.where({ entry_id__blog_id__name: "my blog name" });

// Reversed foreign key queries
Blog.where({ entry__rating: 1 });
Blog.where({ entry__view_log: 1 });
Blog.select("id", "name", "entry__rating").where({ name: "Second Blog" });

// Complex queries with Q objects
Book.where(Q({ price__gt: 100 }).or(Q({ price__lt: 200 })));
Book.where(Q({ price__gt: 100 }).not());

// JSON field queries
Author.where({ resume__has_key: "start_date" });
Author.where({ resume__contains: { start_date: "2025-01-01" } });
Author.where({ resume__start_date__time: "12:00:00" });

// Insert queries
User.insert({ username: "testuser", password: "password" });
Blog.insert({ name: "Test Blog", tagline: "Test tagline" });
Blog.insert([
  { name: "Blog 1", tagline: "First blog" },
  { name: "Blog 2", tagline: "Second blog" },
]);

// Insert with returning
Blog.insert({ name: "Return Test" }).returning("id", "name");
Author.insert({
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  resume: [
    {
      start_date: "2015-01-01",
      end_date: "2020-01-01",
      company: "Company A",
      position: "Developer",
    },
  ],
}).returning("*");

// Update queries
Blog.update({ tagline: "Updated tagline" }).where({ name: "First Blog" });
Entry.update({ headline: "New headline" }).where({ id: 1 }).returning("headline");
Entry.increase({ rating: 1 }).where({ id: 1 });

// Delete queries
Blog.delete({ name: "Test Blog" });
Blog.where({ name__startswith: "temp" }).delete();

// Aggregation queries
Book.annotate({ price_total: Sum("price") });
Book.group_by("name").annotate({ price_sum: Sum("price") });
Book.group_by("name")
  .annotate({ price_total: Sum("price") })
  .having({ price_total__gt: 100 });

// Advanced queries
BlogBin.insert(Blog.where({ name: "Second Blog" }).select("name", "tagline"));
Blog.upsert([
  { name: "First Blog", tagline: "updated by upsert" },
  { name: "New Blog", tagline: "inserted by upsert" },
]);

// Order by queries
Blog.select("name").order_by("name");
Blog.select("name").order_by("-name");
Entry.where({ blog_id: 1 }).order_by("pub_date", "-rating");
