<script setup>
defineProps([
  'currentUserName',
  'currentUserTrip',
  'currentRoom',
  'isNotificationEnabled',
  'isChangingRoomName'
])
const emit = defineEmits([
  'openNameModal',
  'changeRoomName',
  'toggleNotification',
  'forceReload',
  'leaveRoom'
])
</script>

<template>
  <header class="chat-header">
    <div class="user-display">
      <div class="user-info-text">
        <span class="user-name">{{ currentUserName }}</span>
        <span class="user-trip">{{ currentUserTrip }}</span>
      </div>
      <button
        class="edit-btn"
        @click="$emit('openNameModal')"
      >
        ✏️
      </button>
    </div>

    <div class="header-controls">
      <div class="room-meta">
        <span class="room-label">Room:</span>
        <strong
          class="room-name"
          @click="$emit('changeRoomName')"
          >{{ currentRoom?.name }}</strong
        >
      </div>

      <div class="button-group">
        <button
          @click="$emit('toggleNotification')"
          :class="[
            'icon-btn',
            { active: isNotificationEnabled }
          ]"
          :title="
            isNotificationEnabled ? '通知ON' : '通知OFF'
          "
        >
          {{ isNotificationEnabled ? '🔔' : '🔕' }}
        </button>
        <button
          @click="$emit('forceReload')"
          class="icon-btn"
          title="再読み込み"
        >
          🔄
        </button>
        <button
          @click="$emit('leaveRoom')"
          class="leave-btn"
        >
          退室
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.chat-header {
  flex-shrink: 0;
  padding: 10px 16px;
  background: #1e1e1e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  z-index: 10;
}

.user-display {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-info-text {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.user-name {
  font-weight: bold;
  font-size: 0.9rem;
}
.user-trip {
  color: #4facfe;
  font-size: 0.7rem;
  font-family: monospace;
}

.header-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.room-meta {
  font-size: 0.75rem;
}
.room-name {
  cursor: pointer;
  color: #fff;
  text-decoration: underline;
}

.button-group {
  display: flex;
  gap: 6px;
}

.icon-btn,
.leave-btn,
.edit-btn {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #444;
  color: #ccc;
}

.icon-btn:hover,
.edit-btn:hover {
  color: #4facfe;
  border-color: #4facfe;
}

.icon-btn.active {
  color: #4facfe;
  border-color: #4facfe;
}

.icon-btn.active:hover {
  color: #4facfe;
  border: 2px solid #4facfe;
}
.leave-btn:hover {
  color: #fe784f;
  border-color: #fe784f;
}
@media (min-width: 768px) {
  .header-controls {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  .user-info-text {
    flex-direction: row;
    gap: 8px;
  }
}
</style>
