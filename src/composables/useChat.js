import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient'

export function useChat(currentUserName) {
  const messages = ref([])
  const allReactions = ref([])
  const typingUsers = ref([])
  const allRoomUsers = ref([])
  const isAllLoaded = ref(false)
  const isFetchingOlder = ref(false)

  let roomChannel = null
  let reactionsChannel = null

  /** ルームの発言者リスト取得 */
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

  /** 履歴取得 */
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

  /** リアクション一括取得 */
  const _fetchReactionsForVisibleMessages = async () => {
    const messageIds = messages.value.map((m) => m.id)
    if (messageIds.length === 0) return
    const { data } = await supabase
      .from('reactions')
      .select('*')
      .in('message_id', messageIds)
    if (data) allReactions.value = data
  }

  /** リアルタイム設定 */
  const setupRealtime = (roomId, onNewMessage) => {
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel)
      supabase.removeChannel(reactionsChannel)

    // 1. メッセージ・Presence用
    roomChannel = supabase.channel(`room-${roomId}`)
    roomChannel
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
            if (
              !messages.value.some((m) => m.id === p.new.id)
            ) {
              messages.value = [...messages.value, p.new]
              // ★重要：メンション候補リストを更新
              if (
                !allRoomUsers.value.includes(
                  p.new.user_name
                )
              ) {
                allRoomUsers.value = [
                  ...allRoomUsers.value,
                  p.new.user_name
                ]
              }
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

    // 2. リアクション専用
    reactionsChannel = supabase.channel(
      'realtime-reactions'
    )
    reactionsChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const isVisible = messages.value.some(
              (m) => m.id === payload.new.message_id
            )
            if (isVisible) {
              allReactions.value = [
                ...allReactions.value,
                payload.new
              ]
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id
            if (deletedId) {
              allReactions.value =
                allReactions.value.filter(
                  (r) => r.id !== deletedId
                )
            }
          }
        }
      )
      .subscribe()
  }

  const handleTyping = async (isTyping) => {
    if (roomChannel)
      await roomChannel.track({
        user_name: currentUserName.value,
        isTyping
      })
  }

  const cleanup = () => {
    if (roomChannel) supabase.removeChannel(roomChannel)
    if (reactionsChannel)
      supabase.removeChannel(reactionsChannel)
    messages.value = []
    allReactions.value = []
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
