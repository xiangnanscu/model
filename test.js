class Foo {
  constructor() {
    this.name2 = "Foo";
  }
}

Foo.prototype.name = "Bar";
const f = new Foo();
console.log(f.name);
console.log(Object.getOwnPropertyDescriptor(f, "name")?.value);
