<bopli lang="json">
{
  "name": "Standard page",
  "default": true
}
</bopli>

<script setup lang="ts">
import type { PageProps } from '../../.bopli/types';

defineProps<PageProps>();
</script>

<template>
  <main>
    <a href="/">{{ site.name }}</a>
    <article>
      <h1>{{ page.title }}</h1>
      <p v-if="typeof page.fields.body === 'string'">{{ page.fields.body }}</p>
    </article>
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
