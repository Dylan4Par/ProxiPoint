import { useEffect, useState } from 'react';

/**
 * Reports and blocks, kept in memory for now. Reported content is hidden for the reporter right
 * away; blocked people's Points and recaps disappear from Discover.
 *
 * Server side later:
 *   POST   /reports        { targetType, targetId, ownerHandle?, reason, note }
 *   POST   /me/blocks      { handle }     DELETE /me/blocks/:handle
 *   GET    /me/blocks
 * The server should also stop blocked people from inviting you or seeing your Points.
 */

export type ReportTargetType = 'point' | 'recap' | 'photo' | 'profile' | 'post' | 'comment';

export const REPORT_REASONS = [
  { id: 'nudity', label: 'Nudity or sexual content' },
  { id: 'minor_safety', label: 'Involves a minor' },
  { id: 'violence', label: 'Violence or gore' },
  { id: 'hate', label: 'Hate or harassment' },
  { id: 'privacy', label: 'Shares private information' },
  { id: 'spam', label: 'Spam or misleading' },
  { id: 'rights', label: 'Not theirs to share' },
  { id: 'impersonation', label: 'Pretending to be someone else', only: 'profile' },
  { id: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** The reasons that make sense for this kind of report. */
export function reportReasonsFor(type: ReportTargetType) {
  return REPORT_REASONS.filter((option) => !('only' in option) || option.only === type);
}

export interface ContentReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  ownerHandle: string | null;
  reason: ReportReason;
  note: string;
  createdAt: string;
}

let reports: ContentReport[] = [];
let hiddenIds = new Set<string>();
let blockedHandles = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function normalizeHandle(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '').toLowerCase();
  return clean ? `@${clean}` : '';
}

export function reportContent(input: Omit<ContentReport, 'id' | 'createdAt'>): ContentReport {
  const report: ContentReport = {
    ...input,
    ownerHandle: input.ownerHandle ? normalizeHandle(input.ownerHandle) : null,
    id: `report-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  reports = [report, ...reports];
  hiddenIds = new Set(hiddenIds).add(input.targetId);
  changed();
  // Server side: POST /reports (a report against minor safety should be escalated immediately).
  return report;
}

export function isContentHidden(id: string | null | undefined): boolean {
  return id != null && hiddenIds.has(String(id));
}

export function blockUser(handle: string) {
  const clean = normalizeHandle(handle);
  if (!clean) return;
  blockedHandles = new Set(blockedHandles).add(clean);
  changed();
}

export function unblockUser(handle: string) {
  const next = new Set(blockedHandles);
  next.delete(normalizeHandle(handle));
  blockedHandles = next;
  changed();
}

export function isBlocked(handle: string | null | undefined): boolean {
  return handle != null && blockedHandles.has(normalizeHandle(handle));
}

export function getBlockedHandles(): string[] {
  return [...blockedHandles].sort();
}

export function getReports(): ContentReport[] {
  return reports;
}

/** Host of a Discover node, from whichever field the node carries. */
export function hostOf(node: unknown): string | null {
  const n = (node ?? {}) as Record<string, unknown>;
  for (const key of ['hostHandle', 'host', 'hostName']) {
    const value = n[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * False when you reported this post or comment, or blocked whoever wrote it.
 * Used for channel posts, their comments, and post pins on the map.
 */
export function isAuthoredAllowed(item: { id: string; author: string }): boolean {
  return !isContentHidden(item.id) && !isBlocked(item.author);
}

/** False when the node was reported by you or its host is blocked. */
export function isNodeAllowed(node: unknown): boolean {
  const n = (node ?? {}) as { id?: unknown };
  if (isContentHidden(n.id != null ? String(n.id) : null)) return false;
  return !isBlocked(hostOf(node));
}

/** Re-renders the calling component whenever reports or blocks change. */
export function useModeration(): number {
  const [current, setCurrent] = useState(version);
  useEffect(() => {
    const listener = () => setCurrent(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return current;
}
