/**
 * DeepSeek export format types (verified against a real 2026-08 export).
 *
 * Top level: array of conversations. Each conversation has a `mapping` tree
 * where every node has { id, parent, children, message }.
 * `message` = { model, inserted_at, fragments }.
 * There is NO `message.files` anymore — attachments are FILE fragments.
 */

// ---------------------------------------------------------------------------
// Raw export format (what JSON.parse of conversations.json produces)
// ---------------------------------------------------------------------------

export interface RawConversation {
  id: string;
  title: string | null;
  inserted_at: string;
  updated_at: string;
  mapping: Record<string, RawNode>;
}

export interface RawNode {
  id: string;
  parent: string | null;
  children: string[];
  message: RawMessage | null;
}

export interface RawMessage {
  model: string;
  inserted_at: string;
  fragments: RawFragment[];
}

export interface RawFragmentBase {
  type: string;
  [key: string]: unknown;
}

export type RawFragment = RawFragmentBase;

// ---------------------------------------------------------------------------
// Normalized internal model (parser output)
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string;
  insertedAt: Date;
  updatedAt: Date;
  /** all nodes keyed by id */
  nodes: Map<string, Node>;
  /** the root node (id "root"), always present after normalization */
  root: Node;
}

export interface Node {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  message: ParsedMessage | null;
}

export interface ParsedMessage {
  model: string;
  insertedAt: Date;
  fragments: ParsedFragment[];
}

export type FragmentKind = 'text' | 'file' | 'search' | 'toolOpen' | 'unknown';

export interface ParsedFragmentBase {
  kind: FragmentKind;
  type: string;
}

export interface TextFragment extends ParsedFragmentBase {
  kind: 'text';
  type: 'REQUEST' | 'RESPONSE' | 'THINK';
  content: string;
}

export interface FileEntry {
  fileId: string;
  fileName: string;
  fileSize: number;
}

export interface FileFragment extends ParsedFragmentBase {
  kind: 'file';
  type: 'FILE';
  files: FileEntry[];
}

export interface SearchResult {
  url: string;
  title: string;
}

export interface SearchFragment extends ParsedFragmentBase {
  kind: 'search';
  type: 'SEARCH' | 'TOOL_SEARCH';
  results: SearchResult[];
}

export interface ToolOpenFragment extends ParsedFragmentBase {
  kind: 'toolOpen';
  type: 'TOOL_OPEN';
}

export interface UnknownFragment extends ParsedFragmentBase {
  kind: 'unknown';
  raw: RawFragment;
}

export type ParsedFragment =
  | TextFragment
  | FileFragment
  | SearchFragment
  | ToolOpenFragment
  | UnknownFragment;

// ---------------------------------------------------------------------------
// Helper predicates
// ---------------------------------------------------------------------------

export function isText(f: ParsedFragment): f is TextFragment {
  return f.kind === 'text';
}
export function isFile(f: ParsedFragment): f is FileFragment {
  return f.kind === 'file';
}
export function isSearch(f: ParsedFragment): f is SearchFragment {
  return f.kind === 'search';
}
export function isToolOpen(f: ParsedFragment): f is ToolOpenFragment {
  return f.kind === 'toolOpen';
}
