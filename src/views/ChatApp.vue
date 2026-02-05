<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick
} from 'vue'
import { supabase } from '../lib/supabaseClient'
import { useChat } from '../composables/useChat'

// コンポーネントのインポート
import MessageItem from '../components/MessageItem.vue'
import ChatInput from '../components/ChatInput.vue'
import NameModal from '../components/NameModal.vue'
import RoomSelector from '../components/RoomSelector.vue'

/** * @typedef {Object} Room
 * @property {number} id - ルームID
 * @property {string} name - ルーム名
 */

// --- ユーザー状態管理 ---
// ユーザー名（ローカルストレージと同期）
const currentUserName = ref(
  localStorage.getItem('chat-user-name') || ''
)
// 名前入力が完了したか
const isNameSet = ref(false)
// ルーム選択が完了したか
const isRoomSelected = ref(false)
// 現在参加中のルーム情報
const currentRoom = ref(null)
// チャット最下部アンカー要素
const chatEndRef = ref(null)
// 返信先のユーザー名（@マーク含む）
const replyTarget = ref('')

// --- 通知設定 ---
/** @type {import('vue').Ref<boolean>} ブラウザ通知が有効かどうか */
const isNotificationEnabled = ref(
  localStorage.getItem('chat-notify') === 'true'
)

// --- useChat Composable から状態とメソッドを抽出 ---
const {
  messages,
  allReactions,
  typingUsers,
  allRoomUsers,
  isAllLoaded,
  isFetchingOlder,
  fetchMessages,
  fetchAllRoomUsers,
  setupRealtime,
  handleTyping,
  cleanup
} = useChat(currentUserName)

/**
 * 初期化処理：名前が保存されていればモーダルをスキップ
 */
onMounted(() => {
  if (currentUserName.value) isNameSet.value = true
})

/**
 * ルーム選択時のハンドラ
 * データの取得とリアルタイム購読の開始を行う
 * @param {Room} room 選択されたルームオブジェクト
 */
const handleRoomSelect = async (room) => {
  currentRoom.value = room
  isRoomSelected.value = true

  // 1. ルームのコンテキスト（ユーザー・メッセージ）を準備
  await fetchAllRoomUsers(room.id)
  await fetchMessages(room.id)

  // 2. リアルタイム通信のセットアップ
  setupRealtime(room.id, (p) => {
    // 自分以外のメッセージ受信時に通知を飛ばす
    if (p.new.user_name !== currentUserName.value)
      sendBrowserNotification(p)
    scrollToBottom()
  })

  // 3. 初期表示時のスクロール調整
  await nextTick()
  scrollToBottom(true)
}

/**
 * 新規メッセージの送信
 * @param {string} content メッセージ本文
 */
const sendMessage = async (content) => {
  const { error } = await supabase.from('messages').insert([
    {
      content,
      user_name: currentUserName.value,
      room_id: currentRoom.value.id
    }
  ])

  // ユーザーリストの動的更新（初回発言時用）
  if (
    !error &&
    !allRoomUsers.value.includes(currentUserName.value)
  ) {
    allRoomUsers.value.push(currentUserName.value)
  }
}

/**
 * メッセージの削除
 * @param {Object} msg 削除対象のメッセージオブジェクト
 */
const deleteMessage = async (msg) => {
  if (!confirm('削除しますか？')) return
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', msg.id)
  if (error) alert('削除失敗')
}

/**
 * メッセージの編集保存
 * @param {number} id メッセージID
 * @param {string} newContent 更新後の本文
 */
const updateMessage = async (id, newContent) => {
  const { error } = await supabase
    .from('messages')
    .update({ content: newContent })
    .eq('id', id)
  if (error) alert('更新失敗')
}

// --- ユーティリティ・表示制御 ---

/**
 * 画面を最下部までスクロールさせる
 * DOM更新とレンダリングの遅延を考慮した3段構えの実行
 * @param {boolean} [instant=false] アニメーションを無効にするか
 */
const scrollToBottom = (instant = false) => {
  nextTick(() => {
    const performScroll = () => {
      // アンカー要素へのスクロールを試行
      if (chatEndRef.value) {
        chatEndRef.value.scrollIntoView({
          behavior: instant ? 'auto' : 'smooth',
          block: 'end'
        })
      }
      // フォールバック：親要素の scrollTop を直接操作
      const chatWindow =
        document.querySelector('.chat-window')
      if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight
      }
    }

    performScroll() // 直後
    setTimeout(performScroll, 100) // 描画待ち1
    setTimeout(performScroll, 300) // 描画待ち2（画像等）
  })
}

/**
 * ブラウザ通知の送信
 * @param {Object} p Supabaseのペイロード
 */
const sendBrowserNotification = (p) => {
  if (
    isNotificationEnabled.value &&
    Notification.permission === 'granted'
  ) {
    new Notification(`${p.new.user_name} さん`, {
      body: p.new.content
    })
  }
}

/**
 * 通知のON/OFF切り替えと権限リクエスト
 */
const toggleNotification = async () => {
  if (!isNotificationEnabled.value) {
    const permission =
      await Notification.requestPermission()
    if (permission !== 'granted')
      return alert('通知を許可してください')
  }
  isNotificationEnabled.value = !isNotificationEnabled.value
  localStorage.setItem(
    'chat-notify',
    isNotificationEnabled.value
  )
}

/**
 * 退出処理：状態のリセットとチャネルの切断
 */
const leaveRoom = () => {
  if (!confirm('退室しますか？')) return
  cleanup()
  isRoomSelected.value = false
  currentRoom.value = null
}

const prepareReply = (userName) => {
  replyTarget.value = `@${userName} `
}

/** 返信状態の解除 */
const clearReply = () => {
  replyTarget.value = ''
}

// コンポーネント破棄時にリソースを解放
onBeforeUnmount(() => cleanup())

/**
 * 過去ログの追加読み込み
 * スクロール位置を維持しながら古いメッセージを取得する
 */
const loadMoreMessages = async () => {
  if (
    !currentRoom.value ||
    isFetchingOlder.value ||
    isAllLoaded.value
  )
    return

  const chatWindow = document.querySelector('.chat-window')
  const previousScrollHeight = chatWindow
    ? chatWindow.scrollHeight
    : 0

  await fetchMessages(currentRoom.value.id, true)

  // メッセージ追加後の「跳ね返り」を防止するスクロール位置調整
  await nextTick()
  if (chatWindow) {
    chatWindow.scrollTop =
      chatWindow.scrollHeight - previousScrollHeight
  }
}
</script>

<template>
  <div class="dark-theme">
    <NameModal
      v-if="!isNameSet"
      v-model="currentUserName"
      @confirm="isNameSet = true"
    />
    <RoomSelector
      v-else-if="!isRoomSelected"
      @select="handleRoomSelect"
    />

    <div v-else class="chat-app">
      <header>
        <div class="user-info">
          <span
            >Room:
            <strong>{{ currentRoom?.name }}</strong></span
          >
          <button @click="leaveRoom" class="leave-btn">
            退室
          </button>
          <button
            @click="toggleNotification"
            :class="[
              'notify-btn',
              { active: isNotificationEnabled }
            ]"
          >
            {{
              isNotificationEnabled
                ? '🔔 通知ON'
                : '🔕 通知OFF'
            }}
          </button>
        </div>
      </header>

      <div
        class="chat-window"
        @scroll="
          (e) =>
            e.target.scrollTop < 5 && loadMoreMessages()
        "
      >
        <div v-if="isFetchingOlder" class="loading-logs">
          過去ログを読み込み中...
        </div>
        <MessageItem
          v-for="msg in messages"
          :key="msg.id"
          :msg="msg"
          :currentUserName="currentUserName"
          :allUsers="allRoomUsers"
          :reactions="allReactions"
          @delete="deleteMessage"
          @update="updateMessage"
          @image-loaded="scrollToBottom"
          @reply="prepareReply"
        />
        <div
          v-if="typingUsers.length > 0"
          class="typing-indicator"
        >
          {{ typingUsers.join(', ') }} が入力中...
        </div>

        <div ref="chatEndRef"></div>
      </div>

      <ChatInput
        @send="sendMessage"
        @typing="handleTyping"
        :replyTarget="replyTarget"
        :allUsers="allRoomUsers"
        @replyProcessed="replyTarget = ''"
      />
    </div>
  </div>
</template>

<style scoped>
.dark-theme {
  --bg-dark: #121212;
  --bg-card: #1e1e1e;
  --accent: #ff7eb3;
  --text-main: #e0e0e0;
  --text-sub: #888888;
  background-color: var(--bg-dark);
  color: var(--text-main);
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
}
.chat-app {
  width: 95%;
  max-width: 800px;
  height: 90dvh;
  background: var(--bg-card);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  overflow: hidden;
}
header {
  flex-shrink: 0;
  padding: 15px 25px;
  background: #1e1e1e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  z-index: 10;
}
.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: radial-gradient(
    circle at center,
    #222 0%,
    #1a1a1a 100%
  );
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.typing-indicator {
  font-size: 0.8rem;
  color: var(--text-sub);
  margin-bottom: 5px;
}
.leave-btn,
.notify-btn {
  margin-left: 10px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #444;
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}
.notify-btn.active {
  background: rgba(79, 172, 254, 0.2);
  color: #4facfe;
  border-color: #4facfe;
}
.chat-window::-webkit-scrollbar {
  width: 6px;
}
.chat-window::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}
</style>
