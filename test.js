function bar() {
  return [1, 2]
}
function foo(a, b) {
  [a, b] = bar()
  return [a, b]
}

console.log(foo())