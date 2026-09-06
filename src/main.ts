/**
 * App entry: state, event wiring, rendering orchestration.
 */
import './styles/main.css';
import './styles/print.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import type { Conversation } from './types';
import { pathToNode } from './model';
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

/** Conversation info panel shown on the list page (wide screens). */
function updateInfoPanel(c: Conversation | null): void {
  const panel = $('listInfoPanel');
  if (!c) {
    panel.innerHTML = `<div class="list-info-empty">${escapeText(t('selectConversation'))}</div>`;
    return;
  }
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
  panel.innerHTML = `
    <div class="list-info-title" id="listInfoTitle">${escapeText(c.title || t('noTitle'))}</div>
    <div class="list-info-meta">
      <span><b>${escapeText(t('startTime'))}</b>${escapeText(formatDateTime(c.insertedAt))}</span>
      <span><b>${escapeText(t('endTime'))}</b>${escapeText(formatDateTime(c.updatedAt))}</span>
      <span><b>${escapeText(t('turnCount'))}</b>${turns}</span>
      <span><b>${escapeText(t('messageCount'))}</b>${messages}</span>
      <span><b>${escapeText(t('charCount'))}</b>${chars.toLocaleString()}</span>
    </div>
    <div class="list-info-actions">
      <button id="listInfoEditBtn" class="btn-ghost"><i class="fa-regular fa-pen-to-square"></i> ${escapeText(t('editTitle'))}</button>
      <button id="listInfoOpenBtn"><i class="fa-regular fa-folder-open"></i> ${escapeText(t('openConversation'))}</button>
      <button id="listInfoDeleteBtn" class="btn-danger"><i class="fa-regular fa-trash-can"></i> ${escapeText(t('deleteConversation'))}</button>
    </div>
  `;
  const titleEl = panel.querySelector('#listInfoTitle') as HTMLElement;
  titleEl.addEventListener('dblclick', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = c.title || '';
    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.focus();
    const finish = (save: boolean) => {
      if (save) {
        sidebarHandlers.onEditTitle(c, input.value.trim());
      } else {
        titleEl.textContent = c.title || t('noTitle');
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
  });
  panel.querySelector('#listInfoEditBtn')?.addEventListener('click', () => {
    titleEl.dispatchEvent(new MouseEvent('dblclick'));
  });
  panel.querySelector('#listInfoOpenBtn')?.addEventListener('click', () => openConversation(c));
  panel.querySelector('#listInfoDeleteBtn')?.addEventListener('click', () => sidebarHandlers.onDelete(c));
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
  $('batchActions').hidden = false;
  setBatchButtons();
  refreshList();
}

function exitBatchMode(): void {
  state.batchMode = false;
  state.selected = new Set();
  setBatchButtons();
  $('batchActions').hidden = true;
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

/** Hover-capable pointer (mouse/trackpad). Touch devices never auto-reveal. */
const canHover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;

function setView(view: 'list' | 'content'): void {
  currentView = view;
  document.body.classList.toggle('view-list', view === 'list');
  document.body.classList.toggle('view-content', view === 'content');
  document.body.classList.remove('peek-list');
  updateViewButtons();
  if (view === 'content') clearContentSearch();
}

function updateViewButtons(): void {
  $('viewListBtn').classList.toggle('active', currentView === 'list');
  $('viewContentBtn').classList.toggle('active', currentView === 'content');
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
    if (currentView !== 'content') return;
    document.body.classList.remove('peek-list');
  });
  // Click/tap on the ribbon toggles the peek manually — the only way to reveal
  // the list on touch devices (hover auto-reveal is off there to avoid
  // accidental opens).
  sRibbon.addEventListener('click', () => {
    if (currentView !== 'content') return;
    document.body.classList.toggle('peek-list');
  });
  // Clicking anywhere outside the peeked sidebar closes it (matters on touch).
  document.addEventListener('pointerdown', (e) => {
    if (currentView !== 'content') return;
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
    const fontSel = $('fontSizeSelect') as HTMLSelectElement;
    const savedScale = localStorage.getItem('dscr-font-scale') || '1';
    fontSel.value = savedScale;
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
  $('fontSizeSelect').addEventListener('change', (e) => {
    const scale = (e.target as HTMLSelectElement).value;
    applyFontScale(scale);
    localStorage.setItem('dscr-font-scale', scale);
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

  // View switching (list page / reading page)
  $('viewListBtn').addEventListener('click', () => setView('list'));
  $('viewContentBtn').addEventListener('click', () => {
    if (state.current) setView('content');
  });

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

let contentSearch: { term: string; hits: ContentSearchHit[]; current: number } | null = null;

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
  const countEl = $('contentSearchCount');
  const prev = $('contentSearchPrev') as HTMLButtonElement;
  const next = $('contentSearchNext') as HTMLButtonElement;
  const n = contentSearch?.hits.length ?? 0;
  if (n > 0) {
    countEl.textContent = `${contentSearch!.current + 1}/${n}`;
    prev.disabled = false;
    next.disabled = false;
  } else {
    countEl.textContent = contentSearch ? '0/0' : '';
    prev.disabled = true;
    next.disabled = true;
  }
}

/** Move to hit `index` (wraps around); switches the branch if needed. */
function jumpToContentHit(index: number): void {
  const s = contentSearch;
  const conv = state.current;
  if (!s || !conv || s.hits.length === 0) return;
  const total = s.hits.length;
  s.current = ((index % total) + total) % total;
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
  if (s && s.hits.length > 0) jumpToContentHit(s.current + dir);
}

/** Search the whole conversation (every branch); jump to the first hit. */
function runContentSearch(term: string): void {
  contentSearch = null;
  clearContentSearchDOM();
  const conv = state.current;
  if (conv && term) {
    const hits = collectContentSearchHits(conv, term);
    contentSearch = { term, hits, current: 0 };
    updateContentSearchUI();
    if (hits.length > 0) {
      jumpToContentHit(0);
      return;
    }
    return;
  }
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
  setView('list');
  updateOutlineButton();
  // Apply the print preferences up front so Ctrl+P honors them too
  document.documentElement.classList.toggle('print-expand-think', localStorage.getItem('dscr-print-think') !== '0');
  document.documentElement.classList.toggle('print-expand-search', localStorage.getItem('dscr-print-search') !== '0');
  bindEvents();

  const startDate = new Date('2023-11-29');
  ($('filterStartDate') as HTMLInputElement).valueAsDate = startDate;
  ($('filterEndDate') as HTMLInputElement).valueAsDate = new Date();

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
