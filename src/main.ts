/**
 * App entry: state, event wiring, rendering orchestration.
 */
import './styles/main.css';
import './styles/print.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import type { Conversation } from './types';
import { pathToNode, walkBranch } from './model';
import { normalizeExport, formatDateTime, ParseError } from './parser';
import { t, setLanguage, getLanguage, applyTranslations } from './i18n';
import { filterConversations, renderConversationList, type Filters, type SidebarHandlers } from './ui/sidebar';
import { renderDetail } from './ui/detail';
import { initTheme, toggleTheme, updateThemeButton, currentTheme } from './ui/theme';
import { saveToStorage, loadFromStorage, clearStorage, download, serializeConversations } from './storage';

const LAST_UPDATED = '2026-08-31';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  conversations: Conversation[];
  filters: Filters;
  current: Conversation | null;
  currentId: string | null;
  branchPath: Map<string, number>;
  batchMode: boolean;
  selected: Set<string>;
}

const state: AppState = {
  conversations: [],
  filters: {
    search: '',
    dateStart: null,
    dateEnd: null,
    sortField: 'inserted_at',
    sortDir: 'desc',
  },
  current: null,
  currentId: null,
  branchPath: new Map(),
  batchMode: false,
  selected: new Set(),
};

function defaultBranch(): 'first' | 'last' {
  const el = document.getElementById('defaultBranchDisplay') as HTMLSelectElement | null;
  return el?.value === 'last' ? 'last' : 'first';
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loading = () => $('loading');
const conversationsContainer = () => $('conversationsContainer');
const detailContainer = () => $('conversationDetailContainer');

function showLoading(): void {
  loading().classList.add('show');
}
function hideLoading(): void {
  loading().classList.remove('show');
}

// ---------------------------------------------------------------------------
// Loading / parsing
// ---------------------------------------------------------------------------

function loadData(conversations: Conversation[]): void {
  state.conversations = conversations;
  state.current = null;
  state.currentId = null;
  state.branchPath = new Map();
  state.selected = new Set();
  if (conversations.length > 0) {
    const sorted = filterConversations(conversations, { ...state.filters, search: '' });
    if (sorted.length > 0) {
      // select the first conversation for the list info panel without opening it
      state.currentId = sorted[0].id;
      updateInfoPanel(sorted[0]);
    }
  }
  refreshList();
  setView('list');
  saveToStorage(conversations);
  hideLoading();
  closeUploadModal();
}

function parseAndLoad(jsonText: string): void {
  showLoading();
  setTimeout(() => {
    try {
      const convs = normalizeExport(JSON.parse(jsonText));
      if (convs.length === 0) throw new ParseError('未解析到任何会话');
      loadData(convs);
    } catch (e) {
      hideLoading();
      alert(e instanceof ParseError ? e.message : t('jsonParseError') + (e as Error).message);
    }
  }, 30);
}

function readFile(file: File): void {
  if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
    alert(t('invalidFileType'));
    return;
  }
  showLoading();
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    parseAndLoad(text);
  };
  reader.onerror = () => {
    hideLoading();
    alert(t('fileReadError'));
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------

function refreshList(): void {
  const filtered = filterConversations(state.conversations, state.filters);
  renderConversationList(
    conversationsContainer(),
    filtered,
    state.filters,
    state.selected,
    state.batchMode,
    state.currentId,
    sidebarHandlers,
  );
  const stats = $('searchStats');
  const count = $('conversationCount');
  stats.textContent = t('searchResults', { count: filtered.length });
  count.textContent = t('conversationCount', { count: filtered.length });
  renderTableList(filtered);
}

const sidebarHandlers: SidebarHandlers = {
  onOpen: openConversation,
  onEditTitle: (c, title) => {
    c.title = title;
    if (state.currentId === c.id) {
      renderCurrent();
      updateInfoPanel(c);
    }
    refreshList();
    saveToStorage(state.conversations);
  },
  onDelete: (c) => {
    if (!confirm(t('confirmDeleteConversation'))) return;
    state.conversations = state.conversations.filter((x) => x.id !== c.id);
    if (state.currentId === c.id) {
      state.current = null;
      state.currentId = null;
      renderEmptyDetail();
    }
    refreshList();
    updateInfoPanel(findSelectedConversation());
    saveToStorage(state.conversations);
  },
  onToggleSelect: (id) => {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    refreshList();
  },
  onSelectAll: () => {
    const filtered = filterConversations(state.conversations, state.filters);
    state.selected = new Set(filtered.map((c) => c.id));
    refreshList();
  },
  onInvertSelection: () => {
    const filtered = filterConversations(state.conversations, state.filters);
    const ids = new Set(filtered.map((c) => c.id));
    state.selected = new Set(
      [...ids].filter((id) => !state.selected.has(id)).concat([...state.selected].filter((id) => !ids.has(id))),
    );
    refreshList();
  },
  onBatchDelete: () => {
    const n = state.selected.size;
    if (n === 0) return;
    if (!confirm(t('confirmBatchDelete', { count: n }))) return;
    state.conversations = state.conversations.filter((c) => !state.selected.has(c.id));
    if (state.currentId && state.selected.has(state.currentId)) {
      state.current = null;
      state.currentId = null;
      renderEmptyDetail();
    }
    state.selected = new Set();
    refreshList();
    updateInfoPanel(findSelectedConversation());
    saveToStorage(state.conversations);
  },
};

// ---------------------------------------------------------------------------
// Full-page conversation list (table view)
// ---------------------------------------------------------------------------

interface ConvStats {
  turns: number;
  messages: number;
  chars: number;
}

function convStats(c: Conversation): ConvStats {
  let turns = 0;
  let messages = 0;
  let chars = 0;
  for (const n of c.nodes.values()) {
    if (!n.message) continue;
    messages++;
    const types = n.message.fragments.map((f) => f.type);
    if (types.includes('REQUEST') || types.includes('FILE')) turns++;
    for (const f of n.message.fragments) {
      if (f.kind === 'text') chars += f.content.length;
    }
  }
  return { turns, messages, chars };
}

/** Sync the table toolbar batch buttons with state.batchMode. */
function setTableBatchButtons(): void {
  $('tableBatchBtn').hidden = state.batchMode;
  $('tableSelectAllBtn').hidden = !state.batchMode;
  $('tableInvertBtn').hidden = !state.batchMode;
  $('tableDeleteBtn').hidden = !state.batchMode;
  $('tableCancelBtn').hidden = !state.batchMode;
}

/** Reflect the current sort field/direction in the table toolbar controls. */
function syncTableSortUI(): void {
  const sel = $('tableSortField') as HTMLSelectElement;
  sel.value = state.filters.sortField;
  const btn = $('tableSortDirBtn');
  const asc = state.filters.sortDir === 'asc';
  btn.classList.toggle('active', asc);
  const icon = btn.querySelector('i');
  if (icon) icon.className = asc ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short';
  const span = btn.querySelector('span');
  if (span) span.textContent = t(asc ? 'ascending' : 'descending');
}

/** local yyyy-mm-dd for <input type="date"> */
function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ↑/↓ marker on the currently sorted table column header. */
function refreshSortIndicators(): void {
  document
    .querySelectorAll<HTMLTableCellElement>('#tablePanel thead th[data-sort]')
    .forEach((th) => {
      let arrow = th.querySelector<HTMLElement>('.sort-arrow');
      if (!arrow) {
        arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        th.appendChild(arrow);
      }
      arrow.textContent =
        state.filters.sortField === th.dataset.sort
          ? state.filters.sortDir === 'asc'
            ? '↑'
            : '↓'
          : '';
    });
}

/** Sync the table toolbar controls (search / dates / sort) with state. */
function syncTableFiltersUI(): void {
  ($('tableSearchInput') as HTMLInputElement).value = state.filters.search;
  const dateIn = (id: string, fallbackId: string, d: Date | null) => {
    const el = $(id) as HTMLInputElement;
    if (d) el.value = toDateInput(d);
    else el.value = ($(fallbackId) as HTMLInputElement).value || '';
  };
  dateIn('tableStartDate', 'filterStartDate', state.filters.dateStart);
  dateIn('tableEndDate', 'filterEndDate', state.filters.dateEnd);
  syncTableSortUI();
  refreshSortIndicators();
}

let colResizeActive = false;

/** Drag the right edge of a table header to resize that column.
 *  A real drag needs >= 4px movement — otherwise the gesture is a plain
 *  header click (sort). Widths are applied as percentages of the table so the
 *  layout doesn't jump while dragging, and the click that follows a real drag
 *  is suppressed. */
function bindTableColumnResize(): void {
  const thead = $('tablePanel').querySelector('thead')!;
  const table = $('tablePanel').querySelector<HTMLTableElement>('.conv-table')!;
  let drag:
    | {
        th: HTMLTableCellElement;
        startX: number;
        startW: number;
        tableW: number;
        moved: boolean;
      }
    | null = null;
  thead.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const th = (e.target as HTMLElement).closest('th') as HTMLTableCellElement | null;
    if (!th || th.classList.contains('col-check') || th.classList.contains('col-actions')) return;
    const rect = th.getBoundingClientRect();
    if (rect.right - e.clientX > 6) return; // only within the right-edge grip
    e.preventDefault();
    const tableRect = table.getBoundingClientRect();
    drag = {
      th,
      startX: e.clientX,
      startW: parseFloat(getComputedStyle(th).width) || 0,
      tableW: tableRect.width || 1,
      moved: false,
    };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 4) return; // not a drag yet — allow sort click
    if (!drag.moved) {
      drag.moved = true;
      colResizeActive = true;
      document.body.classList.add('col-resizing');
      table.classList.add('resizing-col');
    }
    const px = Math.min(900, Math.max(48, drag.startW + dx));
    const pct = Math.min(90, Math.max(5, (px / drag.tableW) * 100));
    drag.th.style.width = `${pct.toFixed(2)}%`;
  });
  window.addEventListener('pointerup', () => {
    if (drag?.moved) {
      // swallow the click event that follows the drag (would sort the column)
      window.setTimeout(() => {
        colResizeActive = false;
        document.body.classList.remove('col-resizing');
        table.classList.remove('resizing-col');
      }, 0);
    } else {
      colResizeActive = false;
      document.body.classList.remove('col-resizing');
      table.classList.remove('resizing-col');
    }
    drag = null;
  });
  window.addEventListener('pointercancel', () => {
    drag = null;
    colResizeActive = false;
    document.body.classList.remove('col-resizing');
    table.classList.remove('resizing-col');
  });
}

/** Per-conversation hit info for the table search (matches sidebar filter). */
function conversationHitInfo(c: Conversation, term: string): { count: number; contexts: string[] } {
  const q = term.toLowerCase();
  let count = 0;
  const contexts: string[] = [];
  const scan = (content: string) => {
    const lower = content.toLowerCase();
    let i = lower.indexOf(q);
    const win = 30;
    while (i !== -1) {
      count++;
      if (contexts.length < 8) {
        const start = Math.max(0, i - win);
        const end = Math.min(content.length, i + q.length + win);
        let pre = content.slice(start, i);
        let post = content.slice(i + q.length, end);
        if (start > 0) pre = '…' + pre.slice(Math.max(0, pre.length - (win - 1)));
        if (end < content.length) post = post.slice(0, Math.max(0, win - 1)) + '…';
        contexts.push(pre + content.slice(i, i + q.length) + post);
      }
      i = lower.indexOf(q, i + Math.max(1, q.length));
    }
  };
  for (const n of c.nodes.values()) {
    if (!n.message) continue;
    for (const f of n.message.fragments) {
      if (f.kind === 'text') scan(f.content);
      else if (f.kind === 'search') for (const r of f.results) scan(r.title);
    }
  }
  return { count, contexts };
}

/** Rebuild the full-page table rows (Explorer-like columns). */
function renderTableList(list: Conversation[]): void {
  if (currentView !== 'list' || !listIsTable()) return;
  const tbody = $('tableBody');
  if (!tbody) return;
  $('tableStats').textContent = t('conversationCount', { count: list.length });
  refreshSortIndicators();
  tbody.innerHTML = '';
  const table = $('tablePanel').querySelector('.conv-table');
  const term = state.filters.search.trim();
  const searching = term.length > 0;
  table?.classList.toggle('searching', searching);

  for (const c of list) {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.classList.toggle('active', state.currentId === c.id);

    const checkTd = document.createElement('td');
    checkTd.className = 'col-check';
    if (state.batchMode) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selected.has(c.id);
      cb.addEventListener('change', () => sidebarHandlers.onToggleSelect(c.id));
      checkTd.appendChild(cb);
    }
    tr.appendChild(checkTd);

    const titleText = c.title || t('noTitle');
    const titleTd = document.createElement('td');
    titleTd.className = 'col-title';
    titleTd.textContent = titleText;
    titleTd.title = titleText;
    tr.appendChild(titleTd);

    const startTd = document.createElement('td');
    startTd.textContent = formatDateTime(c.insertedAt);
    tr.appendChild(startTd);
    const endTd = document.createElement('td');
    endTd.textContent = formatDateTime(c.updatedAt);
    tr.appendChild(endTd);

    const s = convStats(c);
    const turnsTd = document.createElement('td');
    turnsTd.textContent = String(s.turns);
    tr.appendChild(turnsTd);
    const charsTd = document.createElement('td');
    charsTd.textContent = s.chars.toLocaleString();
    tr.appendChild(charsTd);

    const hits = searching ? conversationHitInfo(c, term) : null;
    const hitsTd = document.createElement('td');
    hitsTd.className = 'col-hits';
    hitsTd.textContent = hits ? String(hits.count) : '';
    tr.appendChild(hitsTd);

    const actTd = document.createElement('td');
    actTd.className = 'col-actions';
    const openBtn = document.createElement('button');
    openBtn.textContent = t('openConversation');
    openBtn.addEventListener('click', () => openConversation(c));
    const delBtn = document.createElement('button');
    delBtn.textContent = t('deleteConversation');
    delBtn.className = 'btn-danger';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebarHandlers.onDelete(c);
    });
    actTd.append(openBtn, delBtn);
    tr.appendChild(actTd);

    tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button,input')) return;
      if (state.batchMode) sidebarHandlers.onToggleSelect(c.id);
      else openConversation(c);
    });
    tbody.appendChild(tr);

    // Snippet row(s) under this conversation while searching
    if (hits && hits.contexts.length > 0) {
      const sub = document.createElement('tr');
      sub.className = 'hit-snippet-row';
      const subTd = document.createElement('td');
      subTd.colSpan = 8;
      const box = document.createElement('div');
      box.className = 'hit-snippets';
      for (const ctx of hits.contexts) {
        const line = document.createElement('div');
        line.className = 'hit-snippet';
        const at = ctx.indexOf(term);
        if (at >= 0) {
          line.append(document.createTextNode(ctx.slice(0, at)));
          const m = document.createElement('mark');
          m.textContent = ctx.slice(at, at + term.length);
          line.append(m, document.createTextNode(ctx.slice(at + term.length)));
        } else {
          line.textContent = ctx;
        }
        box.appendChild(line);
      }
      if (hits.count > hits.contexts.length) {
        const more = document.createElement('div');
        more.className = 'hit-snippet-more';
        more.textContent = t('searchMoreHits', { more: hits.count - hits.contexts.length });
        box.appendChild(more);
      }
      subTd.appendChild(box);
      sub.appendChild(subTd);
      tbody.appendChild(sub);
    }
  }
}

// ---------------------------------------------------------------------------
// Detail rendering
// ---------------------------------------------------------------------------

function openConversation(c: Conversation): void {
  state.current = c;
  state.currentId = c.id;
  state.branchPath = new Map();
  updateInfoPanel(c);
  renderCurrent();
  refreshList();
  clearContentSearch();
  $('contentArea').classList.remove('collapsed');
  setView('content');
  document.documentElement.scrollTop = 0;
}

/** (removed) list-info detail panel — wide list is the table view now, and
 *  conversation details are shown by the hover card instead. Kept as a no-op
 *  so old call sites don't need touching. */
function updateInfoPanel(_c: Conversation | null): void {
  return;
}

function renderCurrent(): void {
  if (!state.current) {
    renderEmptyDetail();
    return;
  }
  renderDetail(detailContainer(), state.current, state.branchPath, defaultBranch(), {
    onEditTitle: (c, title) => {
      c.title = title;
      renderCurrent();
      refreshList();
      saveToStorage(state.conversations);
    },
    onDeleteConversation: sidebarHandlers.onDelete,
    onDeleteBranch: (c, nodeId, branchIndex) => {
      if (!confirm(t('confirmDeleteBranch'))) return;
      const node = c.nodes.get(nodeId);
      if (!node) return;
      node.childrenIds.splice(branchIndex, 1);
      if (node.childrenIds.length === 0) c.nodes.delete(nodeId);
      renderCurrent();
      saveToStorage(state.conversations);
    },
    onBranchChange: (nodeId, branchIndex) => {
      state.branchPath.set(nodeId, branchIndex);
      renderCurrent();
    },
  });
  // Keep in-conversation highlights visible across re-renders.
  ensureContentSearchAfterRender();
}

function renderEmptyDetail(): void {
  detailContainer().innerHTML = `
    <div class="detail-empty">
      <i class="fa-regular fa-comment-dots"></i>
      <p>${escapeText(t('selectConversation'))}</p>
    </div>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Batch UI
// ---------------------------------------------------------------------------

function setBatchButtons(): void {
  $('batchSelectBtn').hidden = state.batchMode;
  $('batchSelectAllBtn').hidden = !state.batchMode;
  $('batchInvertBtn').hidden = !state.batchMode;
  $('batchDeleteBtn').hidden = !state.batchMode;
  $('batchCancelBtn').hidden = !state.batchMode;
}

function enterBatchMode(): void {
  state.batchMode = true;
  setBatchButtons();
  setTableBatchButtons();
  refreshList();
}

function exitBatchMode(): void {
  state.batchMode = false;
  state.selected = new Set();
  setBatchButtons();
  setTableBatchButtons();
  refreshList();
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function openUploadModal(): void {
  $('uploadModal').classList.add('active');
  $('modalOverlay').classList.add('active');
}
function closeUploadModal(): void {
  $('uploadModal').classList.remove('active');
  $('modalOverlay').classList.remove('active');
}
function openSaveModal(): void {
  $('saveModal').classList.add('active');
  $('saveModalOverlay').classList.add('active');
}
function closeSaveModal(): void {
  $('saveModal').classList.remove('active');
  $('saveModalOverlay').classList.remove('active');
}

// ---------------------------------------------------------------------------
// Views (two-page layout: list page / reading page)
// ---------------------------------------------------------------------------

let currentView: 'list' | 'content' = 'list';
let outlinePinned = false;
let outlineHideTimer: number | undefined;
/** Pin the conversation sidebar open while reading (正文视图). */
let sidebarPinned = false;

/** Wide screens show the list page as the full table; phones use compact cards. */
function listIsTable(): boolean {
  return window.innerWidth > 900;
}

/** Hover-capable pointer (mouse/trackpad). Touch devices never auto-reveal. */
const canHover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;

function setView(view: 'list' | 'content'): void {
  currentView = view;
  document.body.classList.toggle('view-list', view === 'list');
  document.body.classList.toggle('view-content', view === 'content');
  document.body.classList.remove('peek-list');
  if (view === 'list') {
    sidebarPinned = false;
    document.body.classList.remove('pin-list');
    updateSidebarButton();
  }
  updateViewButtons();
  if (view === 'content') clearContentSearch();
}

/** Single dynamic view button: reading ⇄ list (label says where it goes). */
function updateViewButtons(): void {
  const btn = $('viewToggleBtn');
  const icon = btn.querySelector('i');
  const span = btn.querySelector('span');
  if (icon) icon.className = currentView === 'content' ? 'fa-solid fa-table-list' : 'fa-regular fa-file-lines';
  if (span) span.textContent = currentView === 'content' ? t('tableView') : t('viewContent');
}

/** Pin/unpin the conversation sidebar while reading (independent of hover). */
function updateSidebarButton(): void {
  const btn = $('sidebarToggleBtn');
  btn.classList.toggle('active', sidebarPinned);
}

function toggleOutline(): void {
  outlinePinned = !outlinePinned;
  $('outlineSidebar').classList.toggle('collapsed', !outlinePinned);
  updateOutlineButton();
}

function updateOutlineButton(): void {
  $('toggleOutlineBtn').innerHTML = `<i class="fa-solid fa-list-ol"></i> <span>${escapeText(outlinePinned ? t('collapseOutline') : t('outline'))}</span>`;
}

/** Hover the left/right edge ribbons to peek list/outline (toggleable in settings). */
function bindEdgeRibbons(): void {
  const revealEnabled = () => canHover && localStorage.getItem('dscr-edge-reveal') !== '0';

  // Left ribbon: peek the list from the reading view (wide screens)
  const sRibbon = $('sidebarRibbon');
  const sidebar = $('sidebar');
  if (canHover) {
    sRibbon.addEventListener('mouseenter', () => {
      if (!revealEnabled() || currentView !== 'content') return;
      document.body.classList.add('peek-list');
    });
  }
  sidebar.addEventListener('mouseleave', () => {
    if (currentView !== 'content' || sidebarPinned) return;
    document.body.classList.remove('peek-list');
  });
  // Click/tap on the ribbon toggles the peek manually — the only way to reveal
  // the list on touch devices (hover auto-reveal is off there to avoid
  // accidental opens).
  sRibbon.addEventListener('click', () => {
    if (currentView !== 'content') return;
    document.body.classList.toggle('peek-list');
  });
  // Clicking anywhere outside the peeked sidebar closes it (matters on touch) —
  // but never while it is pinned open.
  document.addEventListener('pointerdown', (e) => {
    if (currentView !== 'content' || sidebarPinned) return;
    if (!sidebar.contains(e.target as Node) && e.target !== sRibbon) {
      document.body.classList.remove('peek-list');
    }
  });

  // Right ribbon -> outline
  const ribbon = $('outlineRibbon');
  const outlineSidebar = $('outlineSidebar');
  if (canHover) {
    ribbon.addEventListener('mouseenter', () => {
      if (!revealEnabled()) return;
      window.clearTimeout(outlineHideTimer);
      outlineSidebar.classList.remove('collapsed');
    });
    outlineSidebar.addEventListener('mouseenter', () => window.clearTimeout(outlineHideTimer));
    outlineSidebar.addEventListener('mouseleave', () => {
      if (outlinePinned || !revealEnabled()) return;
      outlineHideTimer = window.setTimeout(() => {
        if (!outlinePinned) outlineSidebar.classList.add('collapsed');
      }, 250);
    });
  }
  ribbon.addEventListener('click', () => {
    outlineSidebar.classList.toggle('collapsed');
  });
}

function resetAll(): void {
  if (!confirm(t('confirmReset'))) return;
  state.conversations = [];
  state.current = null;
  state.currentId = null;
  state.branchPath = new Map();
  state.selected = new Set();
  state.filters = { ...state.filters, search: '' };
  ($('searchInput') as HTMLInputElement).value = '';
  clearStorage();
  refreshList();
  renderEmptyDetail();
  openUploadModal();
}

function printPage(): void {
  window.print();
}

// ---------------------------------------------------------------------------
// Print modal (expand-thinking option)
// ---------------------------------------------------------------------------

function openPrintModal(): void {
  ($('printThinkCheck') as HTMLInputElement).checked = localStorage.getItem('dscr-print-think') !== '0';
  ($('printSearchCheck') as HTMLInputElement).checked = localStorage.getItem('dscr-print-search') !== '0';
  $('printModal').classList.add('active');
  $('printModalOverlay').classList.add('active');
}

function closePrintModal(): void {
  $('printModal').classList.remove('active');
  $('printModalOverlay').classList.remove('active');
}

async function doPrint(): Promise<void> {
  const expandThink = ($('printThinkCheck') as HTMLInputElement).checked;
  const expandSearch = ($('printSearchCheck') as HTMLInputElement).checked;
  localStorage.setItem('dscr-print-think', expandThink ? '1' : '0');
  localStorage.setItem('dscr-print-search', expandSearch ? '1' : '0');
  document.documentElement.classList.toggle('print-expand-think', expandThink);
  document.documentElement.classList.toggle('print-expand-search', expandSearch);
  closePrintModal();

  // Force-open <details> for printing (CSS alone is unreliable in some
  // browsers) and restore their previous state after the print dialog closes.
  const opened: HTMLDetailsElement[] = [];
  const openIfClosed = (sel: string) => {
    document.querySelectorAll<HTMLDetailsElement>(sel).forEach((el) => {
      if (!el.open) {
        el.open = true;
        opened.push(el);
      }
    });
  };
  if (expandThink) openIfClosed('details.think-block');
  if (expandSearch) openIfClosed('details.search-block');
  window.addEventListener(
    'afterprint',
    () => {
      opened.forEach((d) => {
        d.open = false;
      });
    },
    { once: true },
  );
  // Let async renders (MathJax / mermaid) and the forced-open details settle
  // so the print engine measures the final layout.
  await new Promise((r) => setTimeout(r, 300));
  window.print();
}

// ---------------------------------------------------------------------------
// Save handlers
// ---------------------------------------------------------------------------

function saveAsJson(): void {
  if (state.conversations.length === 0) {
    alert(t('noConversationsToSave'));
    return;
  }
  const json = JSON.stringify(serializeConversations(state.conversations), null, 2);
  download('EditedConversations.json', new Blob([json], { type: 'application/json' }));
  closeSaveModal();
}

/** Snapshot: current reader page, optionally with conversations embedded. */
function saveSnapshot(embedData: boolean, filename: string): void {
  let html = document.documentElement.outerHTML;
  if (embedData) {
    const data = JSON.stringify(serializeConversations(state.conversations));
    const tag = `<script id="embedded-data" type="application/json">${data.replace(/<\/script>/g, '<\\/script>')}<\/script>`;
    html = html.replace('</head>', `${tag}</head>`);
  }
  download(filename, new Blob([html], { type: 'text/html' }));
  closeSaveModal();
}

/** On startup: load data embedded in the snapshot (if any). */
function tryLoadEmbeddedData(): boolean {
  const el = document.getElementById('embedded-data');
  if (!el || !el.textContent) return false;
  try {
    const convs = normalizeExport(JSON.parse(el.textContent));
    if (convs.length > 0) {
      loadData(convs);
      return true;
    }
  } catch (e) {
    console.warn('embedded data parse failed', e);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function bindEvents(): void {
  // Upload modal
  $('uploadModalBtn').addEventListener('click', openUploadModal);
  $('closeModal').addEventListener('click', closeUploadModal);
  $('modalOverlay').addEventListener('click', closeUploadModal);
  const dropZone = $('dropZone');
  const fileInput = $('fileInput') as HTMLInputElement;
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }),
  );
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) readFile(file);
    fileInput.value = '';
  });
  $('parseButton').addEventListener('click', () => {
    const text = ($('jsonInput') as HTMLTextAreaElement).value.trim();
    if (!text) {
      alert(t('noJSONContent'));
      return;
    }
    parseAndLoad(text);
  });

  // Save modal
  $('saveBtn').addEventListener('click', openSaveModal);
  $('closeSaveModal').addEventListener('click', closeSaveModal);
  $('saveModalOverlay').addEventListener('click', closeSaveModal);
  $('saveJsonBtn').addEventListener('click', saveAsJson);
  $('saveHtmlBtn').addEventListener('click', () => saveSnapshot(true, 'ExportConversations.html'));
  $('saveOfflineBtn').addEventListener('click', () => saveSnapshot(false, 'DeepSeek-Chat-Reader.html'));
  $('saveOriginalBtn').addEventListener('click', () => window.open('https://github.com/DeepSeek-Chat-Reader/DeepSeek-Chat-Reader.github.io/releases/latest', '_blank'));
  $('saveOriginalGiteeBtn').addEventListener('click', () => window.open('https://gitee.com/Short_Arm_Ape/DeepSeek-Chat-Reader/releases/latest', '_blank'));

  // Header buttons
  $('themeToggle').addEventListener('click', () => {
    toggleTheme();
  });
  $('toggleOutlineBtn').addEventListener('click', toggleOutline);
  $('collapseOutlineBtn').addEventListener('click', toggleOutline);
  bindEdgeRibbons();
  $('printBtn').addEventListener('click', openPrintModal);
  $('doPrintBtn').addEventListener('click', doPrint);
  $('closePrintModal').addEventListener('click', closePrintModal);
  $('printModalOverlay').addEventListener('click', closePrintModal);
  $('resetBtn').addEventListener('click', resetAll);
  $('batchSelectBtn').addEventListener('click', enterBatchMode);
  $('batchCancelBtn').addEventListener('click', exitBatchMode);
  $('batchSelectAllBtn').addEventListener('click', () => sidebarHandlers.onSelectAll());
  $('batchInvertBtn').addEventListener('click', () => sidebarHandlers.onInvertSelection());
  $('batchDeleteBtn').addEventListener('click', () => sidebarHandlers.onBatchDelete());

  // Settings
  $('settingsBtn').addEventListener('click', () => {
    const edgeCheck = $('edgeRevealCheck') as HTMLInputElement;
    // Touch devices: hover-reveal is unavailable -> checkbox off & disabled.
    edgeCheck.checked = canHover && localStorage.getItem('dscr-edge-reveal') !== '0';
    edgeCheck.disabled = !canHover;
    ($('hcCheck') as HTMLInputElement).checked = document.documentElement.hasAttribute('data-hc');
    $('settingsModal').classList.add('active');
    $('settingsModalOverlay').classList.add('active');
  });
  $('closeSettingsModal').addEventListener('click', () => {
    $('settingsModal').classList.remove('active');
    $('settingsModalOverlay').classList.remove('active');
  });
  $('settingsModalOverlay').addEventListener('click', () => {
    $('settingsModal').classList.remove('active');
    $('settingsModalOverlay').classList.remove('active');
  });
  $('edgeRevealCheck').addEventListener('change', (e) => {
    localStorage.setItem('dscr-edge-reveal', (e.target as HTMLInputElement).checked ? '1' : '0');
  });
  $('hcCheck').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    applyHighContrast(on);
    localStorage.setItem('dscr-hc', on ? '1' : '0');
  });
  $('fontResetBtn').addEventListener('click', () => {
    localStorage.removeItem('dscr-font-scale');
    applyFontScale('1');
  });

  // Language (button + modal)
  const applyLang = (lang: string) => {
    // Session-only choice: never persisted (user request) — every load starts
    // fresh from the browser/OS language.
    document.documentElement.setAttribute('lang', lang);
    markLanguageSelection(lang);
    setLanguage(lang);
    applyTranslations();
    updateThemeButton();
    updateOutlineButton();
    updateViewButtons();
    renderCurrent();
    refreshList();
    updateInfoPanel(state.current ?? findSelectedConversation());
    $('languageModal').classList.remove('active');
    $('languageModalOverlay').classList.remove('active');
  };
  $('languageBtn').addEventListener('click', () => {
    markLanguageSelection(getLanguage());
    $('languageModal').classList.add('active');
    $('languageModalOverlay').classList.add('active');
  });
  $('closeLanguageModal').addEventListener('click', () => {
    $('languageModal').classList.remove('active');
    $('languageModalOverlay').classList.remove('active');
  });
  $('languageModalOverlay').addEventListener('click', () => {
    $('languageModal').classList.remove('active');
    $('languageModalOverlay').classList.remove('active');
  });
  $('langZhBtn').addEventListener('click', () => applyLang('zh-CN'));
  $('langEnBtn').addEventListener('click', () => applyLang('en'));

  // Single view toggle: 列表视图 (list page) ⇄ 正文视图 (reading page).
  // The wide list page IS the full-page table; phones show the compact cards.
  $('viewToggleBtn').addEventListener('click', () => {
    if (currentView === 'content') {
      setView('list');
      refreshList();
    } else if (state.current) {
      setView('content');
    }
  });
  $('contentBackBtn').addEventListener('click', () => {
    setView('list');
    refreshList();
  });
  // Pin the conversation sidebar open while reading (independent of hover)
  $('sidebarToggleBtn').addEventListener('click', () => {
    sidebarPinned = !sidebarPinned;
    document.body.classList.toggle('pin-list', sidebarPinned);
    updateSidebarButton();
  });

  // Table view toolbar: search / sort / batch
  const tableSearch = $('tableSearchInput') as HTMLInputElement;
  let tableSearchTimer: number | undefined;
  tableSearch.addEventListener('input', () => {
    window.clearTimeout(tableSearchTimer);
    tableSearchTimer = window.setTimeout(() => {
      state.filters.search = tableSearch.value;
      refreshList();
    }, 200);
  });
  ($('tableSortField') as HTMLSelectElement).addEventListener('change', (e) => {
    state.filters.sortField = (e.target as HTMLSelectElement).value as Filters['sortField'];
    syncTableSortUI();
    refreshList();
  });
  $('tableSortDirBtn').addEventListener('click', () => {
    state.filters.sortDir = state.filters.sortDir === 'asc' ? 'desc' : 'asc';
    syncTableSortUI();
    refreshList();
  });

  // Table: click column headers to sort (click again to reverse)
  $('tablePanel').querySelector('thead')!.addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest('th[data-sort]') as HTMLTableCellElement | null;
    if (!th || colResizeActive) return;
    const field = th.dataset.sort as Filters['sortField'];
    if (field === state.filters.sortField) {
      state.filters.sortDir = state.filters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.filters.sortField = field;
      state.filters.sortDir = 'asc';
    }
    syncTableSortUI();
    refreshList();
  });

  // Table: date-range filters (same semantics as the sidebar filters)
  ($('tableStartDate') as HTMLInputElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    state.filters.dateStart = v ? new Date(v) : null;
    refreshList();
  });
  ($('tableEndDate') as HTMLInputElement).addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    state.filters.dateEnd = v ? new Date(v) : null;
    refreshList();
  });

  // Table: drag column header edges to resize column widths
  bindTableColumnResize();
  $('tableBatchBtn').addEventListener('click', enterBatchMode);
  $('tableSelectAllBtn').addEventListener('click', () => sidebarHandlers.onSelectAll());
  $('tableInvertBtn').addEventListener('click', () => sidebarHandlers.onInvertSelection());
  $('tableDeleteBtn').addEventListener('click', () => sidebarHandlers.onBatchDelete());
  $('tableCancelBtn').addEventListener('click', exitBatchMode);

  // Font size steppers (A− / A+), always available
  $('fontDecBtn').addEventListener('click', () => adjustFont(-0.125));
  $('fontIncBtn').addEventListener('click', () => adjustFont(0.125));

  // Hover details card (wide + mouse) and wide<->narrow adaptation
  bindConvHover();
  bindViewportAdapt();

  // Filters collapse (list page)
  $('filterToggle').addEventListener('click', () => {
    $('searchFilters').classList.toggle('collapsed');
  });

  // In-conversation search (reading view): live across all branches, with
  // ↑/↓ navigation between hits.
  const mobileSearch = $('mobileSearchInput') as HTMLInputElement;
  let mobileSearchTimer: number | undefined;
  mobileSearch.addEventListener('input', () => {
    window.clearTimeout(mobileSearchTimer);
    mobileSearchTimer = window.setTimeout(() => {
      runContentSearch(mobileSearch.value.trim());
    }, 200);
  });
  mobileSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepContentMatch(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      clearContentSearch();
      mobileSearch.blur();
    }
  });
  $('contentSearchNext').addEventListener('click', () => stepContentMatch(1));
  $('contentSearchPrev').addEventListener('click', () => stepContentMatch(-1));
  $('contentSearchClear').addEventListener('click', clearContentSearch);

  // Filters
  const searchInput = $('searchInput') as HTMLInputElement;
  let debounceTimer: number | undefined;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      state.filters.search = searchInput.value;
      refreshList();
    }, 250);
  });
  ($('filterStartDate') as HTMLInputElement).addEventListener('change', (e) => {
    state.filters.dateStart = (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null;
    refreshList();
  });
  ($('filterEndDate') as HTMLInputElement).addEventListener('change', (e) => {
    state.filters.dateEnd = (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null;
    refreshList();
  });
  ($('sortFieldSelect') as HTMLSelectElement).addEventListener('change', (e) => {
    state.filters.sortField = (e.target as HTMLSelectElement).value as Filters['sortField'];
    refreshList();
  });
  $('sortAscBtn').addEventListener('click', () => {
    state.filters.sortDir = 'asc';
    updateSortButtons();
    refreshList();
  });
  $('sortDescBtn').addEventListener('click', () => {
    state.filters.sortDir = 'desc';
    updateSortButtons();
    refreshList();
  });
  ($('defaultBranchDisplay') as HTMLSelectElement).addEventListener('change', () => renderCurrent());
}

/** find the conversation currently selected for the info panel */
function findSelectedConversation(): Conversation | null {
  if (state.current) return state.current;
  return state.conversations.find((c) => c.id === state.currentId) ?? null;
}

// ---------------------------------------------------------------------------
// In-conversation search (cross-branch, with prev/next navigation)
// ---------------------------------------------------------------------------

interface ContentSearchHit {
  nodeId: string;
  ord: number; // occurrence ordinal (1-based) within that node
}

let contentSearch: {
  term: string;
  hits: ContentSearchHit[];
  current: number;
  primed: boolean; // true once the user navigated to a hit
} | null = null;

/** Detail element of a rendered conversation node (data-node-id). */
function nodeElement(nodeId: string): HTMLElement | null {
  return detailContainer().querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
}

/** Every text occurrence of `term` in the whole conversation (all branches),
 *  ordered by depth-first traversal of the message tree. */
function collectContentSearchHits(conv: Conversation, term: string): ContentSearchHit[] {
  const q = term.toLowerCase();
  const hits: ContentSearchHit[] = [];
  const visit = (nodeId: string) => {
    const node = conv.nodes.get(nodeId);
    if (node?.message) {
      let n = 0;
      for (const f of node.message.fragments) {
        if (f.kind !== 'text') continue;
        const t = f.content.toLowerCase();
        let idx = t.indexOf(q);
        while (idx !== -1) {
          n++;
          hits.push({ nodeId, ord: n });
          idx = t.indexOf(q, idx + Math.max(1, q.length));
        }
      }
    }
    for (const cid of node?.childrenIds ?? []) visit(cid);
  };
  visit(conv.root.id);
  return hits;
}

/** Remove <mark> highlights from the current detail DOM. */
function clearContentSearchDOM(): void {
  detailContainer()
    .querySelectorAll('mark.highlight')
    .forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent ?? ''), m);
        parent.normalize();
      }
    });
}

/** Wrap every occurrence of `term` (case-insensitive) in <mark class="highlight">. */
function applyContentSearchDOM(term: string): void {
  clearContentSearchDOM();
  if (!term) return;
  const root = detailContainer();
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue && regex.test(node.nodeValue)) {
      textNodes.push(node);
    }
    regex.lastIndex = 0;
  }
  for (const node of textNodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    regex.lastIndex = 0;
    const text = node.nodeValue ?? '';
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'highlight';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      if (m.index === regex.lastIndex) regex.lastIndex++;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
}

function updateContentSearchUI(): void {
  const s = contentSearch;
  const n = s?.hits.length ?? 0;
  const hasQuery = !!s;
  const box = document.querySelector('.content-toolbar .content-search');
  box?.classList.toggle('has-query', hasQuery);
  const prev = $('contentSearchPrev') as HTMLButtonElement;
  const next = $('contentSearchNext') as HTMLButtonElement;
  prev.disabled = !hasQuery || n === 0;
  next.disabled = !hasQuery || n === 0;
  const status = $('contentSearchStatus');
  status.classList.toggle('active', hasQuery);
  status.textContent = hasQuery
    ? s!.primed && n > 0
      ? t('hitsPosition', { pos: s!.current + 1, count: n })
      : t('hitsCount', { count: n })
    : '';
}

/** Map a DOM <mark> back to its global hit index (same node + ordinal). */
function globalIndexOfMark(mark: Element): number {
  const nodeEl = mark.closest('[data-node-id]') as HTMLElement | null;
  if (!nodeEl || !contentSearch) return -1;
  const nodeId = nodeEl.dataset.nodeId ?? '';
  const ord = [...nodeEl.querySelectorAll('mark.highlight')].indexOf(mark as HTMLElement) + 1;
  return contentSearch.hits.findIndex((h) => h.nodeId === nodeId && h.ord === ord);
}

/** For the first navigation: the hit nearest to what is currently on screen. */
function nearestVisibleHitIndex(dir: 1 | -1): number {
  const scroller = detailContainer();
  const rc = scroller.getBoundingClientRect();
  const visible = [...scroller.querySelectorAll('mark.highlight')].filter((m) => {
    const r = m.getBoundingClientRect();
    return r.height > 0 && r.width > 0; // skip content hidden in closed <details>
  });
  let pick: Element | undefined;
  if (dir === 1) {
    pick = visible.find((m) => m.getBoundingClientRect().top >= rc.top - 2) ?? visible[0];
  } else {
    pick = [...visible].reverse().find((m) => m.getBoundingClientRect().bottom <= rc.bottom + 2) ?? visible[visible.length - 1];
  }
  if (pick) {
    const gi = globalIndexOfMark(pick);
    if (gi >= 0) return gi;
  }
  return dir === 1 ? 0 : (contentSearch?.hits.length ?? 1) - 1;
}

/** Move to hit `index` (wraps around); switches the branch if needed. */
function jumpToContentHit(index: number): void {
  const s = contentSearch;
  const conv = state.current;
  if (!s || !conv || s.hits.length === 0) return;
  const total = s.hits.length;
  s.current = ((index % total) + total) % total;
  s.primed = true;
  const hit = s.hits[s.current];

  let el = nodeElement(hit.nodeId);
  if (!el) {
    // Hit lives on another branch -> switch the reading view onto it.
    state.branchPath = pathToNode(conv, hit.nodeId);
    renderCurrent();
    el = nodeElement(hit.nodeId);
  }
  if (!el || el.querySelectorAll('mark.highlight').length === 0) {
    applyContentSearchDOM(s.term); // DOM was rebuilt / marks lost -> re-mark
  }

  let target: HTMLElement | null = nodeElement(hit.nodeId);
  if (target) {
    const marks = [...target.querySelectorAll('mark.highlight')];
    target = marks.length ? marks[Math.min(hit.ord - 1, marks.length - 1)] : target;
  }
  updateContentSearchUI();
  if (!target) return;
  // Reveal content inside collapsed thinking <details>.
  for (let p: HTMLElement | null = target; p; p = p.parentElement) {
    if (p.tagName === 'DETAILS') (p as HTMLDetailsElement).open = true;
  }
  document.querySelectorAll('mark.search-current').forEach((m) => m.classList.remove('search-current'));
  target.classList.add('search-current');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function stepContentMatch(dir: 1 | -1): void {
  const s = contentSearch;
  if (!s || s.hits.length === 0) return;
  if (!s.primed) jumpToContentHit(nearestVisibleHitIndex(dir));
  else jumpToContentHit(s.current + dir);
}

/**
 * Search the whole conversation (every branch). Typing only counts/highlights —
 * no auto-jump; the user navigates with ↑/↓ (first click goes to the nearest
 * visible hit).
 */
function runContentSearch(term: string): void {
  clearContentSearchDOM();
  const conv = state.current;
  if (conv && term) {
    const hits = collectContentSearchHits(conv, term);
    contentSearch = { term, hits, current: 0, primed: false };
    applyContentSearchDOM(term); // highlight what is visible in this branch
    updateContentSearchUI();
    return;
  }
  contentSearch = null;
  updateContentSearchUI();
}

function clearContentSearch(): void {
  const input = $('mobileSearchInput') as HTMLInputElement;
  if (input.value) input.value = '';
  contentSearch = null;
  clearContentSearchDOM();
  updateContentSearchUI();
}

/** Re-apply highlights after the detail DOM was rebuilt with an active search. */
function ensureContentSearchAfterRender(): void {
  if (contentSearch?.term) applyContentSearchDOM(contentSearch.term);
}

function updateSortButtons(): void {
  $('sortAscBtn').classList.toggle('active', state.filters.sortDir === 'asc');
  $('sortDescBtn').classList.toggle('active', state.filters.sortDir === 'desc');
}

/** Highlight the active language button in the language modal. */
function markLanguageSelection(lang: string): void {
  const zh = $('langZhBtn');
  const en = $('langEnBtn');
  if (zh) zh.classList.toggle('selected', lang === 'zh-CN');
  if (en) en.classList.toggle('selected', lang === 'en');
}

/** High-contrast fragment coloring (data-hc on <html>). */
function applyHighContrast(on: boolean): void {
  if (on) document.documentElement.setAttribute('data-hc', 'on');
  else document.documentElement.removeAttribute('data-hc');
}

/** Reader font-size scale — rem-based text follows --font-scale on <html>. */
function applyFontScale(scale: string): void {
  const n = Number(scale);
  const clamped = Number.isFinite(n) ? Math.min(1.5, Math.max(0.75, n)) : 1;
  document.documentElement.style.setProperty('--font-scale', String(clamped));
}

/** Step the reader font size by ±delta (clamped 0.75..1.5), persisted. */
function adjustFont(delta: number): void {
  const cur =
    parseFloat(document.documentElement.style.getPropertyValue('--font-scale')) ||
    parseFloat(localStorage.getItem('dscr-font-scale') || '') ||
    1;
  const next = Math.min(1.5, Math.max(0.75, Math.round((cur + delta) * 1000) / 1000));
  applyFontScale(String(next));
  localStorage.setItem('dscr-font-scale', String(next));
}

// ---------------------------------------------------------------------------
// Hover card (wide screens, mouse only) + viewport adaptation
// ---------------------------------------------------------------------------

const hoverCard = document.createElement('div');
hoverCard.className = 'conv-hover-card';
hoverCard.hidden = true;
document.body.appendChild(hoverCard);

/** First user request text of a conversation (for the hover preview). */
function convPreviewText(c: Conversation): string {
  const chain = walkBranch(c, c.root, new Map(), 'first');
  for (const n of chain) {
    if (!n.message) continue;
    for (const f of n.message.fragments) {
      if (f.kind === 'text' && f.type === 'REQUEST') {
        const s = f.content.replace(/\s+/g, ' ').trim();
        if (s) return s;
      }
    }
  }
  return '';
}

function showHoverCard(c: Conversation, anchor: DOMRect): void {
  if (window.innerWidth <= 900) return; // never on narrow screens
  const s = convStats(c);
  const preview = convPreviewText(c);
  hoverCard.innerHTML = `
    <div class="conv-hover-title">${escapeText(c.title || t('noTitle'))}</div>
    <div class="conv-hover-meta">
      <span><b>${escapeText(t('startTime'))}</b>${escapeText(formatDateTime(c.insertedAt))}</span>
      <span><b>${escapeText(t('endTime'))}</b>${escapeText(formatDateTime(c.updatedAt))}</span>
      <span><b>${escapeText(t('turnCount'))}</b>${s.turns} · <b>${escapeText(t('messageCount'))}</b>${s.messages} · <b>${escapeText(t('charCount'))}</b>${s.chars.toLocaleString()}</span>
    </div>
    ${preview ? `<div class="conv-hover-preview">${escapeText(preview.length > 240 ? preview.slice(0, 240) + '…' : preview)}</div>` : ''}
  `;
  hoverCard.hidden = false;
  const cw = hoverCard.offsetWidth;
  const ch = hoverCard.offsetHeight;
  let left = anchor.left + 14;
  if (left + cw > window.innerWidth - 8) left = anchor.right - cw - 14;
  left = Math.max(8, left);
  let top = anchor.bottom + 8;
  if (top + ch > window.innerHeight - 8) top = Math.max(8, anchor.top - ch - 8);
  hoverCard.style.left = `${left}px`;
  hoverCard.style.top = `${top}px`;
}

function hideHoverCard(): void {
  hoverCard.hidden = true;
}

/** Show a details card while hovering a conversation (sidebar item or table row). */
function bindConvHover(): void {
  if (!canHover) return;
  let hideTimer: number | undefined;
  const showFor = (el: Element) => {
    const id = el.getAttribute('data-id');
    if (!id) return;
    const c = state.conversations.find((x) => x.id === id);
    if (!c) return;
    showHoverCard(c, el.getBoundingClientRect());
  };
  const containers = ['conversationsContainer', 'tableBody'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
  for (const box of containers) {
    box.addEventListener('mouseover', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!item) return;
      window.clearTimeout(hideTimer);
      showFor(item);
    });
    box.addEventListener('mouseleave', () => {
      hideTimer = window.setTimeout(hideHoverCard, 120);
    });
  }
  // Dismiss while the underlying list scrolls
  for (const box of containers) box.addEventListener('scroll', hideHoverCard);
  document.addEventListener('scroll', hideHoverCard, true);
}

/** Wide<->narrow crossing: list table only exists wide; when narrowing, move
 *  the user back into the reading view (their rule), or re-render the cards. */
function bindViewportAdapt(): void {
  let lastWide = listIsTable();
  window.addEventListener('resize', () => {
    const wide = listIsTable();
    if (wide === lastWide) return;
    lastWide = wide;
    hideHoverCard();
    if (currentView === 'list') {
      if (!wide && state.current) setView('content');
      else refreshList();
    }
  });
}

function initLanguage(): void {
  // Not persisted (user request): derive from the browser/OS language on every load.
  const nav = (navigator.language || (navigator.languages && navigator.languages[0]) || 'zh-CN').toLowerCase();
  const lang = nav.startsWith('zh') ? 'zh-CN' : 'en';
  document.documentElement.setAttribute('lang', lang);
  setLanguage(lang);
}

function init(): void {
  // Reader view settings before first paint (high-contrast, font scale).
  applyHighContrast(localStorage.getItem('dscr-hc') === '1');
  applyFontScale(localStorage.getItem('dscr-font-scale') || '1');
  initLanguage();
  applyTranslations();
  initTheme();
  updateThemeButton();
  updateSortButtons();
  syncTableFiltersUI();
  setTableBatchButtons();
  setView('list');
  updateOutlineButton();
  // Apply the print preferences up front so Ctrl+P honors them too
  document.documentElement.classList.toggle('print-expand-think', localStorage.getItem('dscr-print-think') !== '0');
  document.documentElement.classList.toggle('print-expand-search', localStorage.getItem('dscr-print-search') !== '0');
  bindEvents();

  const startDate = new Date('2023-11-29');
  ($('filterStartDate') as HTMLInputElement).valueAsDate = startDate;
  ($('filterEndDate') as HTMLInputElement).valueAsDate = new Date();
  syncTableFiltersUI(); // keep the table toolbar dates identical to the sidebar

  // Restore from localStorage, else embedded snapshot, else show upload modal
  const saved = loadFromStorage();
  if (saved && saved.length > 0) {
    state.conversations = saved;
    const sorted = filterConversations(saved, state.filters);
    if (sorted.length > 0) {
      state.currentId = sorted[0].id;
      updateInfoPanel(sorted[0]);
    }
    refreshList();
    return;
  }
  if (tryLoadEmbeddedData()) return;

  renderEmptyDetail();
  refreshList();
  openUploadModal();
}

document.addEventListener('DOMContentLoaded', init);
