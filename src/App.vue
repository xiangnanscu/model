<script setup>
import { RouterLink, RouterView } from "vue-router";
import HelloWorld from "~/components/Hello.vue";
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="You did it!" />

      <nav>
        <RouterLink to="/HomeView">Home</RouterLink>
        <RouterLink to="/AboutView" style="margin-left: 1em">About</RouterLink>
      </nav>
    </div>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  display: flex;
  justify-content: left;
}
</style>
