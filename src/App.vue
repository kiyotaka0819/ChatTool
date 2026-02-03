<template>
  <div id="app-layout">
    <nav v-if="false"><router-link to="/">Chat</router-link></nav>

    <router-view />
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: sans-serif;
}
</style>
