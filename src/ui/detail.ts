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

interface OutlineHeading {
  el: HTMLElement;
  text: string;
  level: number;
}

interface OutlineTurn {
  label: string;
  targetEl: HTMLElement | null;
  badge: string | null;
  headings: OutlineHeading[];
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

  const messageEls: (HTMLElement | null)[] = [];
  const turns: OutlineTurn[] = [];
  let currentTurn: OutlineTurn | null = null;

  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    let el: HTMLElement | null = null;
    if (node.message) {
      el = renderMessage(node);
      messageEls.push(el);
      chainContainer.appendChild(el);
    } else {
      messageEls.push(null);
    }

    // Build turn-grouped outline data from the chain
    if (node.message) {
      const types = node.message.fragments.map((f) => f.type);
      const isUserTurn = types.includes('REQUEST') || types.includes('FILE');
      if (isUserTurn) {
        const kids = childrenOf(conv, node);
        let badge: string | null = null;
        if (kids.length > 1) {
          const idx = branchPath.get(node.id) ?? (defaultBranch === 'last' ? kids.length - 1 : 0);
          badge = `${idx + 1}/${kids.length}`;
        }
        currentTurn = { label: turnLabel(node), targetEl: el, badge, headings: [] };
        turns.push(currentTurn);
      }
      if (el && (types.includes('RESPONSE') || types.includes('THINK'))) {
        el.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
          const hh = h as HTMLElement;
          currentTurn?.headings.push({ el: hh, text: hh.textContent ?? '', level: Number(hh.tagName[1]) });
        });
      }
    }

    const kids = childrenOf(conv, node);
    if (kids.length > 1) {
      chainContainer.appendChild(
        renderBranchNav(conv, node, branchPath.get(node.id) ?? (defaultBranch === 'last' ? kids.length - 1 : 0), handlers),
      );
    }
  }

  buildOutline(turns);

  // Post-process: code blocks, mermaid, math
  void (async () => {
    for (const el of messageEls) {
      if (el) await postProcessMessage(el);
    }
  })();
}

/** Label for a turn: the user input snippet, or the attachment file name. */
function turnLabel(node: Node): string {
  if (!node.message) return '';
  for (const f of node.message.fragments) {
    if (f.type === 'REQUEST' && f.kind === 'text') {
      const s = f.content.replace(/\s+/g, ' ').trim();
      return s.length > 20 ? `${s.slice(0, 20)}…` : s;
    }
  }
  for (const f of node.message.fragments) {
    if (f.kind === 'file' && f.files[0]) return f.files[0].fileName;
  }
  return '';
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

/**
 * Turn-grouped outline: each turn (user input) is a level-1 item with an
 * optional "current/total" branch badge; markdown headings inside that turn's
 * replies are indented under it. Clicking jumps to the target.
 */
function buildOutline(turns: OutlineTurn[]): void {
  const outlineEl = document.getElementById('outlineContent');
  if (!outlineEl) return;
  outlineEl.innerHTML = '';

  let headingIdx = 0;
  for (const turn of turns) {
    // Turn item (level 1)
    const turnItem = document.createElement('div');
    turnItem.className = 'outline-item turn';
    turnItem.innerHTML = `<span class="outline-turn-label">${escapeHtml(turn.label || '')}</span>${
      turn.badge ? `<span class="outline-badge">${escapeHtml(turn.badge)}</span>` : ''
    }`;
    turnItem.title = turn.label;
    turnItem.addEventListener('click', () => {
      if (turn.targetEl) {
        turn.targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setActive(outlineEl, turnItem);
    });
    outlineEl.appendChild(turnItem);

    // Headings under this turn
    for (const h of turn.headings) {
      const id = `h-${headingIdx++}`;
      h.el.id = id;
      h.el.classList.add('outline-target');
      const item = document.createElement('div');
      item.className = `outline-item heading level-${Math.min(h.level, 6)}`;
      item.textContent = h.text;
      item.title = h.text;
      item.addEventListener('click', () => {
        h.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(outlineEl, item);
      });
      outlineEl.appendChild(item);
    }
  }
}

function setActive(outlineEl: HTMLElement, item: HTMLElement): void {
  outlineEl.querySelectorAll('.outline-item.active').forEach((e) => e.classList.remove('active'));
  item.classList.add('active');
}
