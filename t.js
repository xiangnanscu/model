const opts_names = ["a", "b"];
class B {
  opts = console.log("xxxx") || opts_names;
  constructor() {
    console.log(this.opts.length);
  }
}

class C extends B {
  constructor() {
    super();
  }
}

new C();
