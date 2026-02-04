<script setup>
import { ref } from 'vue'

const props = defineProps(['msg', 'currentUserName', 'allUsers'])
const emit = defineEmits([
  'delete',
  'update',
  'image-loaded',
  'reply'
])

const isEditing = ref(false)
const editContent = ref(props.msg.content)

const handleUpdate = () => {
  emit('update', props.msg.id, editContent.value)
  isEditing.value = false
}

const formatTime = (dateString) =>
  new Date(dateString).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  })

// 画像かどうかを判定する簡易的な関数
const isImage = (text) => {
  return (
    text.startsWith('http') &&
    (text.match(/\.(jpeg|jpg|gif|png|webp)$/i) ||
      text.includes('chat-attachments'))
  )
}
const scrollToBottom = () => {
  emit('image-loaded')
}

const extractImages = (content) => {
  if (!content) return []
  // SupabaseのURLを探す正規表現
  const urlRegex =
    /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
  return content.match(urlRegex) || []
}

// 画像URL以外のテキスト部分だけを返す
const renderText = (content) => {
  if (!content) return ''
  const urlRegex =
    /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
  // URL部分を空文字に置換して、残ったテキストをトリミング
  return content.replace(urlRegex, '').trim()
}

const renderContent = (content) => {
  if (!content) return ''
  const urlRegex = /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
  let text = content.replace(urlRegex, '').trim()

  const mentionRegex = /(@[^@\s\n]+)/g
  
  return text.replace(mentionRegex, (match) => {
    const userName = match.slice(1) // @を取る
    // その名前がルーム内に実在するかチェック
    if (props.allUsers.includes(userName)) {
      return `<span class="mention-tag">${match}</span>`
    }
    // いなければ、ただのテキストとして返す
    return match 
  })
}

</script>

<template>
  <div
    :class="[
      'msg-row',
      { 'is-mine': msg.user_name === currentUserName }
    ]"
  >
    <div class="bubble">
      <div class="meta">
        {{ msg.user_name }} •
        {{ formatTime(msg.created_at) }}
      </div>

      <div v-if="isEditing">
        <textarea
          v-model="editContent"
          class="edit-area"
        ></textarea>
        <div class="edit-actions">
          <button @click="handleUpdate" class="mini-save">
            保存
          </button>
          <button
            @click="isEditing = false"
            class="mini-cancel"
          >
            中止
          </button>
        </div>
      </div>

      <div v-else>


        <p v-if="renderContent(msg.content)" class="text" v-html="renderContent(msg.content)"></p>

        <div
          v-for="url in extractImages(msg.content)"
          :key="url"
        >
          <img
            :src="url"
            class="chat-image"
            @load="scrollToBottom"
          />
        </div>
      </div>
      <div class="actions">
        <template v-if="msg.user_name === currentUserName">
          <span @click="isEditing = true">編集</span>
          <span @click="$emit('delete', msg)">削除</span>
        </template>

        <template v-else>
          <span @click="$emit('reply', msg.user_name)"
            >返信</span
          >
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
input,
textarea,
select {
  font-size: 16px !important;
}
.msg-row {
  display: flex;
  width: 100%;
  margin-bottom: 15px;
}
.msg-row.is-mine {
  justify-content: flex-end;
}
.bubble {
  max-width: 75%;
  padding: 12px 18px;
  border-radius: 18px;
  background: #333;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  position: relative;
}
.is-mine .bubble {
  background: linear-gradient(135deg, #007aff, #0056b3);
  color: white;
  border-bottom-right-radius: 4px;
}
.msg-row:not(.is-mine) .bubble {
  border-bottom-left-radius: 4px;
}
.text {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 5px 0;
  line-height: 1.5;
}
.meta {
  font-size: 0.7rem;
  opacity: 0.6;
  margin-bottom: 4px;
}
.actions {
  font-size: 0.7rem;
  margin-top: 8px;
  display: flex;
  gap: 10px;
  opacity: 0;
  transition: 0.2s;
}
.bubble:hover .actions {
  opacity: 1;
}
.actions span {
  background: rgba(255, 255, 255, 0.1);
  padding: 3px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.edit-area {
  width: 100%;
  background: #444;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 5px;
}
.edit-actions {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}
.mini-save {
  background: #52c41a;
  color: white;
  font-size: 0.7rem;
  padding: 3px 10px;
}
.mini-cancel {
  background: #666;
  color: white;
  font-size: 0.7rem;
  padding: 3px 10px;
}
.chat-image {
  display: block;
  min-width: 50px; /* 読み込み前でも場所を確保 */
  min-height: 50px;
  background: #2a2a2a; /* 読み込み中だとわかるように背景色を付ける */
  max-width: 100%;
  border-radius: 8px;
}

:deep(.mention-tag) {
  color: #ffeb3b; /* 鮮やかな黄色 */
  font-weight: bold;
  background: rgba(255, 235, 59, 0.2);
  padding: 2px 4px;
  border-radius: 4px;
  text-shadow: 0 0 5px rgba(255, 235, 59, 0.5);
}

.mention-suggest {
  position: absolute;
  bottom: 100%; /* 入力欄の真上 */
  left: 20px;
  background: #333;
  border: 1px solid var(--accent);
  border-radius: 8px;
  max-height: 150px;
  overflow-y: auto;
  z-index: 100;
}
.suggest-item {
  padding: 8px 15px;
  cursor: pointer;
  transition: 0.2s;
}
.suggest-item:hover {
  background: var(--accent);
  color: white;
}
</style>
