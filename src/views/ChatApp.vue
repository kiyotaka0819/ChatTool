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
const messages = ref([])
const isNameSet = ref(false)
const isRoomSelected = ref(false)
const currentUserName = ref(
  localStorage.getItem('chat-user-name') || ''
)
const currentRoom = ref(null)
const chatEndRef = ref(null)
const isAllLoaded = ref(false)
const isFetchingOlder = ref(false)
const isNotificationEnabled = ref(
  localStorage.getItem('chat-notify') === 'true'
)
const typingUsers = ref([])
let roomChannel = null

onMounted(() => {
  if (currentUserName.value) isNameSet.value = true
})

// ルーム決定後の処理
const handleRoomSelect = (room) => {
  currentRoom.value = room
  isRoomSelected.value = true
  fetchMessages()
  setupRealtime()
}
const isImage = (text) => {
  if (!text || typeof text !== 'string') return false
  return (
    text.startsWith('http') &&
    text.includes('chat-attachments')
  )
}
// リアルタイム購読
const setupRealtime = () => {
  if (roomChannel) supabase.removeChannel(roomChannel)

  // 変数宣言(let)をつけずに、外の roomChannel に代入する
  roomChannel = supabase.channel(
    `room-${currentRoom.value.id}`
  )

  roomChannel
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
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${currentRoom.value.id}`
      },
      (p) => {
        // INSERT, UPDATE, DELETE の処理
        if (p.eventType === 'INSERT') {
          messages.value.push(p.new)
          if (p.new.user_name !== currentUserName.value)
            sendBrowserNotification(p)
          scrollToBottom()
        } else if (p.eventType === 'UPDATE') {
          const idx = messages.value.findIndex(
            (m) => m.id === p.new.id
          )
          if (idx !== -1) messages.value[idx] = p.new
        } else if (p.eventType === 'DELETE') {
          messages.value = messages.value.filter(
            (m) => m.id !== p.old.id
          )
        }
      }
    )
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({
          user_name: currentUserName.value,
          isTyping: false
        })
      }
    })
}

const handleTyping = async (isTyping) => {
  if (roomChannel) {
    await roomChannel.track({
      user_name: currentUserName.value,
      isTyping
    })
  }
}

// --- メッセージ取得・送信などの残りのロジックは以前と同じ（中略なし） ---
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
      await nextTick()
      if (chatWindow)
        chatWindow.scrollTop =
          chatWindow.scrollHeight - previousScrollHeight
    } else {
      messages.value = fetchedMsgs
      scrollToBottom(true)
    }
  }
  isFetchingOlder.value = false
}

const sendMessage = async (content) => {
  await supabase.from('messages').insert([
    {
      content,
      user_name: currentUserName.value,
      room_id: currentRoom.value.id
    }
  ])
}

const scrollToBottom = (instant = false) => {
  nextTick(() => {
    if (chatEndRef.value)
      chatEndRef.value.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      })
  })
}

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

const deleteMessage = async (msg) => {
  if (!msg || !msg.id) return
  if (!confirm('このメッセージを削除しますか？')) return

  // 1. メッセージ内から画像URLをすべて抽出
  const urlRegex =
    /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g
  const foundUrls = msg.content.match(urlRegex) || []

  // 2. 抽出したURLがあればストレージから削除
  if (foundUrls.length > 0) {
    for (const url of foundUrls) {
      // URLからファイルパスを抜き出す
      const filePath = url.split('/chat-attachments/')[1]
      if (filePath) {
        const { error: storageError } =
          await supabase.storage
            .from('chat-attachments')
            .remove([filePath])

        if (storageError)
          console.error('ストレージ削除失敗:', storageError)
      }
    }
  }

  // 3. DBからメッセージを消す（いつもの）
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', msg.id)

  if (error) {
    alert('削除失敗：' + error.message)
  } else {
    messages.value = messages.value.filter(
      (m) => m.id !== msg.id
    )
  }
}

const updateMessage = async (id, newContent) => {
  const { error } = await supabase
    .from('messages')
    .update({ content: newContent })
    .eq('id', id)

  if (error) {
    console.error('更新失敗:', error)
    alert('更新に失敗しました。：' + error.message)
  }
}

const leaveRoom = () => {
  if (!confirm('ルームから退出しますか？')) return
  isRoomSelected.value = false
  currentRoom.value = null
  messages.value = []
  isAllLoaded.value = false
}

// 通知のオンオフを切り替える関数
const toggleNotification = async () => {
  if (!isNotificationEnabled.value) {
    // 許可を取る
    const permission =
      await Notification.requestPermission()
    if (permission !== 'granted') {
      alert(
        '通知がブロックされました。ブラウザの設定から許可してください。'
      )
      return
    }
  }
  // 状態を反転させて保存
  isNotificationEnabled.value = !isNotificationEnabled.value
  localStorage.setItem(
    'chat-notify',
    isNotificationEnabled.value
  )
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
          class="typing-indicator"
          v-if="typingUsers.length > 0"
        >
          {{ typingUsers.join(', ') }} が入力中...
        </div>
        <div v-for="msg in messages" :key="msg.id">
          <MessageItem
            :msg="msg"
            :currentUserName="currentUserName"
            @delete="deleteMessage"
            @update="updateMessage"
            @image-loaded="scrollToBottom"
          />
        </div>
        <div ref="chatEndRef"></div>
      </div>
      <ChatInput
        @send="sendMessage"
        @typing="handleTyping"
      />
    </div>
  </div>
</template>

<style scoped>
/* 全体のベース設定 */
.dark-theme {
  --bg-dark: #121212;
  --bg-card: #1e1e1e;
  --accent: #ff7eb3;
  --text-main: #e0e0e0; /* 明るいグレー */
  --text-sub: #888888; /* 暗めのグレー */

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
  height: 90vh;
  background: var(--bg-card);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  overflow: hidden;
}

/* ヘッダー周りの視認性向上 */
header {
  flex-shrink: 0;
  padding: 15px 25px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  color: var(--text-main); /* ★文字を白く */
}

.user-info span {
  color: var(--text-main);
  font-size: 0.9rem;
}

.user-info strong {
  color: var(--accent); /* ルーム名を目立たせる */
  margin-left: 5px;
}

.user-label {
  font-size: 0.8rem;
  color: var(--text-sub);
  margin-left: 15px;
}

/* チャットウィンドウ */
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

.notify-btn {
  background: #333;
  color: #bbb;
  padding: 6px 12px;
  font-size: 0.75rem;
  border: 1px solid #444;
  border-radius: 12px;
  cursor: pointer;
  transition: 0.3s;
  margin-left: 10px;
}

.notify-btn.active {
  background: rgba(79, 172, 254, 0.2);
  color: #4facfe;
  border-color: #4facfe;
}
/* スクロールバーの調整（ここも暗くしないと浮く） */
.chat-window::-webkit-scrollbar {
  width: 6px;
}
.chat-window::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}

.leave-btn {
  margin-left: 15px;
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid #444;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: 0.3s;
}

.leave-btn:hover {
  background: rgba(255, 59, 48, 0.2); /* ほんのり赤く */
  color: #ff3b30;
  border-color: #ff3b30;
}
</style>
