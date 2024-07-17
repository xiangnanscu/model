<script setup>
defineProps(["msg"]);
</script>

<template>
  <h1>{{ toUpper(msg) }}</h1>
</template>
