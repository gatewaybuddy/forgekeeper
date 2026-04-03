// Shared chat state - prevents circular dependencies
// Tracks when chat is active to pause autonomous actions

let chatActiveUntil = 0;
const CHAT_COOLDOWN_MS = 30000; // Pause autonomous for 30s after chat activity

// Call this when chat activity occurs to pause autonomous actions
export function notifyChatActivity() {
  chatActiveUntil = Date.now() + CHAT_COOLDOWN_MS;
}

// Check if chat is currently active
export function isChatActive() {
  return Date.now() < chatActiveUntil;
}

// Get raw timestamp of last chat activity (for change detection)
export function getLastChatTimestamp() {
  return chatActiveUntil > 0 ? chatActiveUntil - CHAT_COOLDOWN_MS : 0;
}

export default { notifyChatActivity, isChatActive, getLastChatTimestamp };
