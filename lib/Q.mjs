// const Q2 = new Proxy(
//   class Q {
//     constructor(params) {
//       Object.assign(this, params);
//     }
//   },
//   {
//     apply: (target, _, [cond]) => {
//       return new target({ cond, logic: "AND" });
//     },
//   },
// );

class Q {
  constructor(params) {
    Object.assign(this, params);
  }
}

Q.prototype.__IS_LOGICAL_BUILDER__ = true;

// Logical operations
Q.prototype.and = function (other) {
  return new Q({ left: this, right: other, logic: "AND" });
};

Q.prototype.or = function (other) {
  return new Q({ left: this, right: other, logic: "OR" });
};

Q.prototype.not = function () {
  return new Q({ left: this, logic: "NOT" });
};

const QProxy = new Proxy(Q, {
  apply(target, thisArg, argumentsList) {
    return new Q({ cond: argumentsList[0], logic: "AND" });
  },
});

export default QProxy;
export { Q };
