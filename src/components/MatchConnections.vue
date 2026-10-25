<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  matches: { type: Array, default: () => [] },
  upper: { type: Array, default: () => [] },
});
const svg = ref(null);
const paths = ref([]);
const viewBox = ref('0 0 1 1');
const palette = ['#ffc76d', '#76d5aa', '#9ba5ff', '#ff8296'];
let machine, observer, frame, disposed = false;
const observed = new Set();

function observeElements(elements) {
  if (!observer) return;
  const current = new Set(elements);
  for (const element of observed) {
    if (!current.has(element)) { observer.unobserve(element); observed.delete(element); }
  }
  for (const element of current) {
    if (!observed.has(element)) { observer.observe(element); observed.add(element); }
  }
}

function measure() {
  if (disposed || !machine || !svg.value) return;
  const bounds = machine.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) { paths.value = []; return; }
  viewBox.value = `0 0 ${bounds.width} ${bounds.height}`;
  const visiblePaths = [];
  const elements = [machine];
  for (const match of props.matches) {
    const upperIndex = match.upperIndex;
    if (!Number.isInteger(upperIndex) || upperIndex < 0 || upperIndex > 5 || !Array.isArray(match.lowerIndices)) continue;
    const upperTile = machine.querySelector(`button.domino-tile[data-row="upper"][data-index="${upperIndex}"]`);
    if (!upperTile) continue;
    elements.push(upperTile);
    const top = upperTile.getBoundingClientRect();
    if (!(top.width > 0 && top.height > 0)) continue;
    const x1 = top.left + top.width / 2 - bounds.left;
    const y1 = top.bottom - bounds.top;
    const color = palette[props.upper[upperIndex]?.suit] || palette[0];
    for (const lowerIndex of match.lowerIndices) {
      if (!Number.isInteger(lowerIndex) || lowerIndex < 0 || lowerIndex > 5) continue;
      const lowerTile = machine.querySelector(`button.domino-tile[data-row="lower"][data-index="${lowerIndex}"]`);
      if (!lowerTile) continue;
      elements.push(lowerTile);
      const bottom = lowerTile.getBoundingClientRect();
      if (!(bottom.width > 0 && bottom.height > 0)) continue;
      const x2 = bottom.left + bottom.width / 2 - bounds.left;
      const y2 = bottom.top - bounds.top;
      const bend = Math.max(25, Math.abs(y2 - y1) * .4);
      if (![x1, y1, x2, y2, bend].every(Number.isFinite)) continue;
      visiblePaths.push({
        key: `${upperIndex}-${lowerIndex}`,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        x1, y1, x2, y2, color,
        title: `Верхняя пара ${upperIndex + 1} совпадает с нижней парой ${lowerIndex + 1}: одинаковые числа в любом порядке.`,
      });
    }
  }
  paths.value = visiblePaths;
  observeElements(elements);
}

async function scheduleMeasure() {
  await nextTick();
  if (disposed || !machine) return;
  if (typeof window.requestAnimationFrame !== 'function') { measure(); return; }
  if (frame !== undefined) window.cancelAnimationFrame(frame);
  frame = window.requestAnimationFrame(() => { frame = undefined; measure(); });
}

watch([() => props.matches, () => props.upper], scheduleMeasure, { deep: true, flush: 'post' });
onMounted(() => {
  machine = svg.value?.parentElement;
  if (!machine) return;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure);
    observer.observe(machine);
    observed.add(machine);
  }
  window.addEventListener('resize', scheduleMeasure);
  machine.addEventListener('transitionend', scheduleMeasure);
  machine.addEventListener('animationend', scheduleMeasure);
  scheduleMeasure();
});
onBeforeUnmount(() => {
  disposed = true;
  if (frame !== undefined) window.cancelAnimationFrame(frame);
  observer?.disconnect();
  observed.clear();
  window.removeEventListener('resize', scheduleMeasure);
  machine?.removeEventListener('transitionend', scheduleMeasure);
  machine?.removeEventListener('animationend', scheduleMeasure);
});
</script>

<template>
  <svg ref="svg" class="matching-layer" :viewBox="viewBox" preserveAspectRatio="none" role="img" aria-label="Совпадения между верхними и нижними парами">
    <title>Совпадения между верхними и нижними парами</title>
    <g v-for="path in paths" :key="path.key" :style="{ '--match-color': path.color }">
      <path class="match-glow" :d="path.d" />
      <path class="match-line" :d="path.d"><title>{{ path.title }}</title></path>
      <circle class="match-endpoint" :cx="path.x1" :cy="path.y1" r="4" />
      <circle class="match-endpoint" :cx="path.x2" :cy="path.y2" r="4" />
    </g>
  </svg>
</template>

<style scoped>
.matching-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 2;
  fill: none;
}
.match-line, .match-glow { stroke: var(--match-color); stroke-linecap: round; vector-effect: non-scaling-stroke; }
.match-line { stroke-width: 1.6; opacity: .86; }
.match-glow { stroke-width: 7; opacity: .075; }
.match-endpoint { fill: var(--match-color); stroke: #201317; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
</style>
