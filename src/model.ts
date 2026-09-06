/**
 * Tree traversal over a normalized conversation's mapping tree.
 * Handles branches (a node with multiple children) and nested branches.
 */
import type { Conversation, Node } from './types';

/** Direct children of a node (filtered to existing nodes). */
export function childrenOf(conv: Conversation, node: Node): Node[] {
  const out: Node[] = [];
  for (const id of node.childrenIds) {
    const c = conv.nodes.get(id);
    if (c) out.push(c);
  }
  return out;
}

/** Number of branches at this node (i.e. number of children). */
export function branchCount(node: Node): number {
  return node.childrenIds.length;
}

export interface BranchChoice {
  nodeId: string;
  branchIndex: number; // which child index was chosen
}

/**
 * Walk one branch from a node following a path of child indices.
 * `path` may be shorter than the full depth: for each node, if the path has a
 * choice for it, follow that child, otherwise follow the default branch index.
 * Returns the linear chain of nodes from (and including) `start`.
 */
export function walkBranch(
  conv: Conversation,
  start: Node,
  path: Map<string, number>,
  defaultBranch: 'first' | 'last',
): Node[] {
  const chain: Node[] = [];
  let current: Node | undefined = start;
  while (current) {
    chain.push(current);
    const kids = childrenOf(conv, current);
    if (kids.length === 0) break;
    let idx = path.get(current.id) ?? -1;
    if (idx < 0 || idx >= kids.length) {
      idx = defaultBranch === 'last' ? kids.length - 1 : 0;
    }
    current = kids[idx];
  }
  return chain;
}

/** The chain of messages (nodes with a message) on the current branch. */
export function walkMessageChain(
  conv: Conversation,
  path: Map<string, number>,
  defaultBranch: 'first' | 'last',
): Node[] {
  return walkBranch(conv, conv.root, path, defaultBranch).filter((n) => n.message);
}

/**
 * Branch choices that lead from the root to `targetId`:
 * for every ancestor with several children, the child index on the route.
 * Can be used to switch the reading view onto the chain containing a node.
 */
export function pathToNode(conv: Conversation, targetId: string): Map<string, number> {
  const path = new Map<string, number>();
  const target = conv.nodes.get(targetId);
  if (!target) return path;
  let cur: Node | undefined = target;
  while (cur && cur.parentId) {
    const parent = conv.nodes.get(cur.parentId);
    if (!parent) break;
    if (parent.childrenIds.length > 1) {
      const idx = parent.childrenIds.indexOf(cur.id);
      if (idx >= 0) path.set(parent.id, idx);
    }
    cur = parent;
  }
  return path;
}

/**
 * Collect all search results (SEARCH + TOOL_SEARCH fragments, in fragment
 * order) of a message. Citation markers index into this merged list.
 */
export function collectSearchResults(node: Node): { url: string; title: string }[] {
  if (!node.message) return [];
  const out: { url: string; title: string }[] = [];
  for (const f of node.message.fragments) {
    if (f.kind === 'search') out.push(...f.results);
  }
  return out;
}
