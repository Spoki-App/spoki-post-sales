'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/Card';
import { CS_PIPELINE_STAGES, type CsPipelineStageId } from '@/lib/config/cs-pipeline';
import { formatMrrDisplay } from '@/lib/format/mrr';
import { cn } from '@/lib/utils/cn';
import { GripVertical, Users } from 'lucide-react';

export type PipelineCard = {
  clientId: string;
  stage: string;
  name: string;
  hubspotId: string;
  mrr: number | null;
  activatedAt: string | null;
  hasPipelineRow?: boolean;
};

function DroppableColumn({
  stageId,
  label,
  count,
  children,
}: {
  stageId: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[min(70vh,520px)] w-[min(100%,260px)] shrink-0 flex-col rounded-xl border-2 border-dashed bg-slate-50/80 p-2 transition-colors',
        isOver ? 'border-violet-400 bg-violet-50' : 'border-slate-200'
      )}
    >
      <div className="mb-2 shrink-0 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
        <p className="text-[11px] text-slate-400">{count} clienti</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">{children}</div>
    </div>
  );
}

function DraggablePipelineCard({
  card,
  disabled,
}: {
  card: PipelineCard;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.clientId,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <Card className="p-2.5 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            className={cn(
              'mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            disabled={disabled}
            aria-label="Trascina per spostare fase"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <Link
              href={`/clients/${card.clientId}`}
              className="text-sm font-medium text-slate-900 hover:text-violet-700"
              onClick={e => e.stopPropagation()}
            >
              {card.name}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500">{formatMrrDisplay(card.mrr)}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function GroupedStageCard({
  clients,
  disabled,
  onOpen,
}: {
  clients: PipelineCard[];
  disabled?: boolean;
  onOpen: () => void;
}) {
  const totalMrr = clients.reduce((a, c) => a + (c.mrr ?? 0), 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="w-full text-left rounded-xl transition-colors hover:ring-2 hover:ring-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
    >
      <Card className="p-3 shadow-sm border-slate-200">
        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{clients.length} clienti</p>
            <p className="text-xs text-slate-500 mt-0.5">{formatMrrDisplay(totalMrr)} MRR totale</p>
            <p className="text-xs font-medium text-violet-600 mt-2">Clicca per vedere chi sono</p>
          </div>
        </div>
      </Card>
    </button>
  );
}

function StageClientsDialog({
  stageId,
  clients,
  onClose,
  onMove,
  moving,
}: {
  stageId: string;
  clients: PipelineCard[];
  onClose: () => void;
  onMove: (clientId: string, stage: CsPipelineStageId) => Promise<void>;
  moving?: boolean;
}) {
  const label = CS_PIPELINE_STAGES.find(s => s.id === stageId)?.label ?? stageId;

  useEffect(() => {
    if (clients.length <= 1) onClose();
  }, [clients.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-pipeline-group-title"
        className="flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id="cs-pipeline-group-title" className="text-base font-semibold text-slate-900">
            {label}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{clients.length} clienti in questa fase</p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
          {clients.map(c => (
            <li key={c.clientId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  href={`/clients/${c.clientId}`}
                  className="text-sm font-medium text-slate-900 hover:text-violet-700"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-slate-500">{formatMrrDisplay(c.mrr)}</p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                <span className="sr-only">Fase</span>
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                  value={c.stage}
                  disabled={moving}
                  onChange={async e => {
                    const next = e.target.value as CsPipelineStageId;
                    if (next === c.stage) return;
                    await onMove(c.clientId, next);
                  }}
                >
                  {CS_PIPELINE_STAGES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

export function CsPipelineKanban({
  cards,
  onMove,
  moving,
}: {
  cards: PipelineCard[];
  onMove: (clientId: string, stage: CsPipelineStageId) => Promise<void>;
  moving?: boolean;
}) {
  const [active, setActive] = useState<PipelineCard | null>(null);
  const [detailStageId, setDetailStageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const byStage = useMemo(() => {
    const m = new Map<string, PipelineCard[]>();
    for (const s of CS_PIPELINE_STAGES) {
      m.set(s.id, []);
    }
    for (const c of cards) {
      const stage = CS_PIPELINE_STAGES.some(x => x.id === c.stage) ? c.stage : 'welcome_call';
      const list = m.get(stage) ?? [];
      list.push({ ...c, stage });
      m.set(stage, list);
    }
    return m;
  }, [cards]);

  const cardById = useMemo(() => new Map(cards.map(c => [c.clientId, c])), [cards]);

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActive(cardById.get(id) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active: overActive, over } = e;
    setActive(null);
    if (!over || moving) return;
    const nextStage = String(over.id);
    if (!CS_PIPELINE_STAGES.some(s => s.id === nextStage)) return;
    const clientId = String(overActive.id);
    const cur = cardById.get(clientId);
    if (!cur || cur.stage === nextStage) return;
    await onMove(clientId, nextStage as CsPipelineStageId);
  }

  const detailClients = detailStageId ? (byStage.get(detailStageId) ?? []) : [];

  useEffect(() => {
    if (!detailStageId) return;
    const list = byStage.get(detailStageId) ?? [];
    if (list.length <= 1) setDetailStageId(null);
  }, [detailStageId, byStage]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-3 pt-1">
          {CS_PIPELINE_STAGES.map(col => {
            const list = byStage.get(col.id) ?? [];
            return (
              <DroppableColumn key={col.id} stageId={col.id} label={col.label} count={list.length}>
                {list.length === 0 ? null : list.length === 1 ? (
                  <DraggablePipelineCard key={list[0].clientId} card={list[0]} disabled={moving} />
                ) : (
                  <GroupedStageCard
                    key={`group-${col.id}`}
                    clients={list}
                    disabled={moving}
                    onOpen={() => setDetailStageId(col.id)}
                  />
                )}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <Card className="w-[220px] p-2.5 shadow-lg">
              <p className="text-sm font-medium text-slate-900">{active.name}</p>
              <p className="text-xs text-slate-500">{formatMrrDisplay(active.mrr)}</p>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {detailStageId && detailClients.length > 1 && (
        <StageClientsDialog
          stageId={detailStageId}
          clients={detailClients}
          moving={moving}
          onClose={() => setDetailStageId(null)}
          onMove={onMove}
        />
      )}
    </>
  );
}
