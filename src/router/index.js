import ChatApp from '../views/ChatApp.vue'
import {
  createRouter,
  createWebHashHistory
} from 'vue-router'

const router = createRouter({
  // ★ここもHashに変更。BASE_URLの設定は不要になるで
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatApp
    }
  ]
})

export default router
