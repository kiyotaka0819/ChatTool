<script setup>
import { ref, watch } from 'vue'
import { supabase } from '../lib/supabaseClient'

const emit = defineEmits([
  'send',
  'typing',
  'replyProcessed'
])
const newMessage = ref('')
const pendingImage = ref(null)
const fileInput = ref(null)
const props = defineProps(['replyTarget', 'allUsers'])
const showSuggest = ref(false)
const filteredUsers = ref([])

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

watch(newMessage, (val) => {
  const lastChar = val.slice(-1)
  const words = val.split(/[\s\n]/)
  const lastWord = words[words.length - 1]

  if (lastWord.startsWith('@')) {
    const query = lastWord.slice(1).toLowerCase()
    // ルーム内のユーザーから絞り込み
    filteredUsers.value = props.allUsers.filter((u) =>
      u.toLowerCase().includes(query)
    )
    showSuggest.value = filteredUsers.value.length > 0
  } else {
    showSuggest.value = false
  }
})

const selectUser = (name) => {
  const words = newMessage.value.split(/[\s\n]/)
  words[words.length - 1] = `@${name} ` // 最後の一語を置き換え
  newMessage.value = words.join(' ')
  showSuggest.value = false
}

// watchで「返信予約」が飛んできたら入力欄にセット
watch(
  () => props.replyTarget,
  (newVal) => {
    if (newVal) {
      newMessage.value = newVal + newMessage.value
      // セットしたことを親に伝えてクリアしてもらう（ループ防止）
      emit('replyProcessed')

      // ついでにtextareaにフォーカスを当てて、スマホのキーボードを出す
      const textarea = document.querySelector('textarea')
      textarea?.focus()
    }
  }
)

// --- 共通のアップロード処理 ---
const processUpload = async (file) => {
  if (!file) return
  if (file.size > 2 * 1024 * 1024)
    return alert('3MB以下にしてください')

  // ファイル名をランダム生成
  const fileName = `${Math.random()}.${file.name.split('.').pop()}`
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .upload(`chat-images/${fileName}`, file)

  if (error) return alert('アップ失敗：' + error.message)

  const {
    data: { publicUrl }
  } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(`chat-images/${fileName}`)

  // プレビューに入れる
  pendingImage.value = publicUrl
}

const handleSend = () => {
  // 画像もテキストも空なら何もしない
  if (!newMessage.value.trim() && !pendingImage.value)
    return
  // メッセージを組み立てる
  const content = pendingImage.value || newMessage.value
  // もしテキストも画像も両方あるなら、合体させて送る
  const finalContent =
    pendingImage.value && newMessage.value.trim()
      ? `${newMessage.value}\n${pendingImage.value}`
      : content
  emit('send', finalContent)
  // 送信後は全部空にする
  newMessage.value = ''
  pendingImage.value = null
  emit('typing', false)
}

// ペースト時は「保存」だけする
const handlePaste = async (event) => {
  const item = event.clipboardData.items[0]
  if (item?.type.indexOf('image') !== -1) {
    const file = item.getAsFile()
    if (!file || file.size > 2 * 1024 * 1024)
      return alert('3MB以下にしてください')

    const fileName = `${Math.random()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(`chat-images/${fileName}`, file)

    if (error) return alert('アップ失敗：' + error.message)

    const {
      data: { publicUrl }
    } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(`chat-images/${fileName}`)

    // 即送信せず、プレビューに入れる
    pendingImage.value = publicUrl
  }
}

const clearImage = async () => {
  if (!pendingImage.value) return

  // 1. URLからストレージ内のパスを抜き出す
  // 例: https://.../chat-attachments/chat-images/0.123.png -> chat-images/0.123.png
  const filePath = pendingImage.value.split(
    '/chat-attachments/'
  )[1]

  if (filePath) {
    const { error } = await supabase.storage
      .from('chat-attachments')
      .remove([filePath])

    if (error) {
      console.error(
        'キャンセル時のストレージ削除失敗:',
        error.message
      )
    }
  }

  // 2. プレビューを消す
  pendingImage.value = null
}

// --- スマホ等のファイル選択時の処理 ---
const handleFileChange = async (event) => {
  const file = event.target.files[0] // ← event.target.target になってたのを修正
  if (file) {
    await processUpload(file)
  }
  event.target.value = '' // 同じファイルを連続で選べるようにリセット
}
</script>

<template>
  <div class="input-container">
    <div v-if="pendingImage" class="image-preview">
      <img :src="pendingImage" />
      <button @click="clearImage" class="clear-btn">
        ×
      </button>
    </div>

    <div class="input-area">
      <input
        type="file"
        ref="fileInput"
        accept="image/*"
        style="display: none"
        @change="handleFileChange"
      />

      <button @click="fileInput.click()" class="file-btn">
        📷
      </button>

      <div v-if="showSuggest" class="mention-suggest">
        <div
          v-for="user in filteredUsers"
          :key="user"
          @click="selectUser(user)"
          class="suggest-item"
        >
          @{{ user }}
        </div>
      </div>

      <textarea
        v-model="newMessage"
        @keydown.enter.exact.prevent="handleSend"
        maxlength="1000"
        placeholder="メッセージを入力..."
        @paste="handlePaste"
      ></textarea>

      <button
        @click="handleSend"
        :disabled="!newMessage.trim() && !pendingImage"
        class="send-btn"
      >
        送信
      </button>
    </div>
  </div>
</template>

<style scoped>
input,
textarea,
select {
  font-size: 16px !important;
}
.input-container {
  display: flex;
  flex-direction: column;
  background: #252525;
  border-top: 1px solid #333;
}
.image-preview {
  padding: 10px 20px;
  position: relative;
  display: inline-block;
}
.image-preview img {
  max-height: 100px;
  border-radius: 8px;
  border: 2px solid #ff7eb3;
}
.clear-btn {
  position: absolute;
  top: 5px;
  left: 105px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  border: none;
  cursor: pointer;
}
.input-area {
  position: relative;
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
.file-btn {
  background: #444;
  width: 50px;
  height: 45px;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
