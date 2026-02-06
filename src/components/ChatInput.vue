<script setup>
import { ref, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabaseClient'
import WhiteBoardModal from '../components/WhiteBoardModal.vue'

// --- Props & Emits ---
const props = defineProps(['replyTarget', 'allUsers'])
const emit = defineEmits([
  'send',
  'typing',
  'replyProcessed'
])

// --- 状態管理 ---
// 入力中のテキスト
const newMessage = ref('')
// 送信待機中の画像URL
const pendingImage = ref(null)
// ファイル入力要素の参照
const fileInput = ref(null)
// サジェストの表示フラグ
const showSuggest = ref(false)
// 絞り込まれたユーザーリスト
const filteredUsers = ref([])
// サジェスト選択中のインデックス
const selectedIndex = ref(0)
// ホワイトボードのオンオフ
const isShowWhiteboard = ref(false)
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

  // 半角@ または 全角＠ で始まるかチェック
  if (
    lastWord.startsWith('@') ||
    lastWord.startsWith('＠')
  ) {
    // 1文字目（@ or ＠）を削って検索ワードにする
    const query = lastWord.slice(1).toLowerCase()
    // 全ユーザーから部分一致で抽出（自分は除外しても良い）
    filteredUsers.value = props.allUsers.filter((u) =>
      u.toLowerCase().includes(query)
    )
    showSuggest.value = filteredUsers.value.length > 0
    // リストが変わるたびに選択をトップに戻す
    selectedIndex.value = 0
  } else {
    showSuggest.value = false
  }
})

// ユーザー選択確定時の処理
const selectUser = (name) => {
  const words = newMessage.value.split(/[\s\n]/)
  // 最後の単語が @か＠ で始まってたら、それを半角メンションに置換
  words[words.length - 1] = `@${name} `
  newMessage.value = words.join(' ')
  showSuggest.value = false
}

// キーボード操作（上下キー選択・決定）
const handleKeydown = (e) => {
  // 1. 日本語入力の確定（変換中）なら、送信もサジェスト操作もさせない
  if (e.isComposing) return

  // 2. メンションサジェスト表示中の処理
  if (showSuggest.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex.value =
        (selectedIndex.value + 1) %
        filteredUsers.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value =
        (selectedIndex.value -
          1 +
          filteredUsers.value.length) %
        filteredUsers.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault() // メンション確定
      selectUser(filteredUsers.value[selectedIndex.value])
      return
    }
    if (e.key === 'Escape') {
      showSuggest.value = false
      return
    }
  }

  // 3. 通常のEnter操作（送信 or 改行）
  if (e.key === 'Enter') {
    // Shift+Enter もしくは スマホ（画面幅が狭い）なら「改行」
    if (e.shiftKey || window.innerWidth <= 768) {
      // 標準の改行挙動に任せる
    } else {
      // PCでの単なるEnterは送信
      e.preventDefault()
      handleSend()
    }
  }
}

// --- 返信予約（外部からの呼び出し）の監視 ---
watch(
  () => props.replyTarget,
  (newVal) => {
    if (!newVal) return

    // 入力欄の中に、まだその名前が入ってない時だけ追加する
    if (!newMessage.value.includes(newVal)) {
      newMessage.value = newVal + newMessage.value
    }
    // 親の replyTarget をリセット
    emit('replyProcessed')
    nextTick(() => {
      const textarea = document.querySelector('textarea')
      textarea?.focus()
    })
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

/**
 * ホワイトボードから受け取った画像を送信
 */
const sendWhiteboardImage = async (blob) => {
  const fileName = `draw_${Date.now()}.png`
  const filePath = `chat-images/${fileName}`

  // 1. Storage にアップロード
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .upload(filePath, blob, { contentType: 'image/png' })

  if (error) {
    alert('アップロード失敗：' + error.message)
    return
  }

  // 2. 公開URLを取得
  const {
    data: { publicUrl }
  } = supabase.storage
    .from('chat-attachments')
    .getPublicUrl(filePath)

  // 3. 親（ChatApp）に送信を依頼！
  emit('send', publicUrl)

  // モーダルを閉じる
  isShowWhiteboard.value = false
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
      <div class="action-buttons">
        <button @click="fileInput.click()" class="file-btn">
          📷
        </button>
        <button
          @click="isShowWhiteboard = true"
          class="wb-open-btn"
        >
          🎨
        </button>
      </div>
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
        @keydown.enter="
          (e) => {
            // PC（キーボード接続）かつ Shiftを押してない時だけ送信
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.isComposing &&
              window.innerWidth > 768
            ) {
              e.preventDefault()
              handleSend()
            }
          }
        "
        maxlength="1000"
        placeholder="メッセージを入力...
Shift+Enterで改行"
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
    <WhiteBoardModal
      v-if="isShowWhiteboard"
      @close="isShowWhiteboard = false"
      @send="sendWhiteboardImage"
    />
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
  position: relative;
  padding: 10px 15px; /* 少しスリムに */
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ボタン群を縦に並べるコンテナ（HTML側も少し変える） */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  height: 76px;
  resize: none;
  outline: none;
  transition: 0.3s;
  line-height: 1.4;
}
textarea:focus {
  border-color: #ff7eb3;
  box-shadow: 0 0 15px rgba(255, 126, 179, 0.2);
}

button.send-btn {
  background: linear-gradient(135deg, #ff7eb3, #ff758c);
  color: white;
  width: 80px;
  height: 96px;
  border-radius: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s;
}
button.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-btn,
.wb-open-btn {
  background: #444 !important;
  /* サイズを明示的に強制 */
  width: 48px !important;
  min-width: 48px !important;
  height: 48px !important;
  min-height: 48px !important;

  border-radius: 10px !important;
  font-size: 1.1rem !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  margin: 0 !important;
}
</style>
