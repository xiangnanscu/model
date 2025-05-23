import F from "../lib/F.mjs";

// 使用示例

// 1. 创建字段引用
const price = F("price");
const quantity = F("quantity");
const discount = F("discount");

console.log("字段引用:");
console.log("price:", price.toString());
console.log("quantity:", quantity.toString());

// 2. 算术运算
const total = price.mul(quantity);
console.log("\n算术运算:");
console.log("price * quantity:", total.toString());

const discounted_total = total.sub(discount);
console.log("total - discount:", discounted_total.toString());

// 3. 复杂表达式
const complex_expr = price.add(10).mul(quantity.sub(1));
console.log("\n复杂表达式:");
console.log("(price + 10) * (quantity - 1):", complex_expr.toString());

// 4. 连接运算
const name = F("first_name");
const surname = F("last_name");
const full_name = name.concat(" ").concat(surname);
console.log("\n字符串连接:");
console.log('first_name || " " || last_name:', full_name.toString());

// 5. 其他运算
const percentage = price.div(100);
console.log("\n其他运算:");
console.log("price / 100:", percentage.toString());

const power = price.pow(2);
console.log("price ^ 2:", power.toString());

const remainder = quantity.mod(10);
console.log("quantity % 10:", remainder.toString());

// 6. 验证__IS_FIELD_BUILDER__属性
console.log("\n验证属性:");
console.log("price.__IS_FIELD_BUILDER__:", price.__IS_FIELD_BUILDER__);
