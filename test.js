function foo(n) {
  if (n === 1) {
    return 1;
  } else {
    return Promise.resolve(2);
  }
}

console.log(foo(1));
console.log(await foo(2));
console.log(foo(3));
console.log(foo(4));
console.log(foo(5));
console.log(foo(6));
console.log(foo(7));
console.log(foo(8));
console.log(foo(9));
console.log(foo(10));
