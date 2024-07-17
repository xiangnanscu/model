<script setup>
const { user } = useSession();
</script>
<template>
  <div>
    <h1>This is an home page for: {{ toUpper(user.username) }}</h1>
  </div>
</template>
