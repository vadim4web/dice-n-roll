<script setup>
import { computed } from 'vue';

const props = defineProps({
  disabled: Boolean,
  busy: Boolean,
  title: {
    type: String,
    default: 'Сдвинуть нижнюю FIFO-карусель на одну пару за 1 дайс: первая незакреплённая пара уходит, справа появляется новая.',
  },
  credits: { type: Number, default: null },
  cost: { type: Number, default: 1 },
});
defineEmits(['click']);

const unavailable = computed(() => props.disabled || props.busy || (props.credits !== null && props.credits < props.cost));
const positions = {
  2: ['nw', 'se'],
  3: ['nw', 'c', 'se'],
  4: ['nw', 'ne', 'sw', 'se'],
  5: ['nw', 'ne', 'c', 'sw', 'se'],
  6: ['nw', 'ne', 'w', 'e', 'sw', 'se'],
};
const cubes = [
  { name: 'left', faces: [{ side: 'front', value: 5 }, { side: 'right', value: 3 }, { side: 'top', value: 4 }] },
  { name: 'right', faces: [{ side: 'front', value: 3 }, { side: 'right', value: 2 }, { side: 'top', value: 6 }] },
];
</script>

<template>
  <button
    type="button"
    :class="['golden-drop', { 'is-busy': busy }]"
    :disabled="unavailable"
    :title="title"
    aria-label="Drop the Dice"
    :aria-busy="busy"
    @click="$emit('click', $event)"
  >
    <span class="golden-drop__scene" aria-hidden="true">
      <span class="golden-drop__glow" />
      <span v-for="cube in cubes" :key="cube.name" :class="['golden-cube', `golden-cube--${cube.name}`]">
        <span v-for="face in cube.faces" :key="face.side" :class="['golden-face', `golden-face--${face.side}`]">
          <span class="golden-face__inlay" />
          <span class="golden-pips">
            <span v-for="position in positions[face.value]" :key="position" :class="['golden-pip', `golden-pip--${position}`]" />
          </span>
        </span>
      </span>
      <span class="golden-drop__spark golden-drop__spark--one">✦</span>
      <span class="golden-drop__spark golden-drop__spark--two">✧</span>
    </span>
    <span class="golden-drop__label">{{ busy ? 'Кости в движении…' : 'Drop the Dice' }}<span v-if="!busy" class="golden-drop__arrow" aria-hidden="true">↗</span></span>
    <span class="golden-drop__cost">−{{ cost }} дайс.<span v-if="credits !== null"> · в кошельке {{ credits }}</span></span>
  </button>
</template>

<style scoped>
.golden-drop {
  --gold-ink: #ffe8a6;
  display: flex;
  width: 180px;
  min-height: 150px;
  padding: 0 3px 8px;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--gold-ink);
  font: inherit;
  cursor: pointer;
  isolation: isolate;
  transition: color .2s, background .2s, opacity .2s;
}
.golden-drop:not(:disabled):hover { background: #e4b74a0a; color: #fff2c5; }
.golden-drop:not(:disabled):active .golden-drop__scene { transform: translateY(3px); }
.golden-drop:focus-visible { outline: 2px solid #f4ce6b; outline-offset: 5px; }
.golden-drop:disabled { cursor: not-allowed; opacity: .42; }
.golden-drop.is-busy { opacity: 1; cursor: wait; }
.golden-drop__scene {
  display: block;
  position: relative;
  width: 170px;
  height: 107px;
  perspective: 650px;
  transition: transform .18s;
}
.golden-drop__glow {
  position: absolute;
  width: 126px;
  height: 29px;
  bottom: 6px;
  left: 22px;
  border-radius: 50%;
  background: #e8ac2e1a;
  box-shadow: 0 0 21px 5px #f5c24a10;
  filter: blur(8px);
}
.golden-cube {
  --size: 49px;
  --half: 24.5px;
  position: absolute;
  display: block;
  width: var(--size);
  height: var(--size);
  transform-style: preserve-3d;
  transition: transform .35s cubic-bezier(.2,.7,.3,1);
}
.golden-cube--left { left: 28px; top: 40px; transform: rotateX(-24deg) rotateY(-31deg) rotateZ(-16deg); z-index: 2; }
.golden-cube--right { --size: 55px; --half: 27.5px; right: 25px; top: 17px; transform: rotateX(-26deg) rotateY(-32deg) rotateZ(13deg); }
.golden-face {
  position: absolute;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid #fff0ab;
  border-radius: 8px;
  backface-visibility: hidden;
  box-shadow: inset 0 0 0 1px #c68717, inset 2px 2px 3px #fff6c980;
}
.golden-face--front { transform: translateZ(var(--half)); background: linear-gradient(135deg, #fff1ac 0%, #edbd43 37%, #d49619 100%); }
.golden-face--right { transform: rotateY(90deg) translateZ(var(--half)); background: linear-gradient(140deg, #e7b340, #b8720c 65%, #8f4f07); border-color: #f1c568; box-shadow: inset 0 0 0 1px #965b0d, inset 2px 2px 4px #fff3a54d; }
.golden-face--top { transform: rotateX(90deg) translateZ(var(--half)); background: linear-gradient(130deg, #fff7cb, #ffe18b 40%, #e6b43e); }
.golden-face__inlay { position: absolute; inset: 4px; border: 1px solid #fff0b35c; border-radius: 4px; pointer-events: none; }
.golden-pips { position: absolute; display: grid; inset: 10px; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 3px; }
.golden-pip { display: block; min-width: 0; min-height: 0; border-radius: 50%; background: radial-gradient(circle at 63% 74%, #5c3708 0%, #372005 60%, #160e03 100%); box-shadow: inset 1px 2px 2px #000b, 0 1px 0 #fff1ac; }
.golden-pip--nw { grid-area: 1 / 1; }.golden-pip--ne { grid-area: 1 / 3; }.golden-pip--w { grid-area: 2 / 1; }.golden-pip--c { grid-area: 2 / 2; }.golden-pip--e { grid-area: 2 / 3; }.golden-pip--sw { grid-area: 3 / 1; }.golden-pip--se { grid-area: 3 / 3; }
.golden-drop__spark { position: absolute; font-size: 15px; line-height: 1; color: #f8d574; text-shadow: 0 0 10px #f6c44666; pointer-events: none; transition: transform .3s, opacity .3s; }
.golden-drop__spark--one { left: 16px; top: 18px; opacity: .7; }.golden-drop__spark--two { right: 11px; bottom: 10px; opacity: .5; font-size: 19px; }
.golden-drop__label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; line-height: 1.6; letter-spacing: .05px; text-shadow: 0 1px 12px #0004; }
.golden-drop__arrow { font-size: 14px; font-weight: 400; color: #d4a743; transition: transform .2s; }
.golden-drop__cost { font-size: 8px; line-height: 1.7; letter-spacing: .35px; color: #bf9e67; }
.golden-drop:not(:disabled):hover .golden-cube--left { transform: translateY(-5px) rotateX(-29deg) rotateY(-37deg) rotateZ(-21deg); }
.golden-drop:not(:disabled):hover .golden-cube--right { transform: translateY(-6px) rotateX(-20deg) rotateY(-25deg) rotateZ(19deg); }
.golden-drop:not(:disabled):hover .golden-drop__spark--one { transform: rotate(45deg) scale(1.2); opacity: 1; }
.golden-drop:not(:disabled):hover .golden-drop__spark--two { transform: rotate(-30deg); opacity: .85; }
.golden-drop:not(:disabled):hover .golden-drop__arrow { transform: translate(2px, -2px); }
.golden-drop.is-busy .golden-cube--left { animation: gold-tumble-left .8s ease-in-out infinite; }
.golden-drop.is-busy .golden-cube--right { animation: gold-tumble-right .8s ease-in-out .1s infinite; }
@keyframes gold-tumble-left { 0%,100% { transform: rotateX(-24deg) rotateY(-31deg) rotateZ(-16deg); } 45% { transform: translateY(-12px) rotateX(-38deg) rotateY(-55deg) rotateZ(12deg); } }
@keyframes gold-tumble-right { 0%,100% { transform: rotateX(-26deg) rotateY(-32deg) rotateZ(13deg); } 45% { transform: translateY(-15px) rotateX(-13deg) rotateY(-15deg) rotateZ(-12deg); } }
@media (max-width: 640px) { .golden-drop { width: 160px; min-height: 143px; }.golden-drop__scene { transform: scale(.9); margin: -4px 0 -5px; }.golden-drop:not(:disabled):active .golden-drop__scene { transform: scale(.9) translateY(3px); }.golden-drop__label { font-size: 12px; } }
@media (prefers-reduced-motion: reduce) { .golden-drop, .golden-cube, .golden-drop__scene, .golden-drop__spark, .golden-drop__arrow { transition: none; animation: none !important; } }
</style>
