<bopli lang="json">
{
  "name": "Standard entry",
  "default": true,
  "fields": {
    "body": { "name": "Body", "type": "long_text", "required": true }
  }
}
</bopli>

<script setup lang="ts">
import type { StarterEntryProps } from '../../types';

defineProps<StarterEntryProps>();
</script>

<template>
  <main>
    <a href="/">{{ site.name }}</a>
    <article>
      <h1>{{ entry.title }}</h1>
      <p>{{ entry.body }}</p>
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
