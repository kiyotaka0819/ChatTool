<script setup>
import { ref } from 'vue'

const props = defineProps(['msg', 'currentUserName'])
const emit = defineEmits([
  'delete',
  'update',
  'image-loaded'
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
        <p v-if="renderText(msg.content)" class="text">
          {{ renderText(msg.content) }}
        </p>

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
      <div
        v-if="
          msg.user_name === currentUserName && !isEditing
        "
        class="actions"
      >
        <span @click="isEditing = true">編集</span>
        <span @click="$emit('delete', msg)">削除</span>
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
</style>
