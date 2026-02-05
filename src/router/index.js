import ChatApp from '../views/ChatApp.vue'
import {
  createRouter,
  createWebHashHistory
} from 'vue-router'

const router = createRouter({
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
