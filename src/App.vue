<template>
  <div id="app-layout">
    <nav v-if="false">
      <router-link to="/">Chat</router-link>
    </nav>
    <router-view />
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: sans-serif;
}
input,
textarea,
select {
  font-size: 16px !important;
}
button {
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
  touch-action: manipulation;
}

html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  height: 100%;
  width: 100%;
  position: fixed;
}

@media screen and (max-width: 480px) {
  header {
    z-index: 100;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .leave-btn,
  .notify-btn {
    flex: 1;
  }
}
</style>
