/**
 * Detail view: renders the conversation along the currently selected branch,
 * with branch navigation at every branch point and a headings outline.
 */
import type { Conversation, Node } from '../types';
import { childrenOf, walkBranch } from '../model';
import { renderMessage, postProcessMessage } from '../render/message';
import { formatDateTime } from '../parser';
import { escapeHtml } from '../citation';
import { t } from '../i18n';

export interface DetailHandlers {
  onEditTitle: (c: Conversation, newTitle: string) => void;
  onDeleteConversation: (c: Conversation) => void;
  onDeleteBranch: (c: Conversation, nodeId: string, branchIndex: number) => void;
  onBranchChange: (nodeId: string, branchIndex: number) => void;
}

export function renderDetail(
  container: HTMLElement,
  conv: Conversation,
  branchPath: Map<string, number>,
  defaultBranch: 'first' | 'last',
  handlers: DetailHandlers,
): void {
  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'conversation-header';
  header.innerHTML = `
    <div class="conversation-header-info">
      <h2 class="conversation-detail-title" title="${escapeHtml(conv.title || t('noTitle'))}">${escapeHtml(conv.title || t('noTitle'))}</h2>
      <p class="timestamp">
        <i class="fa-regular fa-clock"></i>
        ${escapeHtml(t('startTime'))}${escapeHtml(formatDateTime(conv.insertedAt))} |
        ${escapeHtml(t('endTime'))}${escapeHtml(formatDateTime(conv.updatedAt))}
      </p>
    </div>
    <div class="conversation-header-actions">
      <button id="editTitleBtn" class="btn-ghost"><i class="fa-regular fa-pen-to-square"></i> ${escapeHtml(t('editTitle'))}</button>
      <button id="deleteConversationBtn" class="btn-danger"><i class="fa-regular fa-trash-can"></i> ${escapeHtml(t('deleteConversation'))}</button>
    </div>
  `;
  container.appendChild(header);

  header.querySelector('#editTitleBtn')?.addEventListener('click', () => editDetailTitle(header, conv, handlers));
  header.querySelector('#deleteConversationBtn')?.addEventListener('click', () => handlers.onDeleteConversation(conv));
  header.querySelector('.conversation-detail-title')?.addEventListener('dblclick', () => editDetailTitle(header, conv, handlers));

  // Message chain along the branch
  const chain = walkBranch(conv, conv.root, branchPath, defaultBranch);
  const chainContainer = document.createElement('div');
  chainContainer.className = 'conversation-chain';
  container.appendChild(chainContainer);

  const messageEls: HTMLElement[] = [];
  for (const node of chain) {
    if (node.message) {
      const el = renderMessage(node);
      messageEls.push(el);
      chainContainer.appendChild(el);
    }
    const kids = childrenOf(conv, node);
    if (kids.length > 1) {
      chainContainer.appendChild(
        renderBranchNav(conv, node, branchPath.get(node.id) ?? (defaultBranch === 'last' ? kids.length - 1 : 0), handlers),
      );
    }
  }

  // Post-process: code blocks, mermaid, math
  void (async () => {
    for (const el of messageEls) {
      await postProcessMessage(el);
    }
    buildOutline(container, chainContainer);
  })();
}

function editDetailTitle(
  header: HTMLElement,
  conv: Conversation,
  handlers: DetailHandlers,
): void {
  const titleEl = header.querySelector('.conversation-detail-title') as HTMLElement;
  const original = conv.title || t('noTitle');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = original;
  titleEl.innerHTML = '';
  titleEl.appendChild(input);
  input.focus();
  const finish = (save: boolean) => {
    if (save) {
      handlers.onEditTitle(conv, input.value.trim() || original);
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

function renderBranchNav(
  conv: Conversation,
  node: Node,
  currentIndex: number,
  handlers: DetailHandlers,
): HTMLElement {
  const kids = childrenOf(conv, node);
  const total = kids.length;
  const nav = document.createElement('div');
  nav.className = 'branch-navigation';
  nav.innerHTML = `
    <button class="branch-nav-btn prev-branch" ${currentIndex <= 0 ? 'disabled' : ''} aria-label="Previous branch">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <input type="number" class="branch-input" value="${currentIndex + 1}" min="1" max="${total}" aria-label="Branch">
    <span class="branch-total">/ ${total}</span>
    <button class="branch-nav-btn next-branch" ${currentIndex >= total - 1 ? 'disabled' : ''} aria-label="Next branch">
      <i class="fa-solid fa-chevron-right"></i>
    </button>
    <button class="branch-nav-btn branch-nav-del" title="${escapeHtml(t('deleteBranch'))}" aria-label="Delete branch">
      <i class="fa-solid fa-trash-can"></i>
    </button>
  `;
  const setBranch = (idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    if (clamped !== currentIndex) handlers.onBranchChange(node.id, clamped);
  };
  nav.querySelector('.prev-branch')?.addEventListener('click', () => setBranch(currentIndex - 1));
  nav.querySelector('.next-branch')?.addEventListener('click', () => setBranch(currentIndex + 1));
  const input = nav.querySelector('.branch-input') as HTMLInputElement;
  input.addEventListener('change', () => {
    const v = parseInt(input.value, 10);
    if (!Number.isNaN(v)) setBranch(v - 1);
  });
  nav.querySelector('.branch-nav-del')?.addEventListener('click', () => {
    handlers.onDeleteBranch(conv, node.id, currentIndex);
  });
  return nav;
}

function buildOutline(root: HTMLElement, chain: HTMLElement): void {
  const outlineEl = document.getElementById('outlineContent');
  if (!outlineEl) return;
  outlineEl.innerHTML = '';
  const headings = chain.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6');
  let idx = 0;
  for (const h of headings) {
    const id = `h-${idx++}`;
    h.id = id;
    h.classList.add('outline-target');
    const item = document.createElement('div');
    item.className = `outline-item level-${h.tagName[1]}`;
    item.textContent = h.textContent ?? '';
    item.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      root.querySelectorAll('.outline-item.active').forEach((e) => e.classList.remove('active'));
      item.classList.add('active');
    });
    outlineEl.appendChild(item);
  }
  const sidebar = document.getElementById('outlineSidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed', headings.length === 0);
  }
}
