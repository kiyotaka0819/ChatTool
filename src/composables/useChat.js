import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient'

/**
 * チャットの基幹ロジック（メッセージ取得、リアルタイム同期、入力中状態）を管理するComposable
 */
export function useChat(currentUserName) {
  // --- 状態管理 ---
  const messages = ref([]) // 取得済みメッセージ
  const allReactions = ref([]) // 表示中メッセージに紐づくリアクション
  const typingUsers = ref([]) // 自分以外で入力中のユーザー
  const allRoomUsers = ref([]) // メンション補完用の全発言者リスト
  const isAllLoaded = ref(false) // 過去ログ完遂フラグ
  const isFetchingOlder = ref(false) // 過去ログ取得ロック

  // 通信チャネル管理
  let roomChannel = null
  let reactionsChannel = null

  /** ルームの発言者を重複なしで一括取得 */
  const fetchAllRoomUsers = async (roomId) => {
    if (!roomId) return
    const { data, error } = await supabase
      .from('messages')
      .select('user_name')
      .eq('room_id', roomId)

    if (!error && data) {
      allRoomUsers.value = [
        ...new Set(data.map((m) => m.user_name))
      ]
    }
  }

  /** メッセージ履歴の取得（初回 & 追加読み込み） */
  const fetchMessages = async (roomId, isMore = false) => {
    if (
      !roomId ||
      (isMore &&
        (isAllLoaded.value || isFetchingOlder.value))
    )
      return
    if (isMore) isFetchingOlder.value = true

    let q = supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (isMore && messages.value.length > 0) {
      q = q.lt('created_at', messages.value[0].created_at)
    }

    const { data, error } = await q
    if (!error) {
      if (data.length < 30) isAllLoaded.value = true
      const fetchedMsgs = [...data].reverse()
      messages.value = isMore
        ? [...fetchedMsgs, ...messages.value]
        : fetchedMsgs
      await _fetchReactionsForVisibleMessages()
    }
    isFetchingOlder.value = false
  }

  /** 表示中メッセージに対するリアクションを同期取得 */
  const _fetchReactionsForVisibleMessages = async () => {
    const messageIds = messages.value.map((m) => m.id)
    if (messageIds.length === 0) return
    const { data } = await supabase
      .from('reactions')
      .select('*')
      .in('message_id', messageIds)
    if (data) allReactions.value = data
  }

  /**
   * Supabase Realtime接続のセットアップ
   * メッセージCRUD、Presence、リアクションを統合購読
   */
  const setupRealtime = (
    roomId,
    onNewMessage,
    onRoomUpdate
  ) => {
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel)
      supabase.removeChannel(reactionsChannel)

    roomChannel = supabase.channel(`room-${roomId}`)
    roomChannel
      // Presence: 他者のタイピング状態を監視
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState()
        typingUsers.value = Object.values(state)
          .flat()
          .filter(
            (u) =>
              u.user_name !== currentUserName.value &&
              u.isTyping
          )
          .map((u) => u.user_name)
      })
      // メッセージ挿入時の個別ハンドリング（通知やリスト追加用）
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`
        },
        (p) => {
          const exists = messages.value.some(
            (m) => m.id === p.new.id
          )
          if (!exists) {
            messages.value = [...messages.value, p.new]
            // 新規ユーザーならメンションリストへ追加
            if (
              !allRoomUsers.value.includes(p.new.user_name)
            ) {
              allRoomUsers.value = [
                ...allRoomUsers.value,
                p.new.user_name
              ]
            }
            if (onNewMessage) onNewMessage(p)
          }
        }
      )
      // メッセージの全変更（Update, Delete含む）を統合ハンドリング
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`
        },
        (p) => {
          if (p.eventType === 'INSERT') {
            // 楽観的更新（自分で即座に追加した分）との重複を防ぐ
            const exists = messages.value.some(
              (m) => m.id === p.new.id
            )
            if (!exists) {
              messages.value = [...messages.value, p.new]
              if (onNewMessage) onNewMessage(p)
            }
          } else if (p.eventType === 'UPDATE') {
            const idx = messages.value.findIndex(
              (m) => m.id === p.new.id
            )
            if (idx !== -1) messages.value[idx] = p.new
          } else if (p.eventType === 'DELETE') {
            messages.value = messages.value.filter(
              (m) => m.id !== p.old.id
            )
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({
            user_name: currentUserName.value,
            isTyping: false
          })
        }
      })

    // リアクション専用チャネル
    reactionsChannel = supabase
      .channel('public:reactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions'
        },
        (payload) => {
          const msgId =
            payload.new?.message_id ||
            payload.old?.message_id
          const isVisible = messages.value.some(
            (m) => m.id === msgId
          )
          if (!isVisible) return

          if (payload.eventType === 'INSERT') {
            allReactions.value = [
              ...allReactions.value,
              payload.new
            ]
          } else if (payload.eventType === 'DELETE') {
            allReactions.value = allReactions.value.filter(
              (r) => r.id !== payload.old.id
            )
          }
        }
      )
      .subscribe()
  }

  /** タイピング状態を他者へブロードキャスト */
  const handleTyping = async (isTyping) => {
    if (roomChannel)
      await roomChannel.track({
        user_name: currentUserName.value,
        isTyping
      })
  }

  /** 退室・破棄時の完全クリーンアップ */
  const cleanup = () => {
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel)
      supabase.removeChannel(reactionsChannel)
    messages.value = []
    allReactions.value = []
    isAllLoaded.value = false
    typingUsers.value = []
  }

  return {
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
  }
}
