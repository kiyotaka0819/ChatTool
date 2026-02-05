<script setup>
import { computed, ref } from 'vue'
import config from '../lib/consts.json'
import { supabase } from '../lib/supabaseClient'
import {
  extractImages,
  renderMessageHtml
} from '../utils/messageFormatter'

/**
 * @typedef {Object} Props
 * @property {Object} msg - メッセージ本体（id, content, user_name, created_atなど）
 * @property {string} currentUserName - ログイン中のユーザー名
 * @property {Array<string>} allUsers - ルーム内の全ユーザー（メンション判定用）
 * @property {Array<Object>} reactions - 全メッセージに紐づくリアクションの平坦な配列
 */
const props = defineProps([
  'msg',
  'currentUserName',
  'allUsers',
  'reactions'
])

/**
 * @typedef {Object} Emits
 * @property {Function} delete - メッセージ削除時
 * @property {Function} update - メッセージ更新（編集）時
 * @property {Function} image-loaded - 画像読み込み完了時（スクロール調整用）
 * @property {Function} reply - 返信ボタンクリック時（入力欄にユーザー名セット用）
 */
const emit = defineEmits([
  'delete',
  'update',
  'image-loaded',
  'reply'
])

// --- 状態管理 (Internal State) ---

/** @type {import('vue').Ref<boolean>} 絵文字選択メニューの表示フラグ */
const showEmojiMenu = ref(false)

/** @type {import('vue').Ref<boolean>} メッセージ編集モードの切り替えフラグ */
const isEditing = ref(false)

/** @type {import('vue').Ref<string>} 編集中のメッセージ本文 */
const editContent = ref(props.msg.content)

/** @type {import('vue').Ref<string|null>} 現在リアクションしたユーザーリストを表示している絵文字 */
const activeEmoji = ref(null)
// 編集ボタン押下時にフォーカスする
const vFocus = {
  mounted: (el) => el.focus()
}
// 画像が折りたたまれているかどうかの状態
const isCollapsed = ref(true)
// --- 表示用データ（Computed Properties） ---

/**
 * メッセージ内から画像URL（Supabase Storage）を抽出した配列
 * @returns {Array<string>}
 */
const imageUrls = computed(() =>
  extractImages(props.msg.content)
)
// 画像をトグル管理するための関数
const toggleImage = () => {
  isCollapsed.value = !isCollapsed.value
}

/**
 * メンションのハイライトやURL除去済みの整形済みHTML
 * @returns {string}
 */
const formattedHtml = computed(() =>
  renderMessageHtml(props.msg.content, props.allUsers)
)

/**
 * メッセージ送信時刻（HH:mm形式）
 * @returns {string}
 */
const formattedTime = computed(() => {
  return new Date(props.msg.created_at).toLocaleTimeString(
    'ja-JP',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  )
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
  activeEmoji.value =
    activeEmoji.value === emoji ? null : emoji
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

/**
 * メッセージが編集されたかどうか
 */
const isEdited = computed(() => {
  // boolean フラグを見る
  return props.msg.is_edited === true
})
/**
 * 編集時刻（HH:mm形式）
 */
const formattedUpdatedTime = computed(() => {
  if (!props.msg.updated_at) return ''
  return new Date(props.msg.updated_at).toLocaleTimeString(
    'ja-JP',
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  )
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
    <div
      :class="[
        'bubble',
        { 'is-editing-active': isEditing }
      ]"
    >
      <div class="meta">
        <strong>{{ msg.user_name }}&nbsp;&nbsp;</strong>
        <small>{{ formattedTime }}</small>

        <span
          v-if="isEdited"
          class="edited-label"
          :title="'編集時刻: ' + formattedUpdatedTime"
        >
          （編集済み: {{ formattedUpdatedTime }}）
        </span>
      </div>

      <div v-if="!isEditing">
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
          placeholder="メッセージを編集..."
          v-focus
          @keydown.enter.exact.prevent="handleUpdate"
          @keydown.esc="isEditing = false"
        ></textarea>
        <div class="edit-actions-row">
          <div class="keyHint">Shift + Enter で改行</div>
          <button
            @click="handleUpdate"
            class="edit-btn save"
          >
            <span>✅</span> 保存
          </button>
          <button
            @click="isEditing = false"
            class="edit-btn cancel"
          >
            <span>❌</span> 取消
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
          title="リアクション"
        >
          ☺+
        </span>

        <template v-if="msg.user_name === currentUserName">
          <span
            @click="isEditing = true"
            class="action-btn edit-btn"
          >
            ✏️ 編集
          </span>
          <span
            @click="$emit('delete', msg)"
            class="action-btn delete-btn"
          >
            🗑️ 削除
          </span>
        </template>

        <template v-else>
          <span
            @click="$emit('reply', msg.user_name)"
            class="action-btn reply-btn"
          >
            💬 返信
          </span>
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
/* モバイルでのズーム防止 */
input,
textarea,
select {
  font-size: 16px !important;
}

/* メッセージ行の基本配置 */
.msg-row {
  display: flex;
  width: 100%;
  margin-bottom: 20px; /* 少し広げてツールチップのスペース確保 */
  position: relative;
}

.msg-row.is-mine {
  justify-content: flex-end;
}

/* 吹き出し本体 */
.bubble {
  max-width: 75%;
  padding: 12px 18px;
  border-radius: 18px;
  background: #333;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  position: relative; /* actionsの基準点 */
}

.is-mine .bubble {
  background: linear-gradient(135deg, #007aff, #0056b3);
  color: white;
  border-bottom-right-radius: 4px;
}

.msg-row:not(.is-mine) .bubble {
  border-bottom-left-radius: 4px;
}

/* メッセージテキスト */
.text {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 5px 0;
  line-height: 1.5;
}

/* 送信者名・時間 */
.meta {
  font-size: 0.7rem;
  opacity: 0.6;
  margin-bottom: 4px;
}

/* --- 操作ボタン(編集・削除・返信) --- */
.actions {
  position: absolute;
  top: -15px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: all 0.2s ease-in-out;
  z-index: 10;
  pointer-events: none;
}

/* 自分の時は右、相手の時は左に浮かせる */
.is-mine .actions {
  right: 10px;
}
.msg-row:not(.is-mine) .actions {
  left: 10px;
}

/* ホバーでふわっと浮かび上がる */
.bubble:hover .actions {
  opacity: 1;
  top: -25px;
  pointer-events: auto;
}

/* ボタンの共通パーツ */
.action-btn {
  background: #2a2a2a;
  color: #ccc;
  border: 1px solid #444;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.65rem;
  font-weight: bold;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  transition: 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn:hover {
  background: #3a3a3a;
  color: white;
  transform: translateY(-2px);
  border-color: #ff7eb3;
}

.delete-btn:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.1);
}

.edit-btn:hover {
  border-color: #52c41a;
  color: #52c41a;
}

/* --- 編集モード --- */
.edit-area {
  width: 100%;
  min-height: 60px;
  background: #444;
  color: white;
  border: 1px solid #555;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 5px;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

/* --- リアクション表示 --- */
.reactions-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.reaction-badge {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #444;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.8rem;
  transition: 0.2s;
}

.reaction-badge.is-active {
  background: rgba(255, 235, 59, 0.1);
  border-color: #ffeb3b;
  color: #ffeb3b;
}

/* 絵文字ピッカー */
.mini-emoji-picker {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  background: #2a2a2a;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #444;
}

.emoji-option {
  font-size: 1.2rem;
  padding: 4px;
  cursor: pointer;
  border-radius: 6px;
  transition: 0.2s;
}

.emoji-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.emoji-option.is-selected {
  background: rgba(255, 235, 59, 0.2);
  border: 1px solid #ffeb3b;
  border-radius: 6px;
  transform: scale(1.1);
}

/* --- その他装飾 --- */
.chat-image {
  display: block;
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  margin-top: 8px;
  background: #2a2a2a;
}

:deep(.mention-tag) {
  color: #ffeb3b;
  font-weight: bold;
  background: rgba(255, 235, 59, 0.1);
  padding: 0 4px;
  border-radius: 4px;
}

:deep(.chat-link) {
  color: #47fff3;
  text-decoration: underline;
  word-break: break-all;
}

/* スマホやタブレット（ホバーが使えないデバイス）向けの調整 */
@media (hover: none) {
  .actions {
    opacity: 1; /* 常に表示 */
    pointer-events: auto; /* クリック可能に */
    top: -20px; /* 位置を固定 */
    background: rgba(
      42,
      42,
      42,
      0.9
    ); /* 少し背景を濃くして視認性アップ */
    border-radius: 12px;
  }

  /* スマホの時はボタンを少し大きくして押しやすくする */
  .action-btn {
    padding: 6px 12px;
    font-size: 0.75rem;
  }
}

/* 編集モードのコンテナ */
.edit-mode-container {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 96%;
}

/* 編集中の入力欄：吹き出しの背景に馴染ませる */
.edit-area {
  width: 100%;
  min-height: 120px;
  background: rgba(
    255,
    255,
    255,
    0.05
  ); /* ほんのり明るく */
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.edit-area:focus {
  border-color: #ff7eb3; /* 集中してる感じを出す */
  background: rgba(255, 255, 255, 0.08);
}

.edit-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

/* 編集用ボタンの共通スタイル */
.edit-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.edit-btn.save {
  background: #52c41a;
  color: white;
}

.edit-btn.save:hover {
  background: #73d13d;
  transform: translateY(-1px);
}

.edit-btn.cancel {
  background: #444;
  color: #ccc;
}

.edit-btn.cancel:hover {
  background: #555;
  color: white;
}

/* 既存の style セクションに追加 */
.edited-label {
  font-size: 0.65rem;
  opacity: 0.5;
  margin-left: 6px;
  font-style: italic;
}

.is-mine .edited-label {
  color: #e0e0e0;
  opacity: 0.7;
}

.bubble.is-editing-active {
  max-width: 100%;
  width: 100%;
  transition: all 0.3s ease;
}

.keyHint {
  font-size: 0.65rem;
  opacity: 0.5;
  margin-left: 6px;
  font-style: italic;
  margin-right: auto;
}
.chat-image-container {
  position: relative;
  cursor: pointer;
  margin-top: 8px;
  overflow: hidden;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.chat-image {
  display: block;
  max-width: 100%;
  max-height: 800px;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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

.zoom-hint {
  font-size: 0.65rem;
  color: #ff7eb3;
  text-align: right;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 0 0 12px 12px;
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
  pointer-events: none;
}
</style>
