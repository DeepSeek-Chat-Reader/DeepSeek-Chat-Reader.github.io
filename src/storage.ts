/**
 * Persistence: localStorage backups, JSON export, snapshot save.
 *
 * IMPORTANT: conversations are stored in the RAW export shape (via
 * serializeConversations) and revived through the parser, because
 * JSON.stringify of the internal model would lose Map/Date structures.
 */
import type { Conversation } from './types';
import { normalizeExport } from './parser';

const STORAGE_KEY = 'deepseekConversations';

export function saveToStorage(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeConversations(conversations)));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

export function loadFromStorage(): Conversation[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeExport(JSON.parse(raw));
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
                fragments: n.message.fragments.map((f) => {
                  switch (f.kind) {
                    case 'text':
                      return { type: f.type, content: f.content };
                    case 'file':
                      return {
                        type: 'FILE',
                        files: f.files.map((x) => ({
                          file_id: x.fileId,
                          file_name: x.fileName,
                          file_size: x.fileSize,
                        })),
                      };
                    case 'search':
                      return { type: f.type, results: f.results };
                    case 'toolOpen':
                      return { type: 'TOOL_OPEN' };
                    default:
                      return f.raw;
                  }
                }),
              }
            : null,
        },
      ]),
    ),
  }));
}
