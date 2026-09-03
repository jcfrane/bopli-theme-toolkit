<script setup lang="ts">
import { definePageTemplate, field } from '@bopli/theme-sdk/authoring';
import type { PageProps } from '../../.bopli/types';
import ThemeLayout from '../../components/ThemeLayout.vue';

definePageTemplate({
  name: 'Standard page',
  default: true,
  fields: {
    body: field.longText(),
  },
});

defineProps<PageProps>();
</script>

<template>
  <ThemeLayout :settings="settings">
    <main>
      <a href="/">{{ site.name }}</a>
      <article>
        <h1>{{ page.title }}</h1>
        <p v-if="typeof page.fields.body === 'string'">{{ page.fields.body }}</p>
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
