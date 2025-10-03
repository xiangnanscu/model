<script setup>
// import "highlight.js/styles/github.css";
import "highlight.js/styles/stackoverflow-light.css";
import "highlight.js/lib/common";
import hljsVuePlugin from "@highlightjs/vue-plugin";
import prettier from "prettier/standalone";
import prettierPluginBabel from "prettier/plugins/babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { format as sqlFormatter } from "sql-formatter";
import Xodel from "~/lib/sqlmodel";
import modelsSrc from "@/assets/models.mjs?raw";
import testSrc from "@/assets/test.mjs?raw";

const { Q, F, Sum, Avg, Max, Min, Count } = Xodel;
const formatJs = async (js) =>
  await prettier.format(js, {
    parser: "babel",
    plugins: [prettierPluginBabel, prettierPluginEstree],
  });
const highlightjs = hljsVuePlugin.component;
const pgFormat = (e) => sqlFormatter(e, { language: "postgresql" });
const editModelsStatus = ref(false);
const editTestStatus = ref(false);
const modelsDrawerOpen = ref(false);
const srcCode = ref(modelsSrc);
const testCode = ref(testSrc);
const testBufferCode = ref(testSrc);

const openModelsDrawer = () => {
  modelsDrawerOpen.value = true;
  editModelsStatus.value = true; // 直接进入编辑状态
};

const gotoLine = (i) => {
  const element = document.getElementById(`line-${i}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
  }
};
const models = computed(() =>
  eval(`(() => {
${srcCode.value}
return { ${Array.from(srcCode.value.matchAll(/const\s+([\w_]+)\s+=\s+Xodel/g))
    .map((e) => e[1])
    .join(", ")} };
})()`),
);

watch(models, () => Object.assign(self, models.value), { immediate: true });
const jsQueryLines = computed(() =>
  testCode.value
    .split(";")
    .map((e) => e.trim())
    .filter((e) => e),
);

const queryObjects = ref([]);
watch(
  jsQueryLines,
  (value, old) => {
    try {
      queryObjects.value = eval(`[${value.join(",")}]`);
    } catch (error) {
      console.error(error);
      // queryObjects.value = eval(`[${old.join(",")}]`);
    }
  },
  { immediate: true },
);
const sqlOutput = ref([]);
watch(
  queryObjects,
  async () => {
    const res = [];
    for (const [i, sql] of Object.entries(queryObjects.value)) {
      if (sql.statement) {
        res.push({ js: await formatJs(jsQueryLines.value[i]), sql: pgFormat(sql.statement()) });
      } else {
        res.push({ js: "", sql: "" });
      }
    }
    sqlOutput.value = res;
  },
  { immediate: true },
);
</script>

<template>
  <div class="playground-container">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <button @click="openModelsDrawer" class="btn-primary">Edit Models</button>
      <button @click="editTestStatus = !editTestStatus" class="btn-secondary">
        {{ !editTestStatus ? "Edit" : "Save" }} Test Code
      </button>
    </div>

    <!-- 主要内容区域 -->
    <div class="main-content">
      <!-- 左侧：测试代码区域 -->
      <div class="test-code-section">
        <h3>Test Code</h3>
        <div v-if="editTestStatus" class="edit-area">
          <textarea
            v-model.lazy="testCode"
            placeholder="Enter test code..."
            rows="30"
            class="code-textarea"
          />
        </div>
        <div v-else class="code-display">
          <div v-for="(code, i) of jsQueryLines" :key="i" class="code-line" @click="gotoLine(i)">
            <highlightjs language="javascript" :code="code" />
          </div>
        </div>
      </div>

      <!-- 右侧：SQL输出区域 -->
      <div class="sql-output-section">
        <h3>SQL Output</h3>
        <div class="sql-output">
          <div v-for="(out, i) in sqlOutput" :key="i" :id="`line-${i}`" class="output-item">
            <div class="js-code">
              <highlightjs language="javascript" :code="out.js" />
            </div>
            <div class="sql-code">
              <highlightjs language="sql" :code="out.sql" />
            </div>
            <div class="divider"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 模型定义抽屉 -->
    <div
      v-if="modelsDrawerOpen"
      class="drawer-overlay"
      @click="!editModelsStatus && (modelsDrawerOpen = false)"
    >
      <div class="drawer" @click.stop>
        <div class="drawer-header">
          <h3>Model Definition</h3>
          <button @click="modelsDrawerOpen = false" class="close-btn">×</button>
        </div>
        <div class="drawer-content">
          <div class="drawer-toolbar">
            <button @click="editModelsStatus = !editModelsStatus" class="btn-secondary">
              {{ !editModelsStatus ? "Edit" : "Save" }} Models
            </button>
          </div>
          <div v-if="editModelsStatus" class="edit-area">
            <textarea
              v-model="srcCode"
              placeholder="Enter model definition..."
              rows="25"
              class="code-textarea"
            />
          </div>
          <div v-else class="code-display">
            <highlightjs id="srcCode" language="javascript" :code="srcCode" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playground-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  gap: 1rem;
  background: #f8f9fa;
}

.btn-primary {
  background: #007bff;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #545b62;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.test-code-section {
  width: 50%;
  padding: 1rem;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sql-output-section {
  width: 50%;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.test-code-section h3,
.sql-output-section h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.2rem;
}

.edit-area {
  flex: 1;
  display: flex;
}

.code-textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.code-textarea:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.code-display {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f9fa;
}

.code-line {
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #e9ecef;
  padding: 0.5rem;
  margin: 0;
}

.code-line:hover {
  background: #e3f2fd;
}

.sql-output {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f9fa;
  padding: 1rem;
}

.output-item {
  margin-bottom: 2rem;
}

.js-code {
  margin-bottom: 0.5rem;
}

.sql-code {
  margin-bottom: 1rem;
}

.divider {
  border-bottom: 1px solid #ccc;
  margin-bottom: 1rem;
}

/* 抽屉样式 */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-start;
}

.drawer {
  width: 60%;
  max-width: 800px;
  background: white;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
}

.drawer-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
}

.drawer-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #e9ecef;
}

.drawer-content {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-toolbar {
  margin-bottom: 1rem;
}
</style>
