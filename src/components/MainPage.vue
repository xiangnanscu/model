<script setup>
import { computed } from "vue";
import { ref } from "vue";
import Model from "../model.mjs";

const Usr = Model.createModel({
  tableName: "usr",
  fields: {
    name: { label: "姓名", unique: true, maxlength: 4, minlength: 1 },
    age: { label: "年龄", type: "integer", max: 100, min: 1, required: true },
  },
});
const Profile = Model.createModel({
  tableName: "profile",
  fields: {
    usrName: { label: "用户", reference: Usr, referenceColumn: "name" },
    info: { label: "信息", maxlength: 50 },
  },
});

defineProps({
  msg: String,
});

const modelFallback = {
  statement() {
    return "";
  },
};
const inputValue = ref("Usr.select('name').where({age__lt:10})");
const statements = computed(() => {
  const res = [];
  for (const line of inputValue.value.split("\n")) {
    res.push({ line, statement: eval(line) });
  }
  return res;
});

function onInput(event) {
  inputValue.value = event.target.value;
}
</script>

<template>
  <a-row>
    <a-col :span="12">
      <a-textarea
        class="form-control"
        rows="5"
        cols="100"
        :value="inputValue"
        @input="onInput"
      ></a-textarea>
    </a-col>
    <a-col :span="12">
      <a-list item-layout="horizontal" :data-source="statements">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <div>{{ item.line }}</div>
                <div>{{ item.statement }}</div>
              </template>
            </a-list-item-meta>
          </a-list-item>
        </template>
      </a-list>
    </a-col>
  </a-row>
</template>

<style scoped>
.row {
  display: flex;
}
a {
  color: #42b983;
}
</style>
