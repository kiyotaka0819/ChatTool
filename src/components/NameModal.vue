<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['modelValue', 'initialTrip'])
const emit = defineEmits([
  'update:modelValue',
  'confirm',
  'close'
])

const localName = ref(props.modelValue || '')
const localPass = ref('')
const calculatedId = ref('')

// --- アウトクリック対策ロジック (RoomNameModal方式) ---
const isMouseDownOutside = ref(false)

const handleMouseDown = (e) => {
  // 押した瞬間のターゲットが overlay 自身かどうか
  isMouseDownOutside.value =
    e.target.classList.contains('modal-overlay')
}

const handleMouseUp = (e) => {
  // 押した時も離した時も overlay なら閉じる
  if (
    isMouseDownOutside.value &&
    e.target.classList.contains('modal-overlay')
  ) {
    emit('close')
  }
  isMouseDownOutside.value = false
}
// ---------------------------------------------

const generateTrip = (str) => {
  if (!str) return ''
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return (
    '◆ID:' +
    Math.abs(hash)
      .toString(36)
      .toUpperCase()
      .substring(0, 8)
  )
}

watch(localPass, (newVal) => {
  calculatedId.value = generateTrip(newVal)
})

const handleConfirm = () => {
  if (!localName.value.trim()) return
  emit('update:modelValue', localName.value)
  emit('confirm', {
    name: localName.value,
    trip: calculatedId.value
  })
}

// 自動フォーカス（RoomNameModalの真似）
const vFocus = {
  mounted: (el) => {
    el.focus()
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
    <div class="name-modal">
      <h2>Profile Setting</h2>
      <p class="subtitle">名前と合言葉を入力してください</p>

      <div class="input-group">
        <label>表示名</label>
        <input
          v-model="localName"
          v-focus
          placeholder="名前を入力..."
          @keyup.enter="handleConfirm"
        />
      </div>

      <div class="input-group">
        <label>合言葉 <small>(ID生成用)</small></label>
        <input
          v-model="localPass"
          type="password"
          placeholder="ID生成用のキーワード"
          @keyup.enter="handleConfirm"
        />
      </div>

      <div v-if="calculatedId" class="trip-preview-box">
        <span class="trip-label">生成されるID</span>
        <span class="trip-value">{{ calculatedId }}</span>
      </div>

      <div class="modal-actions">
        <button
          class="save-btn"
          @click="handleConfirm"
          :disabled="!localName.trim()"
        >
          設定を保存する
        </button>
        <button
          v-if="props.modelValue"
          @click="$emit('close')"
          class="cancel-link"
        >
          キャンセル
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
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.name-modal {
  background: #1e1e1e;
  padding: 30px;
  border-radius: 24px;
  width: 340px;
  border: 1px solid #333;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

h2 {
  margin-bottom: 5px;
  color: #fff;
}
.subtitle {
  font-size: 0.8rem;
  color: #888;
  margin-bottom: 20px;
}

.input-group {
  text-align: left;
  margin-bottom: 15px;
}

.input-group label {
  display: block;
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 5px;
  margin-left: 5px;
}

.input-group input {
  width: 100%;
  padding: 12px;
  background: #111;
  border: 1px solid #333;
  border-radius: 12px;
  color: white;
  outline: none;
}
.input-group input:focus {
  border-color: #4facfe;
}

.trip-preview-box {
  background: #111;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #222;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.trip-value {
  color: #4facfe;
  font-family: monospace;
  font-weight: bold;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.save-btn {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  width: 100%;
  padding: 14px;
  border-radius: 15px;
  font-weight: bold;
  color: white;
  border: none;
  cursor: pointer;
  transition: transform 0.2s;
}
.save-btn:hover:not(:disabled) {
  transform: translateY(-2px);
}
.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-link {
  background: transparent;
  border: none;
  color: #666;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
}
.cancel-link:hover{
    color: #c30606de;
}

.name-modal {
  width: 90%; 
  max-width: 340px;
  -webkit-tap-highlight-color: transparent;
}

.input-group input {
  font-size: 16px !important;
  padding: 14px;
}
</style>
