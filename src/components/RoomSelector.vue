<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

// 親コンポーネント（ChatApp.vue）へ通知するイベント
const emit = defineEmits(['select', 'openNameModal'])

// 状態管理
const availableRooms = ref([]) // DBから取得したルーム一覧
const roomNameInput = ref('') // 入力中のルーム名
const roomPasswordInput = ref('') // 入力中のパスワード

const props = defineProps({
  currentUserName: {
    type: String,
    default: '名無し'
  }
})

// 初期化：マウント時にルーム一覧を取得
onMounted(() => fetchRooms())

/**
 * ルーム一覧をDBから取得（新しい順）
 */
const fetchRooms = async () => {
  const { data } = await supabase
    .from('rooms')
    .select('id, name, password')
    .order('created_at', { ascending: false })
  if (data) availableRooms.value = data
}

/**
 * 新規ルームの作成
 */
const createRoom = async () => {
  if (!roomNameInput.value || !roomPasswordInput.value)
    return alert('入力してください')

  const { data, error } = await supabase
    .from('rooms')
    .insert([
      {
        name: roomNameInput.value,
        password: roomPasswordInput.value
      }
    ])
    .select()
    .single()

  if (error) {
    // ユニーク制約違反（名前の重複）のハンドリング
    if (error.code === '23505') {
      return alert(
        'そのルーム名は既にあります。別の名前にしてください。'
      )
    }
    console.error(error)
    return alert('作成失敗しました：' + error.message)
  }

  // 作成成功したらそのまま入室
  emit('select', data)
}

/**
 * 既存ルームへの入室（名前とパスワードの照合）
 */
const joinRoom = async () => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('name', roomNameInput.value)
    .eq('password', roomPasswordInput.value)
    .maybeSingle() // 0件または1件を取得

  if (error || !data)
    return alert('パスワードか部屋名が違います')

  emit('select', data)
}

/**
 * リストからルームを選択した際、入力欄に名前を補完する
 */
const selectFromList = (room) => {
  roomNameInput.value = room.name
}

/**
 * ルームの削除
 * @param {Object} room - 削除対象のルーム
 * @param {Event} event - クリックイベント（バブリング防止用）
 */
const deleteRoom = async (room, event) => {
  // 親要素のクリックイベント（selectFromList）が発火しないように止める
  event.stopPropagation()

  // 簡易的な本人確認（パスワード一致）
  const inputPass = prompt(
    `ルーム「${room.name}」を削除するにはパスワードを入力してください`
  )
  if (inputPass === null) return // キャンセル時

  if (inputPass !== room.password) {
    alert('パスワードが違います。削除に失敗しました。')
    return
  }

  if (
    !confirm(
      `本当に削除してもいいですか？\n中のメッセージもすべて消去されます。`
    )
  )
    return

  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', room.id)

  if (error) {
    alert('削除に失敗しました： ' + error.message)
  } else {
    alert('ルームを削除しました。')
    // ローカルの状態を更新して一覧から消す
    availableRooms.value = availableRooms.value.filter(
      (r) => r.id !== room.id
    )
    // 削除したルームが入力中だった場合はクリア
    if (roomNameInput.value === room.name) {
      roomNameInput.value = ''
      roomPasswordInput.value = ''
    }
  }
}
</script>

<template>
  <div class="modal-overlay">
    <div class="room-modal">
      <div class="profile-shortcut">
        <div class="profile-info">
          <span class="profile-label">USER</span>
          <span class="profile-name">{{
            currentUserName
          }}</span>
        </div>
        <button
          @click="$emit('openNameModal')"
          class="small-edit-btn"
        >
          変更
        </button>
      </div>

      <div class="modal-divider"></div>

      <h2>ルーム選択</h2>

      <div class="room-list">
        <p class="list-label">公開中のルーム</p>
        <div
          v-if="availableRooms.length === 0"
          class="no-rooms"
        >
          部屋がありません
        </div>
        <div
          v-for="room in availableRooms"
          :key="room.id"
          :class="[
            'room-item',
            { active: roomNameInput === room.name }
          ]"
          @click="selectFromList(room)"
        >
          <div class="room-info">
            <span class="room-icon">🏠</span>
            <span class="room-name">{{ room.name }}</span>
          </div>

          <button
            class="delete-room-btn"
            @click="deleteRoom(room, $event)"
            title="削除"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
            >
              <path
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="room-form">
        <input
          v-model="roomNameInput"
          placeholder="部屋名を入力..."
        />
        <input
          v-model="roomPasswordInput"
          type="password"
          placeholder="パスワード..."
        />

        <div class="room-actions">
          <button @click="joinRoom" class="join-btn">
            入室
          </button>
          <button @click="createRoom" class="create-btn">
            作成
          </button>
        </div>
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
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.room-modal {
  background: #1e1e1e;
  padding: 40px;
  border-radius: 24px;
  text-align: center;
  width: 350px;
  color: #e0e0e0;
  border: 1px solid #333;
}
h2 {
  color: #3d7e50;
  font-size: 1.5rem;
  margin-bottom: 20px;
}
.room-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 20px;
  text-align: left;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  padding: 10px;
}
.list-label {
  font-size: 0.7rem;
  color: #888;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s;
  margin-bottom: 4px;
  border: 1px solid transparent;
}
.room-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.room-item.active {
  background: rgba(255, 126, 179, 0.1);
  border-color: #ff7eb3;
}
.room-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.delete-room-btn {
  background: transparent;
  color: #666;
  border: none;
  padding: 5px;
  cursor: pointer;
  transition: 0.2s;
}
.delete-room-btn:hover {
  color: #ff4444;
  transform: scale(1.2);
}
.room-modal input {
  display: block;
  width: 100%;
  margin-bottom: 12px;
  padding: 12px;
  background: #2a2a2a;
  border-radius: 12px;
  color: white;
  border: 1px solid #444;
  outline: none;
}
.room-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}
.room-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
  border: none;
  transition: 0.3s;
}
.join-btn {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: white;
}
.create-btn {
  background: linear-gradient(135deg, #ff7eb3, #ff758c);
  color: white;
}
.no-rooms {
  text-align: center;
  padding: 20px;
  color: #555;
  font-size: 0.8rem;
}

.profile-shortcut {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #333;
}

.profile-info {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.profile-label {
  font-size: 0.6rem;
  color: #888;
  letter-spacing: 1px;
}

.profile-name {
  font-weight: bold;
  color: #fff;
  font-size: 1rem;
}

.small-edit-btn {
  background: #444;
  color: #eee;
  border: none;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: 0.2s;
}

.small-edit-btn:hover {
  background: #555;
  color: #ff7eb3;
}

.modal-divider {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    #444,
    transparent
  );
  margin-bottom: 20px;
}
</style>
