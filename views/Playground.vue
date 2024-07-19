<script setup>
// import "highlight.js/styles/github.css";
import "highlight.js/styles/stackoverflow-light.css";
import "highlight.js/lib/common";
import hljsVuePlugin from "@highlightjs/vue-plugin";
import prettier from "prettier/standalone";
import prettierPluginBabel from "prettier/plugins/babel";
import prettierPluginEstree from "prettier/plugins/estree";
import { format as sqlFormatter } from "sql-formatter";
import Model from "~/lib/model";
import modelsSrc from "@/assets/models.mjs?raw";
import testSrc from "@/assets/test.mjs?raw";

const formatJs = async (js) =>
  await prettier.format(js, {
    parser: "babel",
    plugins: [prettierPluginBabel, prettierPluginEstree],
  });
const highlightjs = hljsVuePlugin.component;
const pgFormat = (e) => sqlFormatter(e, { language: "postgresql" });
const editModelsStatus = ref(false);
const editTestStatus = ref(false);
const srcCode = ref(modelsSrc);
const testCode = ref(testSrc);
const testBufferCode = ref(testSrc);
const gotoLine = (i) => {
  const element = document.getElementById(`line-${i}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
  }
};
const models = computed(() =>
  eval(`(() => {
${srcCode.value}
return { ${Array.from(srcCode.value.matchAll(/const\s+([\w_]+)\s+=\s+(Model.create|new Model)/g))
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
      queryObjects.value = eval(`[${old.join(",")}]`);
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
  <div class="row">
    <div style="width: 50%">
      <button @click="editModelsStatus = !editModelsStatus">{{ !editModelsStatus ? "edit" : "save" }} models</button>
      <div v-if="editModelsStatus" style="display: flex; justify-content: space-between">
        <textarea
          v-model="srcCode"
          placeholder=""
          placeholder-class="textarea-placeholder"
          rows="25"
          style="width: 100%"
        />
      </div>
      <div v-else>
        <highlightjs id="srcCode" language="javascript" :code="srcCode" />
        <!-- <pre>{{ srcCode }}</pre> -->
      </div>
      <button @click="editTestStatus = !editTestStatus">{{ !editTestStatus ? "edit" : "save" }} test code</button>
      <div v-if="editTestStatus" style="display: flex; justify-content: space-between">
        <textarea
          v-model.lazy="testCode"
          placeholder=""
          placeholder-class="textarea-placeholder"
          rows="25"
          style="width: 100%"
        />
      </div>
      <div v-else>
        <div v-for="(code, i) of jsQueryLines" :key="i" style="cursor: pointer">
          <highlightjs @click="gotoLine(i)" language="javascript" :code="code" />
        </div>
      </div>
    </div>
    <div style="padding: 1em; width: 50%; padding-bottom: 100em">
      <div v-for="(out, i) in sqlOutput" :key="i" :id="`line-${i}`">
        <highlightjs language="javascript" :code="out.js" />
        <highlightjs language="sql" :code="out.sql" />
        <div style="border: 1px solid #ccc; height: 0"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  margin-top: 1em;
  display: flex;
  justify-content: left;
}
</style>
