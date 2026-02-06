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
import RoomNameModal from '../components/RoomNameModal.vue'

// --- ユーザー状態管理 ---
const STORAGE_KEY = 'chat-user-name'
const isNameSet = ref(false)
const isRoomSelected = ref(false)
const currentRoom = ref(null)
const replyTarget = ref('')
const isChangingRoomName = ref(false)
const systemMessage = ref('')
const currentUserName = ref(
  localStorage.getItem(STORAGE_KEY) || ''
)
const currentUserTrip = ref(
  localStorage.getItem('chat-user-trip') || ''
)
const isShowNameModal = ref(false)

// --- 通知設定 ---
const isNotificationEnabled = ref(
  localStorage.getItem('chat-notify') === 'true'
)

// --- useChat Composable ---
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

onMounted(() => {
  if (currentUserName.value) isNameSet.value = true
})

/**
 * 新規メッセージの送信
 */
const sendMessage = async (content) => {
  if (!content.trim()) return

  const tempId = Date.now()
  const tempMsg = {
    id: tempId,
    content,
    user_name: currentUserName.value,
    trip_id: currentUserTrip.value,
    created_at: new Date().toISOString(),
    room_id: currentRoom.value.id,
    isTemp: true
  }

  messages.value = [...messages.value, tempMsg]

  // 自分が送った時は、ディレイを入れてからぬるっと
  await nextTick()
  setTimeout(() => scrollToBottom(false, true), 30)

  const { data, error } = await supabase
    .from('messages')
    .insert([
      {
        content,
        user_name: currentUserName.value,
        trip_id: currentUserTrip.value,
        room_id: currentRoom.value.id
      }
    ])
    .select()

  if (error) {
    alert('送信失敗')
    messages.value = messages.value.filter(
      (m) => m.id !== tempId
    )
  } else if (data && data[0]) {
    const idx = messages.value.findIndex(
      (m) => m.id === tempId
    )
    if (idx !== -1) messages.value[idx] = data[0]
  }
}

/**
 * メッセージの削除
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
 */
const updateMessage = async (id, newContent) => {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('messages')
    .update({
      content: newContent,
      updated_at: now,
      is_edited: true
    })
    .eq('id', id)

  if (error) {
    alert('更新失敗')
  } else {
    const msg = messages.value.find((m) => m.id === id)
    if (msg) {
      msg.content = newContent
      msg.updated_at = now
      msg.is_edited = true
    }
  }
}

/**
 * 画面を最下部までスクロールさせる
 * @param {boolean} instant 即座に移動するか
 * @param {boolean} force 判定を無視して強制的に移動するか
 */
const scrollToBottom = (instant = false, force = false) => {
  const chatWindow = document.querySelector('.chat-window')
  if (!chatWindow) return

  // 最新のターゲット位置を計算
  const targetY =
    chatWindow.scrollHeight - chatWindow.clientHeight
  const startY = chatWindow.scrollTop

  // 距離が短すぎるなら計算しない
  if (!force && targetY - startY < 10) return

  // 「即座に」の場合は余計なことせずワープ
  if (instant) {
    chatWindow.scrollTop = chatWindow.scrollHeight
    return
  }

  // --- アニメーション ---
  const duration = 600 // 600msかけて滑らせる（ここを増やすとより「ぬるっ」とする）
  let startTime = null

  const step = (currentTime) => {
    if (!startTime) startTime = currentTime
    const timeElapsed = currentTime - startTime
    const progress = Math.min(timeElapsed / duration, 1)

    // 強めのイージング（Quad）
    const ease =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

    // アニメーション中もscrollHeightが変わる可能性を考慮して毎回取得
    const currentMax =
      chatWindow.scrollHeight - chatWindow.clientHeight
    chatWindow.scrollTop =
      startY + (currentMax - startY) * ease

    if (timeElapsed < duration) {
      requestAnimationFrame(step)
    } else {
      chatWindow.scrollTop = chatWindow.scrollHeight
    }
  }

  requestAnimationFrame(step)
}
/**
 * ルーム選択時のハンドラ
 */
const handleRoomSelect = async (room) => {
  currentRoom.value = room
  isRoomSelected.value = true

  // 1. データを取ってくる
  await fetchAllRoomUsers(room.id)
  await fetchMessages(room.id)

  setupRealtime(room.id, (p) => {
    if (p.new.user_name !== currentUserName.value)
      sendBrowserNotification(p)

    // 履歴を読み込んでる最中（isFetchingOlderがtrue）は勝手にスクロールさせない
    if (!isFetchingOlder.value) {
      nextTick(() => scrollToBottom(false, false))
    }
  })

  // 2. 描画を待つ
  await nextTick()

  const chatWindow = document.querySelector('.chat-window')
  if (chatWindow) {
    const startY = chatWindow.scrollTop
    const endY =
      chatWindow.scrollHeight - chatWindow.clientHeight

    // 最初から底にいるなら動かずに、距離があるなら滑らせる
    if (endY > startY) {
      // 読み込み直後、時間を置いてからスタート
      setTimeout(() => {
        scrollToBottom(false, true, 1200)
      }, 150)
    }
  }
}
/**
 * ブラウザ通知
 */
const sendBrowserNotification = async (p) => {
  if (
    isNotificationEnabled.value &&
    Notification.permission === 'granted'
  ) {
    const registration = await navigator.serviceWorker.ready
    if (registration) {
      registration.showNotification(
        `${p.new.user_name} さん`,
        {
          body: p.new.content,
          icon: '/ChatTool/icon-192.png',
          badge: '/ChatTool/icon-192.png',
          tag: 'new-message',
          renotify: true
        }
      )
    } else {
      new Notification(`${p.new.user_name} さん`, {
        body: p.new.content
      })
    }
  }
}

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

const leaveRoom = () => {
  if (!confirm('退室しますか？')) return
  cleanup()
  isRoomSelected.value = false
  currentRoom.value = null
}

const prepareReply = (userName) => {
  replyTarget.value = `@${userName} `
}

onBeforeUnmount(() => cleanup())

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

  await nextTick()
  if (chatWindow) {
    chatWindow.scrollTop =
      chatWindow.scrollHeight - previousScrollHeight
  }
}

const updateRoomName = async () => {
  const { error } = await supabase
    .from('rooms')
    .update({ name: currentRoom.value.name })
    .eq('id', currentRoom.value.id)

  if (error) {
    alert('更新失敗')
  } else {
    isChangingRoomName.value = false
  }
}

const forceReload = async () => {
  if ('serviceWorker' in navigator) {
    const registrations =
      await navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
      await registration.unregister()
    }
  }
  const url = new URL(window.location.href)
  url.searchParams.set('t', Date.now().toString())
  window.location.href = url.toString()
}

const showToast = (msg) => {
  systemMessage.value = msg
  setTimeout(() => {
    systemMessage.value = ''
  }, 3000)
}

onMounted(() => {
  const url = new URL(window.location.href)
  if (url.searchParams.has('t')) {
    url.searchParams.delete('t')
    window.history.replaceState(
      {},
      '',
      url.pathname + url.search
    )
  }
})

const handleNameConfirm = (userData) => {
  currentUserName.value = userData.name
  currentUserTrip.value = userData.trip
  localStorage.setItem('chat-user-name', userData.name)
  localStorage.setItem('chat-user-trip', userData.trip)
  isNameSet.value = true
  isShowNameModal.value = false
}

/**
 * 画像読み込み時のスクロール制御
 */
const handleImageLoadScroll = () => {
  // 1. 過去ログ取得中なら絶対にスクロールさせない
  if (isFetchingOlder.value) return

  const chatWindow = document.querySelector('.chat-window')
  if (!chatWindow) return

  // 2. 現在の位置が「底の近く」にいる時だけ追従させる
  // 底から100px以上離れてる（＝ユーザーが上で過去ログを読んでる）なら無視
  // 過去ログ探索時にも最下部に行ってしまうことを防ぐ
  const distanceFromBottom =
    chatWindow.scrollHeight -
    chatWindow.scrollTop -
    chatWindow.clientHeight

  if (distanceFromBottom < 100) {
    // 自分のメッセージ送信時などは force で飛ばしたいから、判定あり
    scrollToBottom(false, false)
  }
}
</script>

<template>
  <div class="dark-theme">
    <Transition name="fade">
      <div v-if="systemMessage" class="toast-notification">
        {{ systemMessage }}
      </div>
    </Transition>

    <NameModal
      v-if="!isNameSet || isShowNameModal"
      v-model="currentUserName"
      @confirm="handleNameConfirm"
      @close="isNameSet ? (isShowNameModal = false) : null"
    />

    <RoomSelector
      v-else-if="!isRoomSelected"
      :currentUserName="currentUserName"
      @select="handleRoomSelect"
      @openNameModal="isShowNameModal = true"
    />

    <div v-else class="chat-app">
      <header class="chat-header">
        <div class="user-display">
          <span class="user-name">{{
            currentUserName
          }}</span>
          <span class="user-trip">{{
            currentUserTrip
          }}</span>
          <button
            class="edit-btn"
            @click="isShowNameModal = true"
          >
            ✏️
          </button>
        </div>

        <div class="header-controls">
          <span class="room-info"
            >Room:
            <strong>{{ currentRoom?.name }}</strong></span
          >
          <button
            @click="isChangingRoomName = true"
            class="update-room-name"
          >
            ルーム名変更
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
          <button @click="forceReload" class="reload-btn">
            再読み込み
          </button>
          <button @click="leaveRoom" class="leave-btn">
            退室
          </button>
        </div>

        <RoomNameModal
          v-if="isChangingRoomName"
          v-model="currentRoom.name"
          @close="isChangingRoomName = false"
          @confirm="updateRoomName"
        />
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
          @image-loaded="handleImageLoadScroll"
          @reply="prepareReply"
        />

        <div
          v-if="typingUsers.length > 0"
          class="typing-indicator"
        >
          {{ typingUsers.join(', ') }} が入力中...
        </div>
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
  overflow: hidden;
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
  position: relative;
}

header {
  flex-shrink: 0;
  padding: 12px 20px;
  background: #1e1e1e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  z-index: 10;
}

.user-display,
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-weight: bold;
}

.user-trip {
  color: #4facfe;
  font-size: 0.8rem;
  font-weight: bold;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-info {
  font-size: 0.85rem;
  margin-right: 5px;
}

.leave-btn,
.notify-btn,
.update-room-name,
.reload-btn,
.edit-btn {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #444;
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
  transition: all 0.2s ease;
}


.notify-btn:hover,
.update-room-name:hover,
.reload-btn:hover,
.edit-btn:hover {
  border-color: #4facfe;
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
  box-shadow: 0 0 8px rgba(79, 172, 254, 0.3);
}
.leave-btn:hover {
  border-color: #e00909;
  background: rgba(79, 172, 254, 0.15);
  color: #fe784f;
  box-shadow: 0 0 8px rgba(79, 172, 254, 0.3);
}
.notify-btn.active {
  background: rgba(79, 172, 254, 0.2);
  color: #4facfe;
  border-color: #4facfe;
}

.edit-btn {
  padding: 2px 6px;
  border-radius: 6px;
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
  gap: 12px;
}

.chat-window::-webkit-scrollbar {
  width: 6px;
}

.chat-window::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}

.typing-indicator {
  font-size: 0.75rem;
  color: var(--text-sub);
  font-style: italic;
}

.loading-logs {
  text-align: center;
  padding: 10px;
  color: var(--text-sub);
  font-size: 0.8rem;
}

.toast-notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 122, 255, 0.9);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  z-index: 9999;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
