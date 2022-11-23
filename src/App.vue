<script setup>
import { computed, onMounted } from "vue";
import MainPage from "./components/MainPage.vue";
import packages from "../package.json";

const githubRepoUrl = computed(() => {
  const matched = packages.name.match(/@(\w+)\/(\w+)/);
  if (matched) {
    return `https://github.com/${matched[1]}/${matched[2]}.git`;
  } else {
    return `https://github.com/xiangnanscu/${packages.name}.git`;
  }
});
const npmUrl = `https://www.npmjs.com/package/${packages.name}`;
</script>

<template>

  <a-layout theme="light">
    <a-layout-header theme="light">
      <h1>
        <a :href="githubRepoUrl">{{ packages.name }}</a
        >-<a :href="npmUrl">{{ packages.version }}</a>
      </h1></a-layout-header
    >
    <a-layout-content><MainPage /></a-layout-content>
  </a-layout>
</template>

<style>

</style>
