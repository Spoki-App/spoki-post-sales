'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth';
import { alertsApi } from '@/lib/api/client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Bell, Check, Settings, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Alert, AlertRule, AlertSeverity } from '@/types';

const SEVERITY_VARIANTS: Record<AlertSeverity, 'danger' | 'warning' | 'info' | 'default'> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Basso',
};

function AlertItem({ alert, onResolve }: { alert: Alert; onResolve: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
      <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
        alert.severity === 'critical' || alert.severity === 'high' ? 'bg-red-500' :
        alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-400'
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <Badge variant={SEVERITY_VARIANTS[alert.severity]} size="sm">
            {SEVERITY_LABELS[alert.severity]}
          </Badge>
          {alert.clientName && (
            <Link href={`/clients/${alert.clientId}`} className="text-sm font-medium text-emerald-600 hover:underline">
              {alert.clientName}
            </Link>
          )}
        </div>
        <p className="text-sm text-slate-700">{alert.message}</p>
        <p className="text-xs text-slate-400 mt-1">
          {formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true, locale: it })}
        </p>
      </div>
      <button
        onClick={() => onResolve(alert.id)}
        title="Risolvi"
        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors shrink-0"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}

interface RuleRowProps {
  rule: AlertRule;
  onToggle: (id: string, enabled: boolean) => void;
}

function RuleRow({ rule, onToggle }: RuleRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{rule.name}</p>
        {rule.description && <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>}
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <Badge variant={SEVERITY_VARIANTS[rule.severity]} size="sm">
          {SEVERITY_LABELS[rule.severity]}
        </Badge>
        <button
          onClick={() => onToggle(rule.id, !rule.enabled)}
          className={`relative w-9 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const { token } = useAuthStore();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [alertsRes, rulesRes] = await Promise.all([
        alertsApi.list(token, { resolved: false }),
        alertsApi.listRules(token),
      ]);
      setAlerts(alertsRes.data);
      setTotal(alertsRes.total);
      setRules(rulesRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleResolve(id: string) {
    if (!token) return;
    await alertsApi.resolve(token, id);
    setAlerts(as => as.filter(a => a.id !== id));
    setTotal(t => t - 1);
  }

  async function handleToggleRule(id: string, enabled: boolean) {
    if (!token) return;
    await alertsApi.updateRule(token, id, { enabled });
    setRules(rs => rs.map(r => r.id === id ? { ...r, enabled } : r));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Alert</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} alert attivi</p>
        </div>
        <button
          onClick={() => setShowRules(s => !s)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          {showRules ? 'Vedi alert' : 'Configura regole'}
        </button>
      </div>

      {showRules ? (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Regole di alerting</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {rules.map(rule => (
              <RuleRow key={rule.id} rule={rule} onToggle={handleToggleRule} />
            ))}
          </div>
        </Card>
      ) : (
        <Card padding="none">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nessun alert attivo</p>
              <p className="text-sm text-slate-400 mt-1">Tutti i clienti sono in regola.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {alerts.map(alert => (
                <AlertItem key={alert.id} alert={alert} onResolve={handleResolve} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
