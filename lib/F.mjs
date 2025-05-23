// https://docs.djangoproject.com/en/dev/ref/models/expressions/#django.db.models.F

/**
 * F类用于构建类似Django ORM的F表达式
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
   * 创建新的F实例
   * @param {Object} args 参数对象
   * @returns {F} 新的F实例
   */
  static new(args = {}) {
    const instance = new F();
    Object.assign(instance, args);
    return instance;
  }

  /**
   * 字符串表示
   * @returns {string} F表达式的字符串形式
   */
  toString() {
    if (this.column) {
      return this.column;
    } else {
      return `(${this.left} ${this.operator} ${this.right})`;
    }
  }

  /**
   * 加法运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  add(other) {
    return F.new({ left: this, right: other, operator: "+" });
  }

  /**
   * 减法运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  sub(other) {
    return F.new({ left: this, right: other, operator: "-" });
  }

  /**
   * 乘法运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  mul(other) {
    return F.new({ left: this, right: other, operator: "*" });
  }

  /**
   * 除法运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  div(other) {
    return F.new({ left: this, right: other, operator: "/" });
  }

  /**
   * 取模运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  mod(other) {
    return F.new({ left: this, right: other, operator: "%" });
  }

  /**
   * 幂运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  pow(other) {
    return F.new({ left: this, right: other, operator: "^" });
  }

  /**
   * 连接运算
   * @param {*} other 另一个操作数
   * @returns {F} 新的F表达式
   */
  concat(other) {
    return F.new({ left: this, right: other, operator: "||" });
  }
}

// 使用Proxy实现类似Lua __call元方法的行为
// 允许F直接作为函数调用：F('column_name')
const FProxy = new Proxy(F, {
  apply(target, thisArg, argumentsList) {
    return new F(argumentsList[0]);
  },
});

// 导出带有函数调用能力的F
export default FProxy;
export { F };
