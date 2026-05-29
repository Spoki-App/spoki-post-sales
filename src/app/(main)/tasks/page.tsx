'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { tasksApi, clientsApi } from '@/lib/api/client';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Plus, X, Calendar, User, Building2 } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Task, TaskStatus, TaskPriority, ClientWithHealth } from '@/types';

const STATUS_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'Da fare', color: 'bg-slate-100' },
  { id: 'in_progress', label: 'In corso', color: 'bg-blue-50' },
  { id: 'done', label: 'Completati', color: 'bg-emerald-50' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
];

function DueDateBadge({ date, status }: { date: string | null; status: TaskStatus }) {
  if (!date || status === 'done') return null;
  const d = new Date(date);
  const overdue = isPast(d) && !isToday(d);
  const today = isToday(d);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-600' : today ? 'text-amber-600' : 'text-slate-400'}`}>
      <Calendar className="w-3 h-3" />
      {format(d, 'd MMM', { locale: it })}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-slate-800 leading-tight">{task.title}</p>
        <button
          onClick={() => onDelete(task.id)}
          className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {task.clientName && (
        <p className="flex items-center gap-1 text-xs text-slate-500 mb-2">
          <Building2 className="w-3 h-3" />{task.clientName}
        </p>
      )}

      {task.description && (
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'default'}
            size="sm"
          >
            {PRIORITY_OPTIONS.find(p => p.value === task.priority)?.label}
          </Badge>
          <DueDateBadge date={task.dueDate} status={task.status} />
        </div>

        {task.status !== 'done' && (
          <button
            onClick={() => onStatusChange(task.id, task.status === 'todo' ? 'in_progress' : 'done')}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
          >
            {task.status === 'todo' ? 'Inizia' : 'Completa'}
          </button>
        )}
      </div>

      {task.assignedTo && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
          <User className="w-3 h-3 text-slate-400" />
          <span className="text-xs text-slate-400">{task.assignedTo}</span>
        </div>
      )}
    </div>
  );
}

interface CreateTaskModalProps {
  onClose: () => void;
  onCreate: (task: Task) => void;
  clients: ClientWithHealth[];
  token: string;
}

function CreateTaskModal({ onClose, onCreate, clients, token }: CreateTaskModalProps) {
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium' as TaskPriority,
    dueDate: '', assignedTo: user?.email ?? '', clientId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const res = await tasksApi.create(token, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        assignedTo: form.assignedTo || undefined,
        clientId: form.clientId || undefined,
      });
      if (res.data) onCreate(res.data);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Nuovo task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Titolo *</label>
            <input
              required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Descrivi il task..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descrizione</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priorità</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Scadenza</label>
              <input
                type="date" value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
            <select
              value={form.clientId}
              onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Nessun cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assegnato a</label>
            <input
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="email@azienda.it"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
              Annulla
            </button>
            <button
              type="submit" disabled={submitting}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creazione...' : 'Crea task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { token } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<ClientWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterOwner, setFilterOwner] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [tasksRes, clientsRes] = await Promise.all([
        tasksApi.list(token, { assignedTo: filterOwner || undefined }),
        clientsApi.list(token, { pageSize: 200 } as Parameters<typeof clientsApi.list>[1]),
      ]);
      setTasks(tasksRes.data);
      setClients(clientsRes.data);
    } finally {
      setLoading(false);
    }
  }, [token, filterOwner]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: string, status: TaskStatus) {
    if (!token) return;
    await tasksApi.update(token, id, { status });
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
  }

  async function handleDelete(id: string) {
    if (!token) return;
    await tasksApi.delete(token, id);
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Task CS</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tasks.filter(t => t.status !== 'done').length} task attivi</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuovo task
        </button>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUS_COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return (
              <div key={col.id} className={`rounded-xl ${col.color} p-3`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                  <span className="text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(t => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Nessun task</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && token && (
        <CreateTaskModal
          onClose={() => setShowModal(false)}
          onCreate={task => setTasks(ts => [task, ...ts])}
          clients={clients}
          token={token}
        />
      )}
    </div>
  );
}
