class B {
  hello() {
    console.log(this.cls === C);
  }
}

class C extends B {
  constructor() {
    super();
    this.cls = C;
  }
}

new C().hello();
