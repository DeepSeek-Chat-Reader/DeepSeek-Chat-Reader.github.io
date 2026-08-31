/**
 * Parser: normalizes raw conversations.json (old AND new DeepSeek export
 * formats) into the internal model.
 *
 * Both formats share the same top-level shape; the differences live in the
 * fragment set (new: FILE / TOOL_SEARCH / TOOL_OPEN added; message.files gone).
 */
import type {
  Conversation,
  Node,
  ParsedFragment,
  ParsedMessage,
  RawConversation,
  RawFragment,
  RawMessage,
  RawNode,
  SearchFragment,
} from './types';

export class ParseError extends Error {}

/** Parse the raw JSON text of an exported conversations file. */
export function parseExport(jsonText: string): Conversation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (e) {
    throw new ParseError(`JSON 解析失败: ${(e as Error).message}`);
  }
  return normalizeExport(raw);
}

/** Normalize an already-parsed JSON value (array of conversations). */
export function normalizeExport(raw: unknown): Conversation[] {
  let list: unknown = raw;
  // Be tolerant of a wrapper object like { conversations: [...] }
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['conversations', 'data', 'items']) {
      if (Array.isArray(obj[key])) {
        list = obj[key];
        break;
      }
    }
  }
  if (!Array.isArray(list)) {
    throw new ParseError('导出文件不是会话数组（应为 conversations.json 的内容）');
  }
  const out: Conversation[] = [];
  for (const item of list) {
    const c = normalizeConversation(item);
    if (c) out.push(c);
  }
  return out;
}

function normalizeConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RawConversation>;
  if (typeof r.id !== 'string' || !r.mapping || typeof r.mapping !== 'object') {
    return null;
  }
  const nodes = new Map<string, Node>();
  let root: Node | null = null;
  for (const [key, value] of Object.entries(r.mapping)) {
    const n = normalizeNode(key, value);
    if (n) nodes.set(key, n);
  }
  const rootNode = nodes.get('root');
  if (!rootNode) {
    // No "root" key: synthesize one from a node whose parent is null.
    const orphan = [...nodes.values()].find((n) => n.parentId === null);
    if (orphan) {
      root = { id: 'root', parentId: null, childrenIds: [orphan.id], message: null };
      nodes.set('root', root);
    } else {
      return null;
    }
  } else {
    root = rootNode;
  }
  return {
    id: r.id,
    title: typeof r.title === 'string' ? r.title : '',
    insertedAt: parseDate(r.inserted_at),
    updatedAt: parseDate(r.updated_at),
    nodes,
    root,
  };
}

function normalizeNode(key: string, value: unknown): Node | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Partial<RawNode>;
  const id = typeof r.id === 'string' ? r.id : key;
  return {
    id,
    parentId: typeof r.parent === 'string' ? r.parent : null,
    childrenIds: Array.isArray(r.children)
      ? r.children.filter((c): c is string => typeof c === 'string')
      : [],
    message: r.message ? normalizeMessage(r.message) : null,
  };
}

function normalizeMessage(raw: RawMessage | null | undefined): ParsedMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const model = typeof raw.model === 'string' ? raw.model : 'unknown';
  const insertedAt = parseDate(raw.inserted_at);
  const fragments = Array.isArray(raw.fragments)
    ? raw.fragments.map(normalizeFragment).filter((f): f is ParsedFragment => f !== null)
    : [];
  return { model, insertedAt, fragments };
}

function normalizeFragment(raw: RawFragment | null | undefined): ParsedFragment | null {
  if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return null;
  const type = raw.type;
  const base = { kind: 'unknown' as const, type };
  switch (type) {
    case 'REQUEST':
    case 'RESPONSE':
    case 'THINK':
      return { kind: 'text', type, content: typeof raw.content === 'string' ? raw.content : '' };
    case 'FILE': {
      const files = Array.isArray(raw.files)
        ? raw.files
            .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
            .map((f) => ({
              fileId: typeof f.file_id === 'string' ? f.file_id : '',
              fileName: typeof f.file_name === 'string' ? f.file_name : '未知文件',
              fileSize: typeof f.file_size === 'number' ? f.file_size : 0,
            }))
        : [];
      return { kind: 'file', type, files };
    }
    case 'SEARCH':
    case 'TOOL_SEARCH': {
      const results = Array.isArray(raw.results)
        ? raw.results
            .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
            .map((r) => ({
              url: typeof r.url === 'string' ? r.url : '#',
              title: typeof r.title === 'string' ? r.title : r.url ?? '',
            }))
        : [];
      const f: SearchFragment = { kind: 'search', type, results };
      return f;
    }
    case 'TOOL_OPEN':
      return { kind: 'toolOpen', type };
    default:
      return { kind: 'unknown', type, raw: raw as RawFragment };
  }
}

function parseDate(v: unknown): Date {
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  return new Date(0);
}

/** Format a Date for display (local time, no seconds). */
export function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
