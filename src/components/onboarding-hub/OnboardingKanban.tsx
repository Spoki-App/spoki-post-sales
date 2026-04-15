'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { differenceInDays } from 'date-fns';
import { ONBOARDING_HAPPY_PATH, ONBOARDING_PROBLEM_STAGES, ONBOARDING_PROBLEM_IDS } from '@/lib/config/onboarding-pipeline';
import { formatMrrDisplay } from '@/lib/format/mrr';

export interface OnboardingCard {
  clientId: string;
  hubspotId: string;
  name: string;
  domain: string | null;
  mrr: number | null;
  plan: string | null;
  stage: string | null;
  activatedAt: string | null;
  openedAt: string | null;
}

interface Props {
  cards: OnboardingCard[];
}

export function OnboardingKanban({ cards }: Props) {
  const columns = useMemo(() => {
    const grouped = new Map<string, OnboardingCard[]>();

    for (const stage of ONBOARDING_HAPPY_PATH) {
      grouped.set(stage.id, []);
    }
    grouped.set('problems', []);

    for (const card of cards) {
      const stageId = card.stage ?? '1';
      if (ONBOARDING_PROBLEM_IDS.has(stageId)) {
        grouped.get('problems')!.push(card);
      } else if (grouped.has(stageId)) {
        grouped.get(stageId)!.push(card);
      } else {
        const first = ONBOARDING_HAPPY_PATH[0].id;
        grouped.get(first)!.push(card);
      }
    }

    const cols: Array<{ id: string; label: string; cards: OnboardingCard[] }> = ONBOARDING_HAPPY_PATH.map(s => ({
      id: s.id,
      label: s.label,
      cards: grouped.get(s.id) ?? [],
    }));

    const problemCards = grouped.get('problems') ?? [];
    if (problemCards.length > 0) {
      cols.push({ id: 'problems', label: 'Problemi', cards: problemCards });
    }

    return cols;
  }, [cards]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map(col => (
        <div
          key={col.id}
          className="flex-shrink-0 w-56 bg-slate-50 rounded-xl border border-slate-200"
        >
          <div className={`px-3 py-2.5 border-b border-slate-200 ${col.id === 'problems' ? 'bg-amber-50' : 'bg-teal-50'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-semibold ${col.id === 'problems' ? 'text-amber-700' : 'text-teal-700'}`}>
                {col.label}
              </h3>
              <span className={`text-xs font-bold ${col.id === 'problems' ? 'text-amber-600' : 'text-teal-600'}`}>
                {col.cards.length}
              </span>
            </div>
          </div>

          <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
            {col.cards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nessun cliente</p>
            ) : (
              col.cards.map(card => {
                const days = card.activatedAt
                  ? differenceInDays(new Date(), new Date(card.activatedAt))
                  : card.openedAt
                    ? differenceInDays(new Date(), new Date(card.openedAt))
                    : null;

                const problemLabel = card.stage && ONBOARDING_PROBLEM_IDS.has(card.stage)
                  ? ONBOARDING_PROBLEM_STAGES[card.stage]
                  : null;

                return (
                  <Link
                    key={card.clientId}
                    href={`/clients/${card.clientId}`}
                    className="block bg-white rounded-lg border border-slate-200 p-3 hover:border-teal-300 hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-medium text-slate-800 truncate">{card.name}</p>
                    {card.domain && <p className="text-xs text-slate-400 truncate">{card.domain}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      {card.mrr != null && (
                        <span className="text-xs text-slate-500">{formatMrrDisplay(card.mrr)}</span>
                      )}
                      {days !== null && (
                        <span className="text-xs text-slate-400">{days} gg</span>
                      )}
                    </div>
                    {problemLabel && (
                      <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                        {problemLabel}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
