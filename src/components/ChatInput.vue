<script setup>
import { ref, watch } from 'vue'
import { supabase } from '../lib/supabaseClient'

// --- Props & Emits ---
const props = defineProps(['replyTarget', 'allUsers'])
const emit = defineEmits([
  'send',
  'typing',
  'replyProcessed'
])

// --- 状態管理 ---
const newMessage = ref('') // 入力中のテキスト
const pendingImage = ref(null) // 送信待機中の画像URL
const fileInput = ref(null) // ファイル入力要素の参照
const showSuggest = ref(false) // サジェストの表示フラグ
const filteredUsers = ref([]) // 絞り込まれたユーザーリスト
const selectedIndex = ref(0) // サジェスト選択中のインデックス

// --- 「入力中...」通知ロジック ---
let typingTimeout = null
watch(newMessage, (val) => {
  if (val.length > 0) {
    emit('typing', true)
    clearTimeout(typingTimeout)
    typingTimeout = setTimeout(
      () => emit('typing', false),
      10000
    )
  } else {
    emit('typing', false)
  }
})

// --- メンション・サジェストロジック ---
watch(newMessage, (val) => {
  const words = val.split(/[\s\n]/)
  const lastWord = words[words.length - 1]

  if (lastWord.startsWith('@')) {
    const query = lastWord.slice(1).toLowerCase()
    // 全ユーザーから部分一致で抽出（自分は除外しても良い）
    filteredUsers.value = props.allUsers.filter((u) =>
      u.toLowerCase().includes(query)
    )
    showSuggest.value = filteredUsers.value.length > 0
    selectedIndex.value = 0 // リストが変わるたびに選択をトップに戻す
  } else {
    showSuggest.value = false
  }
})

// ユーザー選択確定時の処理
const selectUser = (name) => {
  const words = newMessage.value.split(/[\s\n]/)
  words[words.length - 1] = `@${name} ` // 入力中の@キーワードを確定名に置換
  newMessage.value = words.join(' ')
  showSuggest.value = false
}

// キーボード操作（上下キー選択・決定）
const handleKeydown = (e) => {
  if (!showSuggest.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    // 下に移動
    selectedIndex.value =
      (selectedIndex.value + 1) % filteredUsers.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    // 上に移動
    selectedIndex.value =
      (selectedIndex.value -
        1 +
        filteredUsers.value.length) %
      filteredUsers.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    // 選択中のユーザーで確定
    selectUser(filteredUsers.value[selectedIndex.value])
  } else if (e.key === 'Escape') {
    // 閉じる
    showSuggest.value = false
  }
}

// --- 返信予約（外部からの呼び出し）の監視 ---
watch(
  () => props.replyTarget,
  (newVal) => {
    if (newVal) {
      newMessage.value = newVal
      emit('replyProcessed')
      const textarea = document.querySelector('textarea')
      textarea?.focus()
    }
  }
)

// --- 画像アップロード・送信処理 ---
const processUpload = async (file) => {
  if (!file || file.size > 3 * 1024 * 1024)
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

  pendingImage.value = publicUrl
}

const handleSend = () => {
  // サジェスト表示中は送信をガード（Enterキー重複防止）
  if (showSuggest.value) return
  if (!newMessage.value.trim() && !pendingImage.value)
    return

  const finalContent =
    pendingImage.value && newMessage.value.trim()
      ? `${newMessage.value}\n${pendingImage.value}`
      : pendingImage.value || newMessage.value

  emit('send', finalContent)
  newMessage.value = ''
  pendingImage.value = null
  emit('typing', false)
}

// 貼り付け時の画像処理
const handlePaste = async (event) => {
  const item = event.clipboardData.items[0]
  if (item?.type.indexOf('image') !== -1) {
    const file = item.getAsFile()
    await processUpload(file)
  }
}

// 選択画像のキャンセル（ストレージからも削除）
const clearImage = async () => {
  if (!pendingImage.value) return
  const filePath = pendingImage.value.split(
    '/chat-attachments/'
  )[1]
  if (filePath) {
    await supabase.storage
      .from('chat-attachments')
      .remove([filePath])
  }
  pendingImage.value = null
}

const handleFileChange = async (event) => {
  const file = event.target.files[0]
  if (file) await processUpload(file)
  event.target.value = ''
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

      <div v-if="showSuggest" class="mention-dropdown">
        <div
          v-for="(user, index) in filteredUsers"
          :key="user"
          @click="selectUser(user)"
          :class="[
            'suggest-item',
            { 'is-active': index === selectedIndex }
          ]"
        >
          <span class="at-mark">@</span>{{ user }}
        </div>
      </div>

      <textarea
        v-model="newMessage"
        @keydown="handleKeydown"
        @keydown.enter.exact.prevent="handleSend"
        maxlength="1000"
        placeholder="メッセージを入力..."
        @paste="handlePaste"
      ></textarea>

      <button
        @click="handleSend"
        :disabled="
          (!newMessage.trim() && !pendingImage) ||
          showSuggest
        "
        class="send-btn"
      >
        送信
      </button>
    </div>
  </div>
</template>

<style scoped>
/* モバイル対応：ズーム防止 */
input,
textarea {
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
  position: relative; /* サジェスト配置の基準 */
  padding: 20px;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

/* サジェストプルダウンのスタイル */
.mention-dropdown {
  position: absolute;
  bottom: calc(100% - 10px); /* 入力エリアの真上に浮く */
  left: 80px;
  width: 220px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 12px;
  box-shadow: 0 -5px 25px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  overflow: hidden;
}
.suggest-item {
  padding: 10px 15px;
  cursor: pointer;
  color: #eee;
  border-bottom: 1px solid #333;
  transition: 0.2s;
}
.suggest-item.is-active {
  background: #ff7eb3;
  color: white;
}
.at-mark {
  color: #ff7eb3;
  margin-right: 4px;
}
.is-active .at-mark {
  color: white;
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

button.send-btn {
  background: linear-gradient(135deg, #ff7eb3, #ff758c);
  color: white;
  width: 80px;
  height: 45px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
}
button.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-btn {
  background: #444;
  width: 50px;
  height: 45px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
