import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient'

/**
 * チャットの基幹ロジック（メッセージ取得、リアルタイム同期、入力中状態）を管理するComposable
 * 状態（Reactive Data）と、それらを操作するメソッドをカプセル化して提供する。
 * @param {import('vue').Ref<string>} currentUserName - 現在のユーザー名（リアクティブな参照）
 * @returns {Object} チャット操作に必要な状態とメソッド一式
 */
export function useChat(currentUserName) {
  // --- 状態管理 ---
  
  // 取得済みのメッセージ配列
  const messages = ref([])
  // 表示中メッセージに紐づく全リアクション
  const allReactions = ref([])
  // 現在「入力中」である自分以外のユーザー名リスト
  const typingUsers = ref([])
  // ルームに存在する（過去に発言した）全ユーザーのリスト
  const allRoomUsers = ref([])
  // サーバー側の全メッセージを読み込み終えたか（これ以上過去ログがないか）
  const isAllLoaded = ref(false)
  // 過去ログのフェッチ処理が実行中かどうか
  const isFetchingOlder = ref(false)

  // --- 通信チャネル管理（内部保持） ---
  
  // メッセージ・Presence監視用の主要チャネル
  let roomChannel = null
  // リアクションの更新を監視する専用チャネル
  let reactionsChannel = null

  // --- データ取得メソッド ---

  /**
   * 指定したルームの全発言ユーザーを重複なしで取得する
   * メンション機能の補完リスト作成などに使用。
   * @param {number} roomId - 取得対象のルームID
   * @returns {Promise<void>}
   */
  const fetchAllRoomUsers = async (roomId) => {
    if (!roomId) return
    const { data, error } = await supabase
      .from('messages')
      .select('user_name')
      .eq('room_id', roomId)

    if (!error && data) {
      // Setオブジェクトを使ってユニークな名前の配列を作成
      allRoomUsers.value = [...new Set(data.map((m) => m.user_name))]
    }
  }

  /**
   * メッセージ履歴の取得
   * 初回表示（最新30件）およびスクロールによる追加読み込みの両方に対応。
   * @param {number} roomId - 取得対象のルームID
   * @param {boolean} [isMore=false] - 過去ログの追加取得かどうか
   * @returns {Promise<void>}
   */
  const fetchMessages = async (roomId, isMore = false) => {
    // ロック制御：無効なID、取得済み、または取得中の場合はスキップ
    if (!roomId || (isMore && (isAllLoaded.value || isFetchingOlder.value))) return
    
    if (isMore) isFetchingOlder.value = true

    let q = supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(30)

    // 追加読み込み時は、既に持っているメッセージの最古のものより古いデータを取得
    if (isMore && messages.value.length > 0) {
      q = q.lt('created_at', messages.value[0].created_at)
    }

    const { data, error } = await q
    if (!error) {
      // 30件未満なら「これ以上データはない」と判断
      if (data.length < 30) isAllLoaded.value = true
      
      const fetchedMsgs = [...data].reverse()
      // messages配列の先頭（過去）に結合するか、新規配列としてセットするか
      messages.value = isMore ? [...fetchedMsgs, ...messages.value] : fetchedMsgs
      
      // メッセージ取得完了後、それらに紐づくリアクションを同期的に取得
      await _fetchReactionsForVisibleMessages()
    }
    isFetchingOlder.value = false
  }

  /**
   * 表示されているメッセージID群に基づいてリアクションを一括取得する
   * fetchMessages内から呼ばれる内部用メソッド（@private）
   * @private
   */
  const _fetchReactionsForVisibleMessages = async () => {
    const messageIds = messages.value.map((m) => m.id)
    if (messageIds.length === 0) return
    const { data } = await supabase
      .from('reactions')
      .select('*')
      .in('message_id', messageIds)
    if (data) allReactions.value = data
  }

  // --- リアルタイム同期メソッド ---

  /**
   * Supabase Realtime接続のセットアップ
   * メッセージのCRUD、Presence（入力中状態）、リアクションを購読する。
   * @param {number} roomId - 購読対象のルームID
   * @param {Function} onNewMessage - 新着メッセージ受信時のコールバック関数
   */
  const setupRealtime = (roomId, onNewMessage) => {
    // 既存の接続があれば安全に切断
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel) supabase.removeChannel(reactionsChannel)

    // 1. メッセージ更新とPresence（生存・入力状態）のチャネル
    roomChannel = supabase.channel(`room-${roomId}`)
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState()
        // 自分以外の「isTyping: true」なユーザーを抽出
        typingUsers.value = Object.values(state)
          .flat()
          .filter(u => u.user_name !== currentUserName.value && u.isTyping)
          .map(u => u.user_name)
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'messages', 
        filter: `room_id=eq.${roomId}` 
      }, (p) => {
        // メッセージの挿入、更新、削除を配列に反映
        if (p.eventType === 'INSERT') {
          messages.value.push(p.new)
          if (!allRoomUsers.value.includes(p.new.user_name)) allRoomUsers.value.push(p.new.user_name)
          if (onNewMessage) onNewMessage(p)
        } else if (p.eventType === 'UPDATE') {
          const idx = messages.value.findIndex(m => m.id === p.new.id)
          if (idx !== -1) messages.value[idx] = p.new
        } else if (p.eventType === 'DELETE') {
          messages.value = messages.value.filter(m => m.id !== p.old.id)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // 接続完了時に自身の初期Presenceを追跡開始
          await roomChannel.track({ user_name: currentUserName.value, isTyping: false })
        }
      })

    // 2. リアクション専用の監視チャネル
    reactionsChannel = supabase.channel('public:reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
        // 現在の画面に表示されていないメッセージへのリアクションは無視（メモリ節約）
        const isVisible = messages.value.some(m => m.id === (payload.new?.message_id || payload.old?.message_id))
        if (!isVisible) return

        if (payload.eventType === 'INSERT') {
          allReactions.value = [...allReactions.value, payload.new]
        } else if (payload.eventType === 'DELETE') {
          allReactions.value = allReactions.value.filter(r => r.id !== payload.old.id)
        }
      })
      .subscribe()
  }

  /**
   * 自分の入力状態（isTyping）をチャネル経由で他者に通知する
   * @param {boolean} isTyping - 入力中であればtrue
   */
  const handleTyping = async (isTyping) => {
    if (roomChannel) {
      await roomChannel.track({ user_name: currentUserName.value, isTyping })
    }
  }

  /**
   * リソースのクリーンアップ
   * チャネルの切断および状態の初期化を行う。退室時に必須。
   */
  const cleanup = () => {
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel) supabase.removeChannel(reactionsChannel)
    messages.value = []
    allReactions.value = []
    isAllLoaded.value = false
    typingUsers.value = []
  }

  // 公開するプロパティとメソッド
  return {
    messages, allReactions, typingUsers, allRoomUsers,
    isAllLoaded, isFetchingOlder,
    fetchMessages, fetchAllRoomUsers, setupRealtime, handleTyping, cleanup
  }
}