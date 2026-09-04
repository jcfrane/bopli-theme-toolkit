<script setup lang="ts">
import { defineEntryTemplate, field } from '@bopli/theme-sdk/authoring';
import type { EntryProps } from '../../.bopli/types';
import ThemeLayout from '../../components/ThemeLayout.vue';

defineEntryTemplate({
  name: 'Standard entry',
  default: true,
  fields: {
    body: field.longText({ required: true }),
  },
});

defineProps<EntryProps>();
</script>

<template>
  <ThemeLayout :settings="settings" :footer="footer">
    <main>
      <a href="/">{{ site.name }}</a>
      <article>
        <h1>{{ entry.title }}</h1>
        <p>{{ entry.body }}</p>
      </article>
    </main>
  </ThemeLayout>
</template>

<style scoped>
main {
  max-width: 48rem;
  margin: 0 auto;
  padding: 5rem 1.5rem;
  font-family: system-ui, sans-serif;
}
</style>
