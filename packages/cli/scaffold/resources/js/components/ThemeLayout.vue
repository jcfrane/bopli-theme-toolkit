<script setup lang="ts">
import { computed } from 'vue';

import '../theme.css';
import type { ThemeSettings } from '../.bopli/types';

const props = defineProps<{ settings: ThemeSettings }>();

const themeStyle = computed(() => ({
  '--color-accent': props.settings.accent_color,
}));
</script>

<template>
  <div class="bopli-theme" :style="themeStyle">
    <slot />
  </div>
</template>
