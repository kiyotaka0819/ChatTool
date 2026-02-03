<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { supabase } from '../lib/supabaseClient'

// コンポーネントをインポート
import MessageItem from '../components/MessageItem.vue'
import ChatInput from '../components/ChatInput.vue'
import NameModal from '../components/NameModal.vue'

// --- 状態管理 ---
const messages = ref([])
const loading = ref(true)
const isNameSet = ref(false)
const currentUserName = ref(localStorage.getItem('chat-user-name') || '')
const chatEndRef = ref(null)

// --- 無限スクロール・通知状態 ---
const isAllLoaded = ref(false)
const isFetchingOlder = ref(false)
const isNotificationEnabled = ref(localStorage.getItem('chat-notify') === 'true')

// --- 1. 初期化とリアルタイム ---
onMounted(() => {
  if (currentUserName.value) isNameSet.value = true
  fetchMessages()
  setupRealtime()
})

const setupRealtime = () => {
  const subscription = supabase
    .channel('chat-room')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
      if (p.eventType === 'INSERT') {
        messages.value.push(p.new)
        if (p.new.user_name !== currentUserName.value) sendBrowserNotification(p)
        scrollToBottom()
      } else if (p.eventType === 'UPDATE') {
        const idx = messages.value.findIndex((m) => m.id === p.new.id)
        if (idx !== -1) messages.value[idx] = p.new
      } else if (p.eventType === 'DELETE') {
        messages.value = messages.value.filter((m) => m.id !== p.old.id)
      }
    })
    .subscribe()

  onBeforeUnmount(() => {
    supabase.removeChannel(subscription)
  })
}

// --- 2. データ操作 (無限スクロール対応) ---
const fetchMessages = async (isMore = false) => {
  if (isMore && (isAllLoaded.value || isFetchingOlder.value)) return

  const chatWindow = document.querySelector('.chat-window')
  const previousScrollHeight = chatWindow ? chatWindow.scrollHeight : 0

  if (isMore) isFetchingOlder.value = true
  else loading.value = true

  let q = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (isMore && messages.value.length > 0) {
    q = q.lt('created_at', messages.value[0].created_at)
  }

  const { data, error } = await q

  if (!error) {
    if (data.length < 30) isAllLoaded.value = true
    const fetchedMsgs = [...data].reverse()

    if (isMore) {
      messages.value = [...fetchedMsgs, ...messages.value]
      // 過去ログを読み込んだ後、位置をキープする
      await nextTick()
      if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight - previousScrollHeight
      }
    } else {
      messages.value = fetchedMsgs
      // 初回ロードは即時(instant)一番下へ
      scrollToBottom(true)
    }
  }
  loading.value = false
  isFetchingOlder.value = false
}

// --- 3. フォーカス（スクロール）制御 ---
// ここを以前の同名関数と置き換えてください
const scrollToBottom = (instant = false) => {
  nextTick(() => {
    if (chatEndRef.value) {
      chatEndRef.value.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      })
    }
  })
}

// --- 4. その他のロジック ---
const sendMessage = async (content) => {
  await supabase.from('messages').insert([{ content, user_name: currentUserName.value }])
}

const deleteMessage = async (id) => {
  if (confirm('メッセージを削除しますか？')) await supabase.from('messages').delete().eq('id', id)
}

const updateMessage = async (id, content) => {
  await supabase.from('messages').update({ content }).eq('id', id)
}

const handleScroll = (e) => {
  // scrollTopがほぼ0かつ、データが30件以上ある場合のみ追加読み込み
  if (e.target.scrollTop < 5 && messages.value.length >= 30) {
    fetchMessages(true)
  }
}

const setName = () => {
  if (!currentUserName.value.trim()) return
  localStorage.setItem('chat-user-name', currentUserName.value)
  isNameSet.value = true
}

const toggleNotification = async () => {
  if (Notification.permission !== 'granted') await Notification.requestPermission()
  isNotificationEnabled.value = !isNotificationEnabled.value
  localStorage.setItem('chat-notify', isNotificationEnabled.value)
}

const sendBrowserNotification = (p) => {
  if (isNotificationEnabled.value && Notification.permission === 'granted') {
    new Notification(`${p.new.user_name} さん`, { body: p.new.content })
  }
}
</script>

<template>
  <div class="dark-theme">
    <NameModal v-if="!isNameSet" v-model="currentUserName" @confirm="setName" />

    <div class="chat-app">
      <header>
        <div class="user-info">
          <span>User: <strong>{{ currentUserName }}</strong></span>
          <button class="mini-btn" @click="isNameSet = false">名前変更</button>
        </div>
        <button
          @click="toggleNotification"
          :class="['notify-btn', { active: isNotificationEnabled }]"
        >
          通知: {{ isNotificationEnabled ? 'ON' : 'OFF' }}
        </button>
      </header>

      <div class="chat-window" @scroll="handleScroll">
        <div v-if="isFetchingOlder" class="load-more-status">
          <span class="loader"></span> 過去のメッセージを読み込み中...
        </div>

        <MessageItem
          v-for="msg in messages"
          :key="msg.id"
          :msg="msg"
          :currentUserName="currentUserName"
          @delete="deleteMessage"
          @update="updateMessage"
        />

        <div ref="chatEndRef"></div>
      </div>

      <ChatInput @send="sendMessage" />
    </div>
  </div>
</template>

<style scoped>
/* 整形済みCSS */
.dark-theme {
  --bg-dark: #121212;
  --bg-card: #1e1e1e;
  --accent: #ff7eb3;
  --text: #e0e0e0;
  background-color: var(--bg-dark);
  color: var(--text);
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
  height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
}

header {
  flex-shrink: 0;
  padding: 15px 25px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
}

.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: radial-gradient(circle at center, #222 0%, #1a1a1a 100%);
  display: flex;
  flex-direction: column;
}

.load-more-status {
  text-align: center;
  font-size: 0.8rem;
  padding: 10px;
  color: var(--accent);
}

.loader {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

button {
  border: none;
  cursor: pointer;
  font-weight: bold;
  border-radius: 20px;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2);
}

button:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}

button:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

.notify-btn {
  background: #444;
  color: #bbb;
  padding: 8px 16px;
  font-size: 0.8rem;
}

.notify-btn.active {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: white;
}

.mini-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #ddd;
  padding: 4px 12px;
  font-size: 0.7rem;
  box-shadow: none;
}
</style>