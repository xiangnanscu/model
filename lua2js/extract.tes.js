import { extract_column_name } from "./extract.js";

// 测试用例
const test_cases = [
  // 测试 T.col, user.name 格式
  { input: "T.col", expected: "col" },
  { input: "user.name", expected: "name" },
  { input: "table1.field_name", expected: "field_name" },

  // 测试 AS 别名格式
  { input: "T.col AS alias", expected: "alias" },
  { input: "col AS alias", expected: "alias" },
  { input: "column_name as new_name", expected: "new_name" },
  { input: "field AS   spaced_alias  ", expected: "spaced_alias" },

  // 测试函数调用（应该返回 null）
  { input: "COUNT(*)", expected: null },
  { input: "SUM(price)", expected: null },
  { input: "UPPER(name)", expected: null },

  // 测试直接列名
  { input: "simple_column", expected: "simple_column" },
  { input: "id", expected: "id" },
  { input: "user_name", expected: "user_name" },

  // 测试边界情况
  { input: "", expected: null },
  { input: "invalid.column.name", expected: null },
];

// 运行测试
console.log("开始测试 extract_column_name 函数...\n");

let passed_tests = 0;
const total_tests = test_cases.length;

test_cases.forEach((test_case, index) => {
  const result = extract_column_name(test_case.input);
  const passed = result === test_case.expected;

  console.log(`测试 ${index + 1}: ${passed ? "✅ 通过" : "❌ 失败"}`);
  console.log(`  输入: "${test_case.input}"`);
  console.log(`  期望: ${test_case.expected}`);
  console.log(`  实际: ${result}`);
  console.log("");

  if (passed) passed_tests++;
});

console.log(`测试总结: ${passed_tests}/${total_tests} 个测试通过`);

if (passed_tests === total_tests) {
  console.log("🎉 所有测试都通过了！");
} else {
  console.log("⚠️  有测试失败，请检查实现");
}
