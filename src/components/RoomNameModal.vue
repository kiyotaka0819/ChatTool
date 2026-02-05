<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['modelValue'])
const emit = defineEmits([
  'update:modelValue',
  'close',
  'confirm'
])

const localRoomName = ref(props.modelValue)

// クリック開始位置を記憶する
const isMouseDownOutside = ref(false)

const handleMouseDown = (e) => {
  isMouseDownOutside.value =
    e.target.classList.contains('modal-overlay')
}

const handleMouseUp = (e) => {
  if (
    isMouseDownOutside.value &&
    e.target.classList.contains('modal-overlay')
  ) {
    emit('close')
  }
  isMouseDownOutside.value = false
}
// ---------------------------------------------

const submit = () => {
  if (!localRoomName.value.trim()) return
  emit('update:modelValue', localRoomName.value)
  emit('confirm')
}

const vFocus = {
  mounted: (el) => {
    el.focus()
    // 最初から全文選択状態
    el.select()
  }
}
</script>

<template>
  <div
    class="modal-overlay"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
  >
    <div class="modal-content">
      <h3>ルーム名の変更</h3>
      <input
        v-model="localRoomName"
        @keyup.enter="submit"
        @keyup.esc="$emit('close')"
        v-focus
        class="modal-input"
      />
      <div class="modal-actions">
        <button @click="$emit('close')" class="cancel-btn">
          キャンセル
        </button>
        <button @click="submit" class="confirm-btn">
          保存
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: #2a2a2a;
  padding: 24px;
  border-radius: 16px;
  min-width: 300px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.modal-input {
  width: 100%;
  padding: 10px;
  margin: 15px 0;
  background: #1a1a1a;
  border: 1px solid #444;
  color: white;
  border-radius: 8px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.confirm-btn {
  background: #4facfe;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}
.cancel-btn {
  background: #444;
  color: #ccc;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}
</style>
