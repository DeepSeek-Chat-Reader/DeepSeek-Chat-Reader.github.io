/**
 * Persistence: localStorage backups, JSON export, snapshot save.
 */
import type { Conversation } from './types';

const STORAGE_KEY = 'deepseekConversations';

export function saveToStorage(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

export function loadFromStorage(): Conversation[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : null;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Trigger a browser download of a blob. */
export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Serialize conversations back to raw export shape. */
export function serializeConversations(conversations: Conversation[]): unknown {
  return conversations.map((c) => ({
    id: c.id,
    title: c.title,
    inserted_at: c.insertedAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
    mapping: Object.fromEntries(
      [...c.nodes.entries()].map(([id, n]) => [
        id,
        {
          id: n.id,
          parent: n.parentId,
          children: n.childrenIds,
          message: n.message
            ? {
                model: n.message.model,
                inserted_at: n.message.insertedAt.toISOString(),
                fragments: n.message.fragments.map((f) =>
                  f.kind === 'unknown' ? f.raw : f,
                ),
              }
            : null,
        },
      ]),
    ),
  }));
}
