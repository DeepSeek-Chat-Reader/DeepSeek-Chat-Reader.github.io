/**
 * Sidebar: conversation list with search / date filter / sort / batch mode.
 */
import type { Conversation, Node } from '../types';
import { isText } from '../types';
import { formatDateTime } from '../parser';
import { escapeHtml } from '../citation';
import { t } from '../i18n';

export interface Filters {
  search: string;
  dateStart: Date | null;
  dateEnd: Date | null;
  sortField: 'inserted_at' | 'updated_at' | 'title';
  sortDir: 'asc' | 'desc';
}

export interface SidebarHandlers {
  onOpen: (c: Conversation) => void;
  onEditTitle: (c: Conversation, newTitle: string) => void;
  onDelete: (c: Conversation) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onBatchDelete: () => void;
}

function conversationMatchesSearch(c: Conversation, term: string): boolean {
  if (!term) return true;
  if ((c.title || '').toLowerCase().includes(term)) return true;
  for (const n of c.nodes.values()) {
    if (!n.message) continue;
    for (const f of n.message.fragments) {
      if (isText(f) && f.content.toLowerCase().includes(term)) return true;
      if (f.kind === 'search') {
        for (const r of f.results) {
          if ((r.title || '').toLowerCase().includes(term)) return true;
        }
      }
    }
  }
  return false;
}

export function filterConversations(
  list: Conversation[],
  filters: Filters,
): Conversation[] {
  const term = filters.search.trim().toLowerCase();
  const out = list.filter((c) => {
    if (filters.dateStart && c.insertedAt < filters.dateStart) return false;
    if (filters.dateEnd) {
      const end = new Date(filters.dateEnd);
      end.setHours(23, 59, 59, 999);
      if (c.insertedAt > end) return false;
    }
    if (!conversationMatchesSearch(c, term)) return false;
    return true;
  });
  const dir = filters.sortDir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    if (filters.sortField === 'title') {
      av = a.title || '';
      bv = b.title || '';
      return av.localeCompare(bv) * dir;
    }
    av = filters.sortField === 'inserted_at' ? a.insertedAt.getTime() : a.updatedAt.getTime();
    bv = filters.sortField === 'inserted_at' ? b.insertedAt.getTime() : b.updatedAt.getTime();
    return (av - bv) * dir;
  });
  return out;
}

export function renderConversationList(
  container: HTMLElement,
  conversations: Conversation[],
  filters: Filters,
  selected: Set<string>,
  batchMode: boolean,
  currentId: string | null,
  handlers: SidebarHandlers,
): void {
  container.innerHTML = '';
  if (conversations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noConversations');
    container.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const c of conversations) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    if (c.id === currentId) item.classList.add('active');
    if (batchMode) item.classList.add('batch-mode');
    item.dataset.id = c.id;

    const checkbox = batchMode
      ? `<input type="checkbox" class="batch-select-checkbox" ${selected.has(c.id) ? 'checked' : ''} aria-label="${escapeHtml(c.title || '')}">`
      : '';

    item.innerHTML = `
      ${checkbox}
      <div class="conversation-title" title="${escapeHtml(c.title || t('noTitle'))}">${escapeHtml(c.title || t('noTitle'))}</div>
      <div class="conversation-time">${escapeHtml(formatDateTime(c.insertedAt))}</div>
      <div class="conversation-actions">
        <button class="edit-conversation-btn" title="${escapeHtml(t('editTitle'))}"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="delete-conversation-btn btn-danger" title="${escapeHtml(t('deleteConversation'))}"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (batchMode) {
        handlers.onToggleSelect(c.id);
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest('.edit-conversation-btn')) {
        startInlineEdit(item.querySelector('.conversation-title') as HTMLElement, c, handlers);
        return;
      }
      if (target.closest('.delete-conversation-btn')) {
        handlers.onDelete(c);
        return;
      }
      handlers.onOpen(c);
    });
    frag.appendChild(item);
  }
  container.appendChild(frag);
}

function startInlineEdit(
  titleEl: HTMLElement,
  c: Conversation,
  handlers: SidebarHandlers,
): void {
  const original = c.title || t('noTitle');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = original;
  titleEl.innerHTML = '';
  titleEl.appendChild(input);
  input.focus();
  const finish = (save: boolean) => {
    if (save) {
      const v = input.value.trim();
      handlers.onEditTitle(c, v || original);
    } else {
      titleEl.textContent = original;
    }
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') {
      finish(false);
      input.blur();
    }
  });
}
