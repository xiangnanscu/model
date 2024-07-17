<script setup>
import { RouterLink, RouterView } from "vue-router";
import HelloWorld from "~/components/Hello.vue";
import Model from "~/lib/model";
import src from "@/assets/models.mjs?raw";

const srcCode = ref(src);
eval(srcCode.value);
const playCode = ref("");
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="@xiangnanscu/model" />

      <nav>
        <RouterLink to="/HomeView">Home</RouterLink>
        <RouterLink to="/AboutView" style="margin-left: 1em">About</RouterLink>
      </nav>
    </div>
  </header>
  <div style="display: flex; justify-content: space-between">
    <textarea v-model="srcCode" placeholder="" placeholder-class="textarea-placeholder" rows="25" cols="100" />
  </div>
  <RouterView />
</template>

<style scoped>
header {
  display: flex;
  justify-content: left;
}
</style>
