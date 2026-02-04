<script setup>
import { computed, ref } from 'vue'
import config from '../lib/consts.json'
import { supabase } from '../lib/supabaseClient'
import { extractImages, renderMessageHtml } from '../utils/messageFormatter'

/**
 * @typedef {Object} Props
 * @property {Object} msg - メッセージ本体（id, content, user_name, created_atなど）
 * @property {string} currentUserName - ログイン中のユーザー名
 * @property {Array<string>} allUsers - ルーム内の全ユーザー（メンション判定用）
 * @property {Array<Object>} reactions - 全メッセージに紐づくリアクションの平坦な配列
 */
const props = defineProps(['msg', 'currentUserName', 'allUsers', 'reactions'])

/**
 * @typedef {Object} Emits
 * @property {Function} delete - メッセージ削除時
 * @property {Function} update - メッセージ更新（編集）時
 * @property {Function} image-loaded - 画像読み込み完了時（スクロール調整用）
 * @property {Function} reply - 返信ボタンクリック時（入力欄にユーザー名セット用）
 */
const emit = defineEmits(['delete', 'update', 'image-loaded', 'reply'])

// --- 状態管理 (Internal State) ---

/** @type {import('vue').Ref<boolean>} 絵文字選択メニューの表示フラグ */
const showEmojiMenu = ref(false)

/** @type {import('vue').Ref<boolean>} メッセージ編集モードの切り替えフラグ */
const isEditing = ref(false)

/** @type {import('vue').Ref<string>} 編集中のメッセージ本文 */
const editContent = ref(props.msg.content)

/** @type {import('vue').Ref<string|null>} 現在リアクションしたユーザーリストを表示している絵文字 */
const activeEmoji = ref(null)

// --- 表示用データ（Computed Properties） ---

/**
 * メッセージ内から画像URL（Supabase Storage）を抽出した配列
 * @returns {Array<string>}
 */
const imageUrls = computed(() => extractImages(props.msg.content))

/**
 * メンションのハイライトやURL除去済みの整形済みHTML
 * @returns {string}
 */
const formattedHtml = computed(() => renderMessageHtml(props.msg.content, props.allUsers))

/**
 * メッセージ送信時刻（HH:mm形式）
 * @returns {string}
 */
const formattedTime = computed(() => {
  return new Date(props.msg.created_at).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  })
})

/**
 * このメッセージに紐づくリアクションを絵文字ごとにグループ化
 * 形式: { "👍": ["user1", "user2"], "🔥": ["user3"] }
 * @returns {Object.<string, Array<string>>}
 */
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

// --- アクション（Methods） ---

/**
 * 特定の絵文字をリアクションしたユーザーリストの表示/非表示を切り替える
 * @param {string} emoji - 対象の絵文字
 */
const toggleNames = (emoji) => {
  activeEmoji.value = activeEmoji.value === emoji ? null : emoji
}

/**
 * 編集した内容を親コンポーネントに通知し、編集モードを終了する
 */
const handleUpdate = () => {
  emit('update', props.msg.id, editContent.value)
  isEditing.value = false
}

/**
 * リアクションのトグル処理（既にあれば削除、なければ追加）
 * @param {string} emoji - 追加・削除する絵文字
 * @returns {Promise<void>}
 */
const addReaction = async (emoji) => {
  // 自分の同一リアクションが存在するか確認
  const existingReaction = (props.reactions || []).find(
    (r) =>
      r.message_id === props.msg.id &&
      r.user_name === props.currentUserName &&
      r.emoji === emoji
  )

  if (existingReaction) {
    // 【削除】既にリアクション済みならDBから消す
    const { error } = await supabase
      .from('reactions')
      .delete()
      .eq('id', existingReaction.id)
    if (error) alert('リアクション削除失敗')
  } else {
    // 【追加】未リアクションならDBに挿入
    const { error } = await supabase
      .from('reactions')
      .insert([
        {
          message_id: props.msg.id,
          user_name: props.currentUserName,
          emoji
        }
      ])
    if (error) alert('リアクション失敗')
  }
  // 完了後にメニューを閉じる
  showEmojiMenu.value = false
}
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
      <div class="meta">
        <strong>{{ msg.user_name }}</strong>
        <small>{{ formattedTime }}</small>
      </div>

      <div v-if="!isEditing">
        <p
          v-if="formattedHtml"
          class="text"
          v-html="formattedHtml"
        ></p>

        <div v-for="url in imageUrls" :key="url">
          <img
            :src="url"
            class="chat-image"
            @load="$emit('image-loaded')"
          />
        </div>
      </div>

      <div v-else>
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
            キャンセル
          </button>
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
          @click.stop="showEmojiMenu = !showEmojiMenu"
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
