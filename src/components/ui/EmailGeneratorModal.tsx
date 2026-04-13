'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { aiApi } from '@/lib/api/client';
import { X, Loader2, Mail, Copy, Check } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

const EMAIL_TYPES = [
  { id: 'follow_up', label: 'Follow-up', desc: 'Riprendere il contatto dopo un periodo di silenzio' },
  { id: 'renewal', label: 'Rinnovo', desc: 'Promemoria e discussione rinnovo contratto' },
  { id: 'onboarding', label: 'Onboarding', desc: 'Supporto durante il percorso di onboarding' },
  { id: 'reactivation', label: 'Riattivazione', desc: 'Riattivare un cliente inattivo' },
  { id: 'custom', label: 'Personalizzata', desc: 'Email con istruzioni specifiche' },
] as const;

export function EmailGeneratorModal({ open, onClose, clientId, clientName }: Props) {
  const { token } = useAuthStore();
  const [type, setType] = useState<string>('follow_up');
  const [customInstructions, setCustomInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!token) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await aiApi.generateEmail(token, clientId, type, type === 'custom' ? customInstructions : undefined);
      setResult(res.data ?? null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const copyToClipboard = (text: string, field: 'subject' | 'body') => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Genera Email</h2>
            <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!result ? (
            <>
              {/* Type selector */}
              <div className="grid grid-cols-2 gap-2">
                {EMAIL_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      type === t.id
                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>

              {type === 'custom' && (
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Descrivi cosa vuoi comunicare al cliente..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 h-24 resize-none"
                />
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || (type === 'custom' && !customInstructions.trim())}
                className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Generazione in corso...' : 'Genera email'}
              </button>
            </>
          ) : (
            <>
              {/* Result */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-500">OGGETTO</p>
                  <button onClick={() => copyToClipboard(result.subject, 'subject')} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1">
                    {copied === 'subject' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'subject' ? 'Copiato' : 'Copia'}
                  </button>
                </div>
                <div className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-800 border border-slate-200">
                  {result.subject}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-500">CORPO</p>
                  <button onClick={() => copyToClipboard(result.body, 'body')} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1">
                    {copied === 'body' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'body' ? 'Copiato' : 'Copia'}
                  </button>
                </div>
                <div className="px-3 py-3 bg-slate-50 rounded-lg text-sm text-slate-800 border border-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {result.body}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setResult(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Rigenera
                </button>
                <button
                  onClick={() => { copyToClipboard(`${result.subject}\n\n${result.body}`, 'body'); }}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copia tutto
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
