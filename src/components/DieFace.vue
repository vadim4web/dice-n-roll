<script setup>
import { computed } from 'vue';
const props = defineProps({ value: { type: Number, required: true } });
const faces = { 1: ['center'], 2: ['tl', 'br'], 3: ['tl', 'center', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'center', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };
const positions = computed(() => faces[props.value] || []);
</script>
<template><span class="pips"><span v-for="position in positions" :key="position" :class="['pip', position]" /></span></template>
