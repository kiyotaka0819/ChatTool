<script setup>
import { computed, ref, onBeforeUnmount, watch } from 'vue'
import config from '../lib/consts.json'
import { supabase } from '../lib/supabaseClient'
import {
  extractImages,
  renderMessageHtml
} from '../utils/messageFormatter'

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
const isCollapsed = ref(true)
// どのスタンプの名前を表示するか保持する（nullなら何も出さない）
const activeEmojiForNames = ref(null)
const vFocus = { mounted: (el) => el.focus() }

// --- 外側クリックでメニューや名前を閉じる ---
const closeAllPopups = () => {
  showEmojiMenu.value = false
  activeEmojiForNames.value = null
}

watch(
  [showEmojiMenu, activeEmojiForNames],
  ([newMenu, newNames]) => {
    if (newMenu || newNames) {
      setTimeout(() => {
        document.addEventListener('click', closeAllPopups)
      }, 0)
    } else {
      document.removeEventListener('click', closeAllPopups)
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('click', closeAllPopups)
})

const imageUrls = computed(() =>
  extractImages(props.msg.content)
)
const toggleImage = () => {
  isCollapsed.value = !isCollapsed.value
}
const formattedHtml = computed(() =>
  renderMessageHtml(props.msg.content, props.allUsers)
)
const formattedTime = computed(() =>
  new Date(props.msg.created_at).toLocaleTimeString(
    'ja-JP',
    { hour: '2-digit', minute: '2-digit' }
  )
)

const groupedReactions = computed(() => {
  const relevant = (props.reactions || []).filter(
    (r) => r.message_id === props.msg.id
  )
  const groups = {}
  relevant.forEach((r) => {
    if (!groups[r.emoji]) groups[r.emoji] = []
    if (!groups[r.emoji].includes(r.user_name))
      groups[r.emoji].push(r.user_name)
  })
  return groups
})

// 名前表示の切り替え
const toggleNameDisplay = (emoji) => {
  activeEmojiForNames.value =
    activeEmojiForNames.value === emoji ? null : emoji
}

const handleUpdate = () => {
  if (!editContent.value.trim()) return
  emit('update', props.msg.id, editContent.value)
  isEditing.value = false
}

const onKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleUpdate()
  }
}

const addReaction = async (emoji) => {
  const existing = (props.reactions || []).find(
    (r) =>
      r.message_id === props.msg.id &&
      r.user_name === props.currentUserName &&
      r.emoji === emoji
  )
  if (existing) {
    await supabase
      .from('reactions')
      .delete()
      .eq('id', existing.id)
  } else {
    await supabase.from('reactions').insert([
      {
        message_id: props.msg.id,
        user_name: props.currentUserName,
        emoji
      }
    ])
  }
  showEmojiMenu.value = false
}

const isEdited = computed(
  () => props.msg.is_edited === true
)
const formattedUpdatedTime = computed(() => {
  if (!props.msg.updated_at) return ''
  return new Date(props.msg.updated_at).toLocaleTimeString(
    'ja-JP',
    { hour: '2-digit', minute: '2-digit' }
  )
})
</script>

<template>
  <div
    :class="[
      'msg-row',
      { 'is-mine': msg.user_name === currentUserName }
    ]"
  >
    <div
      :class="[
        'bubble',
        { 'is-editing-active': isEditing }
      ]"
    >
      <div class="meta">
        <span class="name-box">
          <strong class="display-name">{{
            msg.user_name
          }}</strong>
          <span v-if="msg.trip_id" class="trip-id">{{
            msg.trip_id
          }}</span>
        </span>
        <div class="time-box">
          <small class="time">{{ formattedTime }}</small>
          <span
            v-if="isEdited"
            class="edited-label"
            :title="'編集時刻: ' + formattedUpdatedTime"
          >
            (編集済 {{ formattedUpdatedTime }})
          </span>
        </div>
      </div>

      <div v-if="!isEditing" class="content-body">
        <p
          v-if="formattedHtml"
          class="text"
          v-html="formattedHtml"
        ></p>
        <div
          v-for="url in imageUrls"
          :key="url"
          class="chat-image-container"
          @click.stop="toggleImage"
        >
          <img
            :src="url"
            :class="[
              'chat-image',
              { collapsed: isCollapsed }
            ]"
            @load="$emit('image-loaded')"
          />
          <div class="zoom-hint">
            <span>{{
              isCollapsed ? '🔍 拡大' : '👆 縮小'
            }}</span>
          </div>
        </div>
      </div>

      <div v-else class="edit-mode-container">
        <textarea
          v-model="editContent"
          class="edit-area"
          v-focus
          @keydown="onKeydown"
          placeholder="メッセージを編集..."
        ></textarea>
        <div class="keyHint-under">
          Enter で保存 / Shift + Enter で改行
        </div>
      </div>

      <div
        class="reactions-container"
        v-if="Object.keys(groupedReactions).length > 0"
      >
        <div
          v-for="(users, emoji) in groupedReactions"
          :key="emoji"
          class="reaction-unit"
        >
          <div
            class="reaction-badge"
            :class="{
              'is-active': users.includes(currentUserName)
            }"
            @click.stop="toggleNameDisplay(emoji)"
          >
            {{ emoji }}
            <span class="count">{{ users.length }}</span>
          </div>

          <Transition name="fade-slide">
            <div
              v-if="activeEmojiForNames === emoji"
              class="reaction-user-names-bubble"
            >
              {{ users.join(', ') }}
            </div>
          </Transition>
        </div>
      </div>

      <div class="actions-overlay">
        <div v-if="!isEditing" class="actions-inner">
          <span
            @click.stop="showEmojiMenu = !showEmojiMenu"
            class="action-btn"
            title="リアクション"
            >☺+</span
          >
          <template
            v-if="msg.user_name === currentUserName"
          >
            <span
              @click="isEditing = true"
              class="action-btn"
              >✏️ 編集</span
            >
            <span
              @click="$emit('delete', msg)"
              class="action-btn delete-btn-trigger"
              >🗑️ 削除</span
            >
          </template>
          <template v-else>
            <span
              @click="$emit('reply', msg.user_name)"
              class="action-btn"
              >💬 返信</span
            >
          </template>
        </div>

        <div v-else class="actions-inner">
          <span
            @click="handleUpdate"
            class="action-btn save-action"
            >✅ 保存</span
          >
          <span
            @click="isEditing = false"
            class="action-btn"
            >❌ 取消</span
          >
        </div>
      </div>

      <div
        v-if="showEmojiMenu"
        class="floating-emoji-picker"
        @click.stop
      >
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
/* --- 基本レイアウト --- */
.msg-row {
  display: flex;
  width: 100%;
  margin-bottom: 24px;
  z-index: 1;
  position: relative;
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
  transition: all 0.2s;
  z-index: 1;
  color: #fff;
}
.is-mine .bubble {
  background: linear-gradient(135deg, #007aff, #0056b3);
  border-bottom-right-radius: 4px;
}
.msg-row:not(.is-mine) .bubble {
  border-bottom-left-radius: 4px;
}
.bubble::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: inherit;
  border-radius: inherit;
  z-index: -1;
  transition: bottom 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.bubble:hover::after,
.bubble.is-editing-active::after {
  bottom: -32px;
}
.bubble.is-editing-active {
  max-width: 95%;
  width: 100%;
  background: #007aff;
}

/* --- メタ情報 --- */
.meta {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
}
.display-name {
  font-size: 0.9rem;
  font-weight: 700;
}
.trip-id {
  font-size: 0.7rem;
  font-weight: 800;
  color: #4facfe;
  background: rgba(79, 172, 254, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.time {
  font-size: 0.7rem;
  opacity: 0.5;
}
.edited-label {
  font-size: 0.6rem;
  font-style: italic;
  opacity: 0.5;
}

/* --- 本文 --- */
.text {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 5px 0;
  line-height: 1.5;
}
.chat-image {
  display: block;
  max-width: 600px;
  border-radius: 12px;
  transition: 0.3s;
  background: #2a2a2a;
}
.chat-image.collapsed {
  max-height: 70px;
  object-fit: cover;
  object-position: top;
  mask-image: linear-gradient(
    to bottom,
    black 70%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    black 70%,
    transparent 100%
  );
}

/* --- 編集モード --- */
.edit-area {
  width: 100%;
  min-height: 100px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px;
  outline: none;
  resize: vertical;
}
.keyHint-under {
  display: flex;
  justify-content: flex-end;
  font-size: 0.6rem;
  opacity: 0.6;
  margin-top: 6px;
}

/* --- アクションボタン --- */
.actions-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 32px;
  opacity: 0;
  display: flex;
  align-items: center;
  padding: 0 18px;
  transition: 0.25s;
  pointer-events: none;
  z-index: 3;
}
.bubble:hover .actions-overlay,
.bubble.is-editing-active .actions-overlay {
  bottom: -22px;
  opacity: 1;
  pointer-events: auto;
}
.actions-inner {
  display: flex;
  gap: 12px;
  width: 100%;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 8px;
  justify-content: flex-start;
}
.bubble.is-editing-active .actions-inner {
  justify-content: flex-end;
}
.action-btn {
  font-size: 0.65rem;
  font-weight: bold;
  cursor: pointer;
  color: #ccc;
}
.action-btn:hover {
  color: white;
}

/* --- リアクションエリア --- */
.reactions-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  position: relative;
}
.bubble.is-editing-active .reactions-container {
  justify-content: flex-end;
}

.reaction-unit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.reaction-badge {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 2px 8px;
  font-size: 0.8rem;
}
.reaction-badge:hover {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #4facfe;
  border-color: #4facfe;
}
.reaction-badge.is-active {
  border-color: #ffeb3b;
}

.reaction-badge.is-active:hover {
  border-color: #ffeb3b;
}
/* 名前表示の吹き出しスタイル */
.reaction-user-names-bubble {
  position: absolute;
  top: 110%;
  left: 50%;
  transform: translateX(-50%);
  background: #222;
  color: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.65rem;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  border: 1px solid #444;
  isolation: isolate;
  z-index: 10;
}

/* アニメーション */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.2s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-5px);
}

/* --- 絵文字ピッカー --- */
.floating-emoji-picker {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  background: #2a2a2a;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #444;
  z-index: 100;
}
.is-mine .floating-emoji-picker {
  left: auto;
  right: 0;
}
.emoji-option {
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.emoji-option:hover {
  background-color: #4facfe;
  outline: 1px solid #444;
}
.emoji-option.is-selected {
  outline: 1px solid #ffeb3b;
}
.emoji-option.is-selected:hover {
  background-color: #4facfe;
  outline: 2px solid #ffeb3b;
}
@media (hover: none) {
  .bubble::after {
    bottom: -32px;
  }
  .actions-overlay {
    bottom: -22px;
    opacity: 1;
    pointer-events: auto;
  }
}
.msg-row:focus-within,
.msg-row:hover {
  z-index: 10;
}

.text :deep(.mention-tag) {
  color: #ffeb3b !important;
  font-weight: bold;
  background: rgba(255, 235, 59, 0.2);
  padding: 0 4px;
  border-radius: 4px;
  display: inline-block;
}

.text :deep(.chat-link) {
  color: #4facfe;
  text-decoration: underline;
}
</style>
