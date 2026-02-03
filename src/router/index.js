import { createRouter, createWebHistory } from 'vue-router'
import ChatApp from '../views/ChatApp.vue'

const router = createRouter({
  // GitHub Pagesにデプロイすることを考えて、ベースURLを設定
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatApp
    }
    // 今後「About」とか「Profile」を増やすならここに追加
  ]
})

export default router
