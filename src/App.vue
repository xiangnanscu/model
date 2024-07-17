<script setup>
const router = useRouter();
router.push({ name: "Playground" });
</script>

<template>
  <h1>@xiangnanscu/model</h1>
  <p>straight forward and powerful orm library for postgresql</p>
  <router-link to="/">Home</router-link>
  <router-link to="/Playground" style="margin-left: 1em">Playground</router-link>
  <a style="margin-left: 1em" href="https://github.com/xiangnanscu/model" target="_blank">Github</a>
  <Suspense>
    <router-view />
  </Suspense>
</template>

<style scoped>
.row {
  display: flex;
  justify-content: left;
}
</style>
