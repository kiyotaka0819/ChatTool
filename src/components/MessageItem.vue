<script setup>
import { computed, ref } from 'vue'
import config from '../lib/consts.json'
import { supabase } from '../lib/supabaseClient'
const props = defineProps([
  'msg',
  'currentUserName',
  'allUsers',
  'reactions'
])
const emit = defineEmits([
  'delete',
  'update',
  'image-loaded',
  'reply'
])

const showEmojiMenu = ref(false)
const isEditing = ref(false)
const editContent = ref(props.msg.content)
const activeEmoji = ref(null)

const toggleNames = (emoji) => {
  // 同じ絵文字を叩いたら閉じる、違うの叩いたら切り替え
  activeEmoji.value =
    activeEmoji.value === emoji ? null : emoji
}

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
  const urlRegex =
    /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
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

// このメッセージに紐づくリアクションを整理
const messageReactions = computed(() => {
  const list = (props.reactions || []).filter(
    (r) => r.message_id === props.msg.id
  )
  const counts = {}
  list.forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1
  })
  return counts
})

// リアクション追加関数
// リアクション追加・取り消し関数
const addReaction = async (emoji) => {
  // すでに自分がこのメッセージに、この絵文字でリアクションしてるか探す
  const existingReaction = (props.reactions || []).find(
    (r) =>
      r.message_id === props.msg.id &&
      r.user_name === props.currentUserName &&
      r.emoji === emoji
  )

  if (existingReaction) {
    console.log('Removing reaction:', existingReaction.id)
    const { error } = await supabase
      .from('reactions')
      .delete()
      .eq('id', existingReaction.id)

    if (error) {
      console.error('Reaction Delete Error:', error.message)
      alert('リアクション削除失敗: ' + error.message)
    }
  } else {
    console.log('Adding reaction:', emoji)
    const { error } = await supabase
      .from('reactions')
      .insert([
        {
          message_id: props.msg.id,
          user_name: props.currentUserName,
          emoji: emoji
        }
      ])

    if (error) {
      console.error('Reaction Insert Error:', error.message)
      alert('リアクション失敗: ' + error.message)
    }
  }

  showEmojiMenu.value = false
}

// このメッセージに付いたリアクションだけを抽出し、絵文字ごとに名前をまとめる
const groupedReactions = computed(() => {
  const relevant = props.reactions.filter(
    (r) => r.message_id === props.msg.id
  )
  const groups = {}

  relevant.forEach((r) => {
    if (!groups[r.emoji]) {
      groups[r.emoji] = []
    }
    // その絵文字にまだ名前が入ってなければ追加
    if (!groups[r.emoji].includes(r.user_name)) {
      groups[r.emoji].push(r.user_name)
    }
  })

  return groups
})
</script>

<template>
  <div
    :class="[
      'msg-row',
      { 'is-mine': msg.user_name === currentUserName }
    ]"
    @click="activeEmoji = null"
  >
    <div class="bubble">
      <div v-if="!isEditing">
        <p
          v-if="renderContent(msg.content)"
          class="text"
          v-html="renderContent(msg.content)"
        ></p>
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

      <div class="reactions-container">
        <div
          v-for="(users, emoji) in groupedReactions"
          :key="emoji"
          class="reaction-wrapper"
        >
          <span
            class="reaction-badge"
            :class="{
              'is-active': users.includes(currentUserName)
            }"
            :title="users.join(', ')"
            @click.stop="toggleNames(emoji)"
          >
            {{ emoji }} {{ users.length }}
          </span>

          <div
            v-if="activeEmoji === emoji"
            class="name-list-popup"
          >
            {{ users.join(', ') }}
          </div>
        </div>
      </div>

      <div class="actions">
        <span
          @click="showEmojiMenu = !showEmojiMenu"
          class="action-btn"
          >＋☺</span
        >

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
      <div v-if="showEmojiMenu" class="mini-emoji-picker">
        <span
          v-for="e in config.QUICK_REACTIONS"
          :key="e"
          @click="addReaction(e)"
          class="emoji-option"
          :class="{
            'is-selected':
              groupedReactions[e]?.includes(currentUserName)
          }"
        >
          {{ e }}
        </span>
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
.mini-emoji-picker {
  cursor: pointer;
}
.reaction-badge {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #444;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.8rem;
  transition: 0.2s;
}

.reaction-badge:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--accent);
}
.reaction-wrapper {
  position: relative; /* ポップアップの基準点 */
  display: inline-block;
}

.name-list-popup {
  position: absolute;
  bottom: 120%; /* バッジの上に表示 */
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #fff;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  white-space: nowrap; /* 改行させない */
  z-index: 100;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--accent);
}

/* 吹き出しの三角部分 */
.name-list-popup::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: var(--accent) transparent transparent
    transparent;
}

.reaction-badge.is-active {
  background: rgba(
    255,
    235,
    59,
    0.2
  ); /* ちょっと黄色っぽく浮かせる */
  border-color: #ffeb3b;
  color: #ffeb3b;
}

.emoji-option {
  padding: 5px;
  cursor: pointer;
  border-radius: 4px;
  border: 1px solid transparent; /* ガタつき防止 */
  transition: 0.2s;
}

.emoji-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* 自分が選択済みの絵文字スタイル */
.emoji-option.is-selected {
  background: rgba(255, 235, 59, 0.15);
  border-color: #ffeb3b;
}
</style>
