export type ChatMsg = { role: 'system'|'user'|'assistant'|'tool'|'developer'; content: any; [k: string]: any };

// Insert a developer note immediately before the last user message; if no user message exists,
// insert after the system message (index 1).
export function injectDeveloperNoteBeforeLastUser(messages: ChatMsg[], note: string): ChatMsg[] {
  const out = Array.isArray(messages) ? [...messages] : [];
  const idx = [...out].map((m, i) => ({ i, m })).reverse().find(x => x.m && x.m.role === 'user')?.i ?? -1;
  const dev = { role: 'developer' as const, content: note } as ChatMsg;
  if (idx >= 0) out.splice(idx, 0, dev);
  else out.splice(Math.min(1, out.length), 0, dev);
  return out;
}

