function bar(a, b) {
  console.log({a, b})
  return a
}
function foo(...args) {
  return bar(...args)
}

console.log(foo({x:1}))