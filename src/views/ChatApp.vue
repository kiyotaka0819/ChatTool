<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick
} from 'vue'
import { supabase } from '../lib/supabaseClient'
import MessageItem from '../components/MessageItem.vue'
import ChatInput from '../components/ChatInput.vue'
import NameModal from '../components/NameModal.vue'
import RoomSelector from '../components/RoomSelector.vue'

// --- 状態管理 ---
const messages = ref([]) // メッセージ一覧
const isNameSet = ref(false) // 名前設定済みフラグ
const isRoomSelected = ref(false) // ルーム選択済みフラグ
const currentUserName = ref(
  localStorage.getItem('chat-user-name') || ''
)
const currentRoom = ref(null) // 現在選択中のルーム情報
const chatEndRef = ref(null) // スクロール最下部検知用
const isAllLoaded = ref(false) // 全メッセージ読み込み完了フラグ
const isFetchingOlder = ref(false) // 過去ログ取得中フラグ
const replyTarget = ref('') // リプライ先のユーザー名
const allRoomUsers = ref([]) // ルーム内に過去発言したユーザー一覧
const allReactions = ref([]) // ★全メッセージに対するリアクションデータ
// リアルタイム通信用のチャネル保持
let roomChannel = null
let reactionsChannel = null

const isNotificationEnabled = ref(
  localStorage.getItem('chat-notify') === 'true'
)
const typingUsers = ref([]) // 入力中のユーザーリスト

onMounted(() => {
  if (currentUserName.value) isNameSet.value = true
})

// ルーム決定後の初期化処理
const handleRoomSelect = async (room) => {
  currentRoom.value = room
  isRoomSelected.value = true

  // 1. ユーザーリストを取得
  await fetchAllRoomUsers()
  // 2. メッセージとリアクションの取得、リアルタイム購読開始
  fetchMessages()
  setupRealtime()
}

/**
 * リアルタイム購読の設定
 * メッセージの更新、ユーザーの入力中状態、リアクションの同期をすべてここで管理します。
 */
const setupRealtime = () => {
  // 1. 既存のチャネルがあれば一度削除（二重購読によるメモリリークや重複検知を防止）
  if (roomChannel) supabase.removeChannel(roomChannel)
  if (reactionsChannel)
    supabase.removeChannel(reactionsChannel)

  // ---------------------------------------------------------
  // 【A】ルーム内メッセージ・ユーザー状態用チャネル
  // ---------------------------------------------------------
  roomChannel = supabase.channel(
    `room-${currentRoom.value.id}`
  )

  roomChannel
    // Presence: 他のユーザーが入力中かどうかを同期
    .on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState()
      typingUsers.value = Object.values(state)
        .flat()
        .filter(
          (user) =>
            user.user_name !== currentUserName.value &&
            user.isTyping
        )
        .map((user) => user.user_name)
    })
    // Postgres Changes: messagesテーブルのINSERT/UPDATE/DELETEを監視
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${currentRoom.value.id}` // このルームのメッセージのみ
      },
      (p) => {
        if (p.eventType === 'INSERT') {
          // 新着メッセージを配列の最後に追加
          messages.value.push(p.new)
          // 自分以外の発言ならブラウザ通知を飛ばす
          if (p.new.user_name !== currentUserName.value) {
            sendBrowserNotification(p)
          }
          scrollToBottom()
        } else if (p.eventType === 'UPDATE') {
          // 既存メッセージの編集（内容更新）
          const idx = messages.value.findIndex(
            (m) => m.id === p.new.id
          )
          if (idx !== -1) messages.value[idx] = p.new
        } else if (p.eventType === 'DELETE') {
          // メッセージ削除
          messages.value = messages.value.filter(
            (m) => m.id !== p.old.id
          )
        }
      }
    )
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // 接続完了時に自分の初期状態（入力中=false）をトラッキング開始
        await roomChannel.track({
          user_name: currentUserName.value,
          isTyping: false
        })
      }
    })

  // ---------------------------------------------------------
  // 【B】リアクション同期用チャネル
  // ---------------------------------------------------------
  // ⚠️ ここで reactionsChannel に代入し、確実に allReactions を参照できるようにする
  reactionsChannel = supabase
    .channel('public:reactions')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reactions' },
      (payload) => {
        console.log('Realtime reaction payload:', payload)

        // 現在画面に表示されているメッセージに関連するリアクションかチェック
        const isVisible = messages.value.some(
          (m) =>
            m.id ===
            (payload.new?.message_id ||
              payload.old?.message_id)
        )

        // 関係ないメッセージのリアクションなら無視
        if (!isVisible) return

        if (payload.eventType === 'INSERT') {
          // 新しいリアクションを配列に追加（スプレッド構文でリアクティブに更新）
          allReactions.value = [
            ...allReactions.value,
            payload.new
          ]
        } else if (payload.eventType === 'DELETE') {
          // 削除されたリアクションを配列から取り除く
          allReactions.value = allReactions.value.filter(
            (r) => r.id !== payload.old.id
          )
        }
      }
    )
    .subscribe()
}

// 入力中ステータスの更新
const handleTyping = async (isTyping) => {
  if (roomChannel) {
    await roomChannel.track({
      user_name: currentUserName.value,
      isTyping
    })
  }
}

// ユーザーリストの取得（メンション候補用）
const fetchAllRoomUsers = async () => {
  if (!currentRoom.value) return
  const { data, error } = await supabase
    .from('messages')
    .select('user_name')
    .eq('room_id', currentRoom.value.id)

  if (!error && data) {
    const uniqueNames = [
      ...new Set(data.map((m) => m.user_name))
    ]
    allRoomUsers.value = uniqueNames
  }
}

// メッセージ取得
const fetchMessages = async (isMore = false) => {
  if (
    !currentRoom.value ||
    (isMore && (isAllLoaded.value || isFetchingOlder.value))
  )
    return

  const chatWindow = document.querySelector('.chat-window')
  const previousScrollHeight = chatWindow
    ? chatWindow.scrollHeight
    : 0

  if (isMore) isFetchingOlder.value = true

  let q = supabase
    .from('messages')
    .select('*')
    .eq('room_id', currentRoom.value.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (isMore && messages.value.length > 0)
    q = q.lt('created_at', messages.value[0].created_at)

  const { data, error } = await q
  if (!error) {
    if (data.length < 30) isAllLoaded.value = true
    const fetchedMsgs = [...data].reverse()

    if (isMore) {
      messages.value = [...fetchedMsgs, ...messages.value]
    } else {
      messages.value = fetchedMsgs
    }

    // 表示されたメッセージに対応するリアクションを取得
    await fetchReactionsForVisibleMessages()

    await nextTick()
    if (isMore && chatWindow) {
      chatWindow.scrollTop =
        chatWindow.scrollHeight - previousScrollHeight
    } else {
      scrollToBottom(true)
    }
  }
  isFetchingOlder.value = false
}

// 表示中メッセージのリアクションを一括取得
const fetchReactionsForVisibleMessages = async () => {
  if (messages.value.length === 0) return
  const messageIds = messages.value.map((m) => m.id)
  const { data, error } = await supabase
    .from('reactions')
    .select('*')
    .in('message_id', messageIds)

  if (!error) {
    allReactions.value = data
  }
}

// メッセージ送信
const sendMessage = async (content) => {
  const { error } = await supabase.from('messages').insert([
    {
      content,
      user_name: currentUserName.value,
      room_id: currentRoom.value.id
    }
  ])
  if (
    !error &&
    !allRoomUsers.value.includes(currentUserName.value)
  ) {
    allRoomUsers.value.push(currentUserName.value)
  }
}

// スクロール制御
const scrollToBottom = (instant = false) => {
  nextTick(() => {
    if (chatEndRef.value)
      chatEndRef.value.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      })
  })
}

// ブラウザ通知
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

// メッセージ削除
const deleteMessage = async (msg) => {
  if (
    !msg ||
    !msg.id ||
    !confirm('このメッセージを削除しますか？')
  )
    return

  const urlRegex =
    /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
  const foundUrls = msg.content.match(urlRegex) || []

  if (foundUrls.length > 0) {
    for (const url of foundUrls) {
      const filePath = url.split('/chat-attachments/')[1]
      if (filePath) {
        await supabase.storage
          .from('chat-attachments')
          .remove([filePath])
      }
    }
  }

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', msg.id)
  if (error) alert('削除失敗：' + error.message)
}

// メッセージ更新
const updateMessage = async (id, newContent) => {
  if (!newContent || newContent.trim() === '')
    return alert('中身が空です')
  const { error } = await supabase
    .from('messages')
    .update({ content: newContent })
    .eq('id', id)
  if (error) alert('更新に失敗しました。')
}

// 退室処理
const leaveRoom = () => {
  if (!confirm('ルームから退出しますか？')) return
  if (roomChannel) supabase.removeChannel(roomChannel)
  if (reactionsChannel)
    supabase.removeChannel(reactionsChannel)
  isRoomSelected.value = false
  currentRoom.value = null
  messages.value = []
  allReactions.value = []
}

// 通知トグル
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

// 終了処理
onBeforeUnmount(() => {
  if (roomChannel) supabase.removeChannel(roomChannel)
  if (reactionsChannel)
    supabase.removeChannel(reactionsChannel)
})

const prepareReply = (userName) => {
  replyTarget.value = `@${userName} `
}

const clearReply = () => {
  replyTarget.value = ''
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
            e.target.scrollTop < 5 && fetchMessages(true)
        "
      >
        <div
          v-if="typingUsers.length > 0"
          class="typing-indicator"
        >
          {{ typingUsers.join(', ') }} が入力中...
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

        <div ref="chatEndRef"></div>
      </div>

      <ChatInput
        @send="sendMessage"
        @typing="handleTyping"
        :replyTarget="replyTarget"
        :allUsers="allRoomUsers"
        @replyProcessed="clearReply"
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
