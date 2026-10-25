<script setup>
import DieFace from './DieFace.vue';
import SvgIcon from './SvgIcon.vue';
defineProps({ value: Number, index: Number, selected: Boolean, held: Boolean, disabled: Boolean });
defineEmits(['select']);
const tilts = [-9, 6, -4, 8, -7, 5];
</script>
<template>
  <div class="die-wrap" :style="{ '--i': index }">
    <button :class="['die', { selected, held }]" :data-face="value" :data-index="index" :style="{ '--tilt': `${tilts[index]}deg` }" :aria-label="`Кость ${index + 1}: ${value}${held ? ', сохранена' : ''}`" :aria-pressed="selected" :disabled="disabled || held" @click="$emit('select', index)">
      <DieFace :value="value" />
    </button>
    <span :class="['die-label', { empty: !selected && !held }]"><template v-if="held || selected"><SvgIcon name="check" /> {{ held ? 'В ИГРЕ' : 'ВЫБРАНА' }}</template><template v-else>0{{ index + 1 }}</template></span>
  </div>
</template>
