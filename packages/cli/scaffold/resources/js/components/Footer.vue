<script setup lang="ts">
import { defineFooter, field, setting } from '@bopli/theme-sdk/authoring';
import type { ThemeFooter } from '../.bopli/types';

defineFooter({
  settings: {
    show_social_links: setting.boolean({
      name: 'Show social links',
      default: true,
    }),
  },
  fields: {
    message: field.text({ label: 'Footer message' }),
    links: field.list(
      {
        label: field.text({ required: true }),
        url: field.url({ required: true }),
      },
      { label: 'Footer links', maxItems: 8 },
    ),
  },
  defaults: {
    message: 'Powered by Boply',
    links: [],
  },
});

defineProps<{ footer: ThemeFooter }>();
</script>

<template>
  <footer>
    <p>{{ footer.content.message }}</p>
    <a v-for="link in footer.content.links" :key="link.url" :href="link.url">
      {{ link.label }}
    </a>
  </footer>
</template>
