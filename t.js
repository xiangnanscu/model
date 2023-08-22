class A {
  constructor() {
    console.log("A constuctor begin...");
    console.log(this.constructor.foo);
    console.log(super.constructor.foo);
    console.log("A constuctor end...");
  }
}

class B extends A {
  static foo = "aaa";
  static foo2 = "bbb";
  constructor() {
    console.log("B constuctor begin...");
    super();
    console.log(this.constructor.foo);
    console.log(super.constructor.foo);
    console.log("B constuctor end...");
  }
  echo() {
    console.log(this.constructor.foo);
    console.log(this.constructor.foo2);
  }
}

class C extends B {
  static foo = "bar";
  constructor() {
    console.log("C constuctor begin...");
    super();
    console.log(this.constructor.foo);
    console.log(super.constructor.foo);
    console.log("C constuctor end...");
  }
}

new C();
