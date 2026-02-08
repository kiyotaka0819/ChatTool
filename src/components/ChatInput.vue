<script setup>
import { ref, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabaseClient'
import WhiteBoardModal from '../components/WhiteBoardModal.vue'

const props = defineProps(['replyTarget', 'allUsers'])
const emit = defineEmits(['send', 'typing', 'replyProcessed'])

const newMessage = ref('')
const pendingImage = ref(null)
const fileInput = ref(null) // ファイル入力用のref（テンプレートで使用）
const showSuggest = ref(false)
const filteredUsers = ref([])
const selectedIndex = ref(0)
const isShowWhiteboard = ref(false)

// 入力中通知
let typingTimeout = null
watch(newMessage, (val) => {
  if (val.length > 0) {
    emit('typing', true)
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(() => emit('typing', false), 10000)
  } else {
    emit('typing', false)
  }
})

// メンションサジェスト
watch(newMessage, (val) => {
  const words = val.split(/[\s\n]/)
  const lastWord = words[words.length - 1]
  if (lastWord.startsWith('@') || lastWord.startsWith('＠')) {
    const query = lastWord.slice(1).toLowerCase()
    filteredUsers.value = props.allUsers.filter((u) => u.toLowerCase().includes(query))
    showSuggest.value = filteredUsers.value.length > 0
    selectedIndex.value = 0
  } else {
    showSuggest.value = false
  }
})

const selectUser = (name) => {
  const words = newMessage.value.split(/[\s\n]/)
  words[words.length - 1] = `@${name} `
  newMessage.value = words.join(' ')
  showSuggest.value = false
}

const handleKeydown = (e) => {
  if (e.isComposing) return

  if (showSuggest.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % filteredUsers.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value = (selectedIndex.value - 1 + filteredUsers.value.length) % filteredUsers.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectUser(filteredUsers.value[selectedIndex.value])
      return
    }
    if (e.key === 'Escape') {
      showSuggest.value = false
      return
    }
  }

  if (e.key === 'Enter') {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    if (e.shiftKey || isMobile) {
    } else {
      e.preventDefault()
      handleSend()
    }
  }
}

watch(() => props.replyTarget, (newVal) => {
  if (!newVal) return
  if (!newMessage.value.includes(newVal)) {
    newMessage.value = newVal + newMessage.value
  }
  emit('replyProcessed')
  nextTick(() => {
    const textarea = document.querySelector('textarea')
    textarea?.focus()
  })
})

const processUpload = async (file) => {
  if (!file || file.size > 3 * 1024 * 1024) return alert('3MB以下にしてください')
  const fileName = `${Math.random()}.${file.name.split('.').pop()}`
  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(`chat-images/${fileName}`, file)

  if (error) return alert('アップ失敗：' + error.message)

  const { data: { publicUrl } } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(`chat-images/${fileName}`)
  pendingImage.value = publicUrl
}

const handleSend = () => {
  if (showSuggest.value) return
  if (!newMessage.value.trim() && !pendingImage.value) return

  const finalContent = pendingImage.value && newMessage.value.trim()
    ? `${newMessage.value}\n${pendingImage.value}`
    : pendingImage.value || newMessage.value

  emit('send', finalContent)
  newMessage.value = ''
  pendingImage.value = null
  emit('typing', false)
}

const handlePaste = async (event) => {
  const item = event.clipboardData.items[0]
  if (item?.type.indexOf('image') !== -1) {
    const file = item.getAsFile()
    await processUpload(file)
  }
}

const clearImage = async () => {
  if (!pendingImage.value) return
  const filePath = pendingImage.value.split('/chat-attachments/')[1]
  if (filePath) await supabase.storage.from('chat-attachments').remove([filePath])
  pendingImage.value = null
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (file) await processUpload(file)
  event.target.value = ''
}

const sendWhiteboardImage = async (blob) => {
  const fileName = `draw_${Date.now()}.png`
  const filePath = `chat-images/${fileName}`
  const { error } = await supabase.storage.from('chat-attachments').upload(filePath, blob, { contentType: 'image/png' })
  if (error) return alert('アップロード失敗：' + error.message)
  const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath)
  emit('send', publicUrl)
  isShowWhiteboard.value = false
}
</script>

<template>
  <div class="input-container">
    <div v-if="pendingImage" class="image-preview">
      <img :src="pendingImage" />
      <button @click="clearImage" class="clear-btn">×</button>
    </div>

    <div class="input-area">
      <div class="action-buttons">
        <input type="file" ref="fileInput" style="display: none" @change="handleFileChange" accept="image/*" />
        <button @click="fileInput.click()" class="file-btn">📷</button>
        <button @click="isShowWhiteboard = true" class="wb-open-btn">🎨</button>
      </div>

      <div v-if="showSuggest" class="mention-dropdown">
        <div v-for="(user, index) in filteredUsers" :key="user" @click="selectUser(user)"
          :class="['suggest-item', { 'is-active': index === selectedIndex }]">
          <span class="at-mark">@</span>{{ user }}
        </div>
      </div>

      <textarea v-model="newMessage" @keydown="handleKeydown" maxlength="1000"
        placeholder="メッセージを入力...&#10;Shift+Enterで改行" @paste="handlePaste"></textarea>

      <button @click="handleSend" :disabled="(!newMessage.trim() && !pendingImage) || showSuggest" class="send-btn">送信</button>
    </div>
    <WhiteBoardModal v-if="isShowWhiteboard" @close="isShowWhiteboard = false" @send="sendWhiteboardImage" />
  </div>
</template>

<style scoped>
input, textarea { font-size: 16px !important; }
.input-container { display: flex; flex-direction: column; background: #252525; border-top: 1px solid #333; }
.image-preview { padding: 10px 20px; position: relative; }
.image-preview img { max-height: 100px; border-radius: 8px; border: 2px solid #ff7eb3; }
.clear-btn { position: absolute; top: 5px; left: 105px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 20px; height: 20px; border: none; cursor: pointer; }
.input-area { position: relative; padding: 10px 15px; display: flex; gap: 8px; align-items: center; }
.action-buttons { display: flex; flex-direction: column; gap: 4px; }
.mention-dropdown { position: absolute; bottom: calc(100% - 10px); left: 80px; width: 220px; background: #2a2a2a; border: 1px solid #444; border-radius: 12px; z-index: 1000; overflow: hidden; }
.suggest-item { padding: 10px 15px; cursor: pointer; color: #eee; border-bottom: 1px solid #333; }
.suggest-item.is-active { background: #ff7eb3; color: white; }
.at-mark { color: #ff7eb3; margin-right: 4px; }
textarea { flex: 1; background: #333; border: 2px solid transparent; color: white; padding: 12px; border-radius: 15px; height: 76px; resize: none; outline: none; line-height: 1.4; }
textarea:focus { border-color: #ff7eb3; }
button.send-btn { background: linear-gradient(135deg, #ff7eb3, #ff758c); color: white; width: 80px; height: 96px; border-radius: 15px; font-weight: bold; cursor: pointer; }
button.send-btn:disabled { opacity: 0.5; }
.file-btn, .wb-open-btn { background: #444 !important; width: 48px !important; height: 48px !important; border-radius: 10px !important; display: flex; align-items: center; justify-content: center; }
</style>