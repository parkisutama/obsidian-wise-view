// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Parkis Utama

import type { PeriodicConfig } from './config';
import { formatPeriodicTokens, type PeriodicKind } from './resolver';

/** The periods whose links live in the toolbar title (day and week have their own links). */
type TitleKind = Extract<PeriodicKind, 'month' | 'quarter' | 'year'>;
const TITLE_KINDS: readonly TitleKind[] = ['month', 'quarter', 'year'];

export interface TitleLinkHooks {
  /** Path of the period's note when it exists, for the dot and hover preview. */
  existingPath(date: Date, kind: TitleKind): string | null;
  open(date: Date, kind: TitleKind): void;
  preview(event: MouseEvent, path: string, target: HTMLElement): void;
}

interface Segment {
  text: string;
  kind?: TitleKind;
}

/** Whether the title needs custom rendering: only when a period it can link is configured. */
export function hasTitleLinks(config: PeriodicConfig): boolean {
  return TITLE_KINDS.some((kind) => config.periods[kind].pattern !== '');
}

function segmentsFor(viewType: string, viewTitle: string, current: Date): Segment[] {
  if (viewType === 'dayGridMonth') {
    return [
      { text: formatPeriodicTokens('MMMM', current), kind: 'month' },
      { text: ' ' },
      { text: formatPeriodicTokens('YYYY', current), kind: 'year' },
      { text: ' (' },
      { text: `Q${formatPeriodicTokens('Q', current)}`, kind: 'quarter' },
      { text: ')' },
    ];
  }
  if (viewType === 'multiMonthYear' || viewType === 'dayGridYear') {
    return [{ text: formatPeriodicTokens('YYYY', current), kind: 'year' }];
  }
  // Week, day, and list views keep FullCalendar's own title, unlinked.
  return [{ text: viewTitle }];
}

/**
 * Rewrites the title element for the visible range. A part is a link (underlined, with a dot when
 * its note exists) only when its period is configured; everything else is plain text.
 */
export function renderTitleLinks(
  el: HTMLElement,
  view: { type: string; title: string; currentStart: Date },
  config: PeriodicConfig,
  hooks: TitleLinkHooks,
): void {
  el.empty();
  for (const segment of segmentsFor(view.type, view.title, view.currentStart)) {
    const kind = segment.kind;
    if (!kind || config.periods[kind].pattern === '') {
      el.createSpan({ text: segment.text });
      continue;
    }

    const link = el.createSpan({
      cls: 'planner-fc-title-link',
      text: segment.text,
      attr: { role: 'link', tabindex: '0' },
    });
    const open = () => hooks.open(view.currentStart, kind);
    link.addEventListener('click', open);
    link.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') open();
    });

    const path = hooks.existingPath(view.currentStart, kind);
    if (path) {
      link.createSpan({ cls: 'planner-journal-dot planner-title-dot' });
      link.addEventListener('mouseenter', (event) => hooks.preview(event, path, link));
    }
  }
}
