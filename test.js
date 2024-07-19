class MyClass {
  constructor() {
    this.property = "value";
    // 显式返回一个不同的对象
    return {
      customProperty: "customValue",
    };
  }
}

const instance = new MyClass();
console.log(instance); // 输出: { customProperty: 'customValue' }
console.log(instance.property); // 输出: undefined
