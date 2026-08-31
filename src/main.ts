/**
 * App entry: state, event wiring, rendering orchestration.
 */
import './styles/main.css';
import './styles/print.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import type { Conversation } from './types';
import { normalizeExport, formatDateTime, ParseError } from './parser';
import { t, setLanguage, applyTranslations } from './i18n';
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
    if (sorted.length > 0) openConversation(sorted[0]);
  }
  refreshList();
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
  updateBatchUI();
}

const sidebarHandlers: SidebarHandlers = {
  onOpen: openConversation,
  onEditTitle: (c, title) => {
    c.title = title;
    if (state.currentId === c.id) renderCurrent();
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
    saveToStorage(state.conversations);
  },
};

// ---------------------------------------------------------------------------
// Detail rendering
// ---------------------------------------------------------------------------

function openConversation(c: Conversation): void {
  state.current = c;
  state.currentId = c.id;
  state.branchPath = new Map();
  renderCurrent();
  refreshList();
  $('contentArea').classList.remove('collapsed');
  document.documentElement.scrollTop = 0;
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

function updateBatchUI(): void {
  const actions = $('batchActions');
  const selectAll = $('selectAllCheckbox') as HTMLInputElement;
  actions.hidden = !state.batchMode;
  selectAll.checked = state.selected.size > 0 && state.selected.size === state.conversations.length;
  $('batchSelectBtn').classList.toggle('active', state.batchMode);
}

function toggleBatchMode(): void {
  state.batchMode = !state.batchMode;
  if (!state.batchMode) state.selected = new Set();
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
// Header / misc
// ---------------------------------------------------------------------------

function toggleSidebar(): void {
  $('sidebar').classList.toggle('collapsed');
  $('resizeHandle').classList.toggle('hidden');
  updateSidebarButton();
}
function updateSidebarButton(): void {
  const btn = $('toggleSidebarBtn');
  const collapsed = $('sidebar').classList.contains('collapsed');
  btn.innerHTML = `<i class="fa-solid fa-list"></i> <span>${escapeText(collapsed ? t('toggleSidebar') : t('hideSidebar'))}</span>`;
}

function toggleOutline(): void {
  const sidebar = $('outlineSidebar');
  const collapsed = sidebar.classList.toggle('collapsed');
  updateOutlineButton();
}

function updateOutlineButton(): void {
  const collapsed = $('outlineSidebar').classList.contains('collapsed');
  $('toggleOutlineBtn').innerHTML = `<i class="fa-solid fa-list-ol"></i> <span>${escapeText(collapsed ? t('expandOutline') : t('outline'))}</span>`;
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
  $('toggleSidebarBtn').addEventListener('click', toggleSidebar);
  $('toggleOutlineBtn').addEventListener('click', toggleOutline);
  $('collapseOutlineBtn').addEventListener('click', toggleOutline);
  $('printBtn').addEventListener('click', printPage);
  $('resetBtn').addEventListener('click', resetAll);
  $('batchSelectBtn').addEventListener('click', toggleBatchMode);
  $('batchInvertBtn').addEventListener('click', () => sidebarHandlers.onInvertSelection());
  $('batchDeleteBtn').addEventListener('click', () => sidebarHandlers.onBatchDelete());
  $('selectAllCheckbox').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) sidebarHandlers.onSelectAll();
    else state.selected = new Set();
    refreshList();
  });

  // Language
  const langSelect = $('languageSelect') as HTMLSelectElement;
  langSelect.addEventListener('change', () => {
    const lang = langSelect.value;
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('dscr-language', lang);
    setLanguage(lang);
    applyTranslations();
    updateThemeButton();
    updateSidebarButton();
    updateOutlineButton();
    renderCurrent();
    refreshList();
  });

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

  // Resize handle
  const resizeHandle = $('resizeHandle');
  let resizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    resizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const rect = document.querySelector('.main-container')!.getBoundingClientRect();
    const w = e.clientX - rect.left;
    if (w > 200 && w < rect.width * 0.7) {
      document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    }
  });
  document.addEventListener('mouseup', () => {
    resizing = false;
    document.body.style.cursor = '';
  });
}

function updateSortButtons(): void {
  $('sortAscBtn').classList.toggle('active', state.filters.sortDir === 'asc');
  $('sortDescBtn').classList.toggle('active', state.filters.sortDir === 'desc');
}

function initLanguage(): void {
  const saved = localStorage.getItem('dscr-language') || 'zh-CN';
  ($('languageSelect') as HTMLSelectElement).value = saved;
  document.documentElement.setAttribute('lang', saved);
  setLanguage(saved);
}

function init(): void {
  initLanguage();
  applyTranslations();
  initTheme();
  updateThemeButton();
  updateSortButtons();
  updateSidebarButton();
  updateOutlineButton();
  bindEvents();

  const startDate = new Date('2023-11-29');
  ($('filterStartDate') as HTMLInputElement).valueAsDate = startDate;
  ($('filterEndDate') as HTMLInputElement).valueAsDate = new Date();

  // Restore from localStorage, else embedded snapshot, else show upload modal
  const saved = loadFromStorage();
  if (saved && saved.length > 0) {
    state.conversations = saved;
    const sorted = filterConversations(saved, state.filters);
    if (sorted.length > 0) openConversation(sorted[0]);
    refreshList();
    return;
  }
  if (tryLoadEmbeddedData()) return;

  renderEmptyDetail();
  refreshList();
  openUploadModal();
}

document.addEventListener('DOMContentLoaded', init);
