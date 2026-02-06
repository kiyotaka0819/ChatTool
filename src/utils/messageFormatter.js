/**
 * メッセージ内の特定パターン（URL、メンション等）を解析・変換するユーティリティ
 */

/** SupabaseストレージURLを検知（画像表示用） */
const STORAGE_URL_REGEX = /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g

/** メンション（@ユーザー名）を検知 */
const MENTION_REGEX = /(@[^@\s\n]+)/g

/** 一般的なURLを検知 */
const GENERAL_URL_REGEX = /(https?:\/\/[^\s]+)/g

/**
 * 本文から画像URL（Supabaseストレージ）のみを抽出
 * @param {string} content - メッセージ本文
 * @returns {Array<string>} 画像URLの配列
 */
export const extractImages = (content) => {
  if (!content) return []
  return content.match(STORAGE_URL_REGEX) || []
}

/**
 * メッセージ本文をHTML構造に変換
 * 1. 画像URLの除去（別途表示するため）
 * 2. 一般リンクのハイライト
 * 3. 存在するユーザーへのメンションをタグ化
 * * @param {string} content - 原文
 * @param {Array<string>} allUsers - ルーム内の有効なユーザー名リスト
 */
export const renderMessageHtml = (content, allUsers = []) => {
  if (!content) return ''

  // 画像URLは画像エリアで表示するため、テキストからは除去
  let text = content.replace(STORAGE_URL_REGEX, '').trim()

  // 一般リンクを<a>タグに変換
  text = text.replace(GENERAL_URL_REGEX, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`
  })

  // メンション処理：allUsersに存在する名前のみハイライト
  return text.replace(MENTION_REGEX, (match) => {
    const userName = match.slice(1)
    if (allUsers.includes(userName)) {
      return `<span class="mention-tag">${match}</span>`
    }
    return match
  })
}