<script setup>
import { computed } from 'vue';
import DieFace from './DieFace.vue';
import SvgIcon from './SvgIcon.vue';
const props = defineProps({ tile: { type: Object, required: true }, row: String, index: Number, matched: Boolean, paid: Boolean, active: Boolean, busy: Boolean, rolling: Boolean });
defineEmits(['select']);
const symbols = ['♠', '♥', '♣', '♦'];
const suits = ['пики', 'червы', 'трефы', 'бубны'];
const tileTitle = computed(() => {
  const lock = props.tile.lockRemaining ? `Зафиксирована ещё на ${props.tile.lockRemaining} ${props.row === 'upper' ? 'Roll' : 'Drop'}. Можно освободить бесплатно.` : props.row === 'upper' ? 'Фиксация: 1 Roll за 1 дайс или 3 Roll за 3 дайса.' : 'Фиксация: 3 Drop за 2 дайса или 6 Drop за 4 дайса.';
  return `Пара ${props.tile.a} · ${props.tile.b}. ${props.row === 'upper' ? `Покер: число ${props.tile.a}, масть ${suits[props.tile.suit]}. ` : ''}Совпадает с такими же двумя числами в другом ряду, порядок не важен. ${lock} Нажми, чтобы выбрать фиксацию.`;
});
</script>
<template>
  <div :class="['domino-slot', row, { matched, locked: tile.lockRemaining, active, paid }]">
    <div class="slot-caption"><span>{{ String(index + 1).padStart(2, '0') }}</span><span v-if="matched" class="match-caption"><SvgIcon name="check" /> MATCH</span><span v-else>{{ row === 'upper' ? 'REEL' : 'FIFO' }}</span></div>
    <button :class="['domino-tile', { spinning: rolling && row === 'upper' && !tile.lockRemaining }]" :data-row="row" :data-index="index" :data-tile-id="tile.id" :data-locked="!!tile.lockRemaining" :disabled="busy" :aria-label="`Пара ${index + 1}, ${tile.a} и ${tile.b}, ${tile.lockRemaining ? 'зафиксирована' : 'настроить фиксацию'}`" :aria-pressed="!!tile.lockRemaining" :title="tileTitle" @click="$emit('select', { row, index })">
      <span class="tile-content"><span class="domino-face"><DieFace :value="tile.a" /></span><span class="domino-divider"><span /></span><span class="domino-face"><DieFace :value="tile.b" /></span><span v-if="row === 'upper'" :class="['suit-badge', `suit-${tile.suit}`]" :title="`Масть ${suits[tile.suit]} участвует во флеше; для совпадения пары масть не нужна.`">{{ symbols[tile.suit] }}</span></span>
    </button>
    <button class="slot-lock" :disabled="busy" :title="tileTitle" @click="$emit('select', { row, index })"><SvgIcon :name="tile.lockRemaining ? 'lock' : 'unlock'" /><span>{{ tile.lockRemaining ? `${tile.lockRemaining} ${row === 'upper' ? 'Roll' : 'Drop'}` : row === 'upper' ? 'от 1 дайса' : 'от 2 дайсов' }}</span></button>
  </div>
</template>
