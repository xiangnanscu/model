class C {
  hello() {
    console.log(Object.get(this) === C.prototype);
  }
}

new C().hello();
