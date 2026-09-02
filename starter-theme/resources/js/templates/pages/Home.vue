<script setup lang="ts">
import type { HomeProps } from '../../.bopli/types';
import ThemeLayout from '../../components/ThemeLayout.vue';

defineProps<HomeProps>();
</script>

<template>
  <ThemeLayout :settings="settings">
    <main>
      <h1>{{ page.title }}</h1>
      <p>{{ site.tagline }}</p>
      <p v-if="typeof page.fields.body === 'string'">{{ page.fields.body }}</p>
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
