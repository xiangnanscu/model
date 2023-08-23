import { alioss_list } from "./src/field.mjs";

// const al = alioss_list.new({ name: "pics", size: "2m", key_id: "foo" });

// console.log(al.json());

class A {
  ins = console.log("A.ins") || "A";
  constructor() {
    console.log("A constuctor begin...");
    // console.log(this.constructor.foo);
    // console.log(super.constructor.foo);
    console.log("A constuctor end...");
  }
}

class B extends A {
  // static foo = "aaa";
  // static foo2 = "bbb";
  ins = console.log("B.ins") || "B";
  constructor() {
    console.log("B constuctor begin...");
    super();
    // console.log(this.constructor.foo);
    // console.log(super.constructor.foo);
    console.log("B constuctor end...");
  }
  echo() {
    console.log(this.constructor.foo);
    console.log(this.constructor.foo2);
  }
}

class C extends B {
  // static foo = "bar";
  ins = console.log("C.ins") || "C";
  constructor() {
    console.log("C constuctor begin...");
    super();
    // console.log(this.constructor.foo);
    // console.log(super.constructor.foo);
    console.log("C constuctor end..." + this.constructor.name);
  }
}

new C();
