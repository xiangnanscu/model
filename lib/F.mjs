// https://docs.djangoproject.com/en/dev/ref/models/expressions/#django.db.models.F

/**
 * F class for building Django ORM-like F expressions
 */
class F {
  constructor(column = null) {
    this.column = column;
    this.resolved_column = null;
    this.operator = null;
    this.left = null;
    this.right = null;
    this.__IS_FIELD_BUILDER__ = true;
  }

  /**
   * Create new F instance
   * @param {Object} args Parameter object
   * @returns {F} New F instance
   */
  static new(args = {}) {
    const instance = new F();
    Object.assign(instance, args);
    return instance;
  }

  /**
   * String representation
   * @returns {string} String form of F expression
   */
  toString() {
    if (this.column) {
      return this.column;
    } else {
      return `(${this.left} ${this.operator} ${this.right})`;
    }
  }

  /**
   * Addition operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  add(other) {
    return F.new({ left: this, right: other, operator: "+" });
  }

  /**
   * Subtraction operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  sub(other) {
    return F.new({ left: this, right: other, operator: "-" });
  }

  /**
   * Multiplication operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  mul(other) {
    return F.new({ left: this, right: other, operator: "*" });
  }

  /**
   * Division operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  div(other) {
    return F.new({ left: this, right: other, operator: "/" });
  }

  /**
   * Modulo operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  mod(other) {
    return F.new({ left: this, right: other, operator: "%" });
  }

  /**
   * Power operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  pow(other) {
    return F.new({ left: this, right: other, operator: "^" });
  }

  /**
   * Concatenation operation
   * @param {*} other Another operand
   * @returns {F} New F expression
   */
  concat(other) {
    return F.new({ left: this, right: other, operator: "||" });
  }
}

// Use Proxy to implement Lua-like __call metamethod behavior
// Allows F to be called directly as a function: F('column_name')
const FProxy = new Proxy(F, {
  apply(target, thisArg, argumentsList) {
    return new F(argumentsList[0]);
  },
});

// Export F with function call capability
export default FProxy;
export { F };
