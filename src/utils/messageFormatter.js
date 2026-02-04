/**
 * SupabaseのストレージURL（chat-attachments）を検知する正規表現
 * @type {RegExp}
 */
const STORAGE_URL_REGEX = /(https?:\/\/[^\s]+chat-attachments[^\s]+)/g

/**
 * メンション（@ユーザー名）を検知する正規表現
 * @type {RegExp}
 */
const MENTION_REGEX = /(@[^@\s\n]+)/g

/**
 * 本文から画像URL（Supabaseストレージ）だけを抜き出す
 * @param {string} content
 * @returns {Array<string>}
 */
export const extractImages = (content) => {
  if (!content) return []
  return content.match(STORAGE_URL_REGEX) || []
}

/**
 * 本文をHTMLに変換する（メンションのハイライト + 画像URLの除去）
 * @param {string} content - メッセージ本文
 * @param {Array<string>} allUsers - ルーム内の全ユーザー
 * @returns {string} 
 */
export const renderMessageHtml = (content, allUsers = []) => {
  if (!content) return ''

  // 1. 画像URL部分は画像として別途表示するので、テキストからは消す
  let text = content.replace(STORAGE_URL_REGEX, '').trim()

  // 2. メンションを<span>タグに変換
  return text.replace(MENTION_REGEX, (match) => {
    const userName = match.slice(1) // @を剥がす
    if (allUsers.includes(userName)) {
      return `<span class="mention-tag">${match}</span>`
    }
    return match
  })
}