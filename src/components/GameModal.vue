<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import SvgIcon from './SvgIcon.vue';
const props = defineProps({ open: Boolean });
const emit = defineEmits(['close']);
const dialog = ref(null);
watch(() => props.open, open => {
  if (open && !dialog.value.open) dialog.value.showModal();
  else if (!open && dialog.value.open) dialog.value.close();
}, { flush: 'post' });
function outside(event) {
  if (event.target !== dialog.value) return;
  const r = dialog.value.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) emit('close');
}
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close(); });
</script>
<template>
  <dialog id="modal" ref="dialog" aria-labelledby="modal-title" @cancel.prevent="$emit('close')" @close="$emit('close')" @click="outside">
    <div class="modal-header"><span class="eyebrow">DICE’N’ROLL</span><button class="icon-button" aria-label="Закрыть" title="Закрыть окно и вернуться к игровому столу" @click="$emit('close')"><SvgIcon name="close" /></button></div>
    <div id="modal-content"><slot /></div>
  </dialog>
</template>
