<script setup>
import { ref } from 'vue'

// 親から現在の名前を受け取り、決定したらイベントで返す
const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'confirm'])

const localName = ref(props.modelValue)

const handleConfirm = () => {
  if (!localName.value.trim()) return
  emit('update:modelValue', localName.value)
  emit('confirm')
}
</script>

<template>
  <div class="modal-overlay">
    <div class="name-modal">
      <h2>Welcome to Chat</h2>
      <p class="subtitle">あなたのお名前を教えてください</p>
      
      <input 
        v-model="localName" 
        @keyup.enter="handleConfirm" 
        placeholder="名前を入力..."
        autofocus
      />
      
      <button @click="handleConfirm" :disabled="!localName.trim()">
        チャットを開始する
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.name-modal {
  background: #1e1e1e;
  padding: 40px;
  border-radius: 24px;
  text-align: center;
  width: 320px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

h2 {
  margin-bottom: 8px;
  color: #fff;
}

.subtitle {
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 24px;
}

input {
  display: block;
  width: 100%;
  margin-bottom: 20px;
  padding: 12px;
  background: #333;
  border-radius: 12px;
  color: white;
  text-align: center;
  border: 2px solid transparent;
  outline: none;
  transition: border-color 0.3s;
}

input:focus {
  border-color: #667eea;
}

button {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;
}

button:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}

button:disabled {
  background: #444;
  box-shadow: none;
  cursor: not-allowed;
}
</style>