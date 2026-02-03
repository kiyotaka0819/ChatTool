<script setup>
import { ref } from 'vue'

const emit = defineEmits(['send'])
const newMessage = ref('')

const handleSend = () => {
  if (!newMessage.value.trim()) return
  emit('send', newMessage.value)
  newMessage.value = ''
}
</script>

<template>
  <div class="input-area">
    <textarea
      v-model="newMessage"
      @keydown.enter.exact.prevent="handleSend"
      placeholder="メッセージを入力... (Shift+Enterで改行)"
    ></textarea>
    <button @click="handleSend" :disabled="!newMessage.trim()">送信</button>
  </div>
</template>

<style scoped>
.input-area {
  padding: 20px;
  background: #252525;
  border-top: 1px solid #333;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
textarea {
  flex: 1;
  background: #333;
  border: 2px solid transparent;
  color: white;
  padding: 12px;
  border-radius: 15px;
  height: 60px;
  resize: none;
  outline: none;
  transition: 0.3s;
}
textarea:focus {
  border-color: #ff7eb3;
  box-shadow: 0 0 15px rgba(255, 126, 179, 0.2);
}
button {
  background: linear-gradient(135deg, #ff7eb3, #ff758c);
  color: white;
  width: 80px;
  height: 45px;
  border: none;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2);
}
button:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}
</style>
