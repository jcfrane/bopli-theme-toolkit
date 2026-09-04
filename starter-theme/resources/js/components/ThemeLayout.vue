<script setup lang="ts">
import { computed } from 'vue';

import '../theme.css';
import type { ThemeSettings } from '../.bopli/types';
import type { ThemeFooter } from '../.bopli/types';
import Footer from './Footer.vue';

const props = defineProps<{ settings: ThemeSettings; footer: ThemeFooter }>();

const themeStyle = computed(() => ({
  '--color-accent': props.settings.accent_color,
}));
</script>

<template>
  <div class="bopli-theme" :style="themeStyle">
    <slot />
    <Footer :footer="footer" />
  </div>
</template>
