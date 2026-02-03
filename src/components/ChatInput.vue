<script setup>
import { ref, watch } from 'vue'
import { supabase } from '../lib/supabaseClient'

const emit = defineEmits(['send', 'typing'])
const newMessage = ref('')

// --- 「入力中...」のロジック ---
let typingTimeout = null

watch(newMessage, (val) => {
  // 文字が入ってるときだけ「入力中」にする
  if (val.length > 0) {
    emit('typing', true)
    
    // 3秒間入力が止まったら「停止」を送る
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => {
      emit('typing', false)
    }, 3000)
  } else {
    emit('typing', false)
  }
})

const handleSend = () => {
  if (!newMessage.value.trim()) return
  emit('send', newMessage.value)
  newMessage.value = ''
  emit('typing', false) // 送信したら入力中を解除
}

const handlePaste = async (event) => {
  const item = event.clipboardData.items[0]
  if (item?.type.indexOf('image') !== -1) {
    const file = item.getAsFile()
    if (!file) return

    // 前に話したサイズリミット（2MB）
    if (file.size > 2 * 1024 * 1024) {
      alert('3MB以下の画像にしてください')
      return
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `chat-images/${fileName}`

    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file)

    if (error) {
      alert('画像アップ失敗：' + error.message)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(filePath)

    emit('send', publicUrl)
  }
}
</script>

<template>
  <div class="input-area">
    <textarea
      v-model="newMessage"
      @keydown.enter.exact.prevent="handleSend"
      placeholder="メッセージを入力... (Shift+Enterで改行)"
      @paste="handlePaste"
    ></textarea>
    <button
      @click="handleSend"
      :disabled="!newMessage.trim()"
    >
      送信
    </button>
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
