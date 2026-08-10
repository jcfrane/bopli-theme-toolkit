<bopli lang="json">
{
  "name": "Home"
}
</bopli>

<script setup lang="ts">
import type { StarterPageProps } from '../../types';

defineProps<StarterPageProps>();
</script>

<template>
  <main>
    <h1>{{ page.title }}</h1>
    <p>{{ site.tagline }}</p>
    <p v-if="page.fields.body">{{ page.fields.body }}</p>
  </main>
</template>

<style scoped>
main {
  max-width: 48rem;
  margin: 0 auto;
  padding: 5rem 1.5rem;
  font-family: system-ui, sans-serif;
}
</style>
