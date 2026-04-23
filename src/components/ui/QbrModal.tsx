'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { aiApi, clientsApi, qbrApi } from '@/lib/api/client';
import {
  X, Loader2, Presentation, ChevronLeft, ChevronRight,
  Copy, Check, Download, Send, Users,
} from 'lucide-react';
import type { Contact } from '@/types';

interface Slide {
  title: string;
  content: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

const SLIDE_BG: Record<string, string> = {
  intro: 'bg-[#1a1f1d]',
  metrics: 'bg-[#119F51]',
  engagement: 'bg-[#16D46C]',
  issues: 'bg-[#0B6A36]',
  onboarding: 'bg-[#119F51]',
  actions: 'bg-[#0B6A36]',
  closing: 'bg-[#1a1f1d]',
};

const SLIDE_TEXT: Record<string, string> = {
  intro: 'text-white',
  metrics: 'text-white',
  engagement: 'text-[#1a1f1d]',
  issues: 'text-white',
  onboarding: 'text-white',
  actions: 'text-white',
  closing: 'text-white',
};

interface SlideTheme { bg: [number, number, number]; text: [number, number, number]; accent: [number, number, number] }

const PDF_THEMES: Record<string, SlideTheme> = {
  intro:      { bg: [26, 31, 29],   text: [255, 255, 255], accent: [22, 212, 108] },
  metrics:    { bg: [17, 159, 81],   text: [255, 255, 255], accent: [231, 250, 240] },
  engagement: { bg: [231, 250, 240], text: [26, 31, 29],    accent: [22, 212, 108] },
  issues:     { bg: [11, 106, 54],   text: [255, 255, 255], accent: [197, 244, 218] },
  onboarding: { bg: [17, 159, 81],   text: [255, 255, 255], accent: [231, 250, 240] },
  actions:    { bg: [11, 106, 54],   text: [255, 255, 255], accent: [197, 244, 218] },
  closing:    { bg: [26, 31, 29],    text: [255, 255, 255], accent: [22, 212, 108] },
};

async function generatePdfBase64(slides: Slide[], clientName: string): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const GREEN: [number, number, number] = [22, 212, 108];
  const DARK: [number, number, number] = [26, 31, 29];

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage();
    const s = slides[i];
    const theme = PDF_THEMES[s.type] ?? PDF_THEMES.intro;

    // Background
    doc.setFillColor(...theme.bg);
    doc.rect(0, 0, W, H, 'F');

    // Green accent bar at top
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 3, 'F');

    // Top bar: SPOKI logo + slide counter
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREEN);
    doc.text('SPOKI', 20, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.accent);
    doc.text(`${i + 1} / ${slides.length}`, W / 2, 16, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(...theme.accent);
    doc.text(clientName, W - 20, 16, { align: 'right' });

    // Decorative left accent line
    doc.setFillColor(...GREEN);
    doc.rect(20, 28, 3, 20, 'F');

    // Title
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...theme.text);
    const titleLines = doc.splitTextToSize(s.title, W - 70) as string[];
    doc.text(titleLines, 28, 36);

    // Separator
    const sepY = 36 + titleLines.length * 9 + 4;
    doc.setDrawColor(...theme.accent);
    doc.setLineWidth(0.3);
    doc.line(20, sepY, 100, sepY);

    // Content
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.text);
    const contentLines = doc.splitTextToSize(s.content, W - 44) as string[];
    doc.text(contentLines.slice(0, 24), 22, sepY + 8);

    // Footer bar
    doc.setFillColor(...DARK);
    doc.rect(0, H - 10, W, 10, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text('SPOKI', 20, H - 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('WhatsApp Business Platform', 38, H - 4);
    doc.text('spoki.it', W - 20, H - 4, { align: 'right' });
  }

  const arrayBuf = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

type QbrLanguage = 'it' | 'en' | 'es';
const LANG_OPTIONS: { value: QbrLanguage; label: string }[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Espanol' },
];

export function QbrModal({ open, onClose, clientId, clientName }: Props) {
  const { token } = useAuthStore();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<QbrLanguage>('it');

  const [showSendPanel, setShowSendPanel] = useState(false);
  const [contacts, setContacts] = useState<(Contact & { communicationRoles?: string[] })[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSendResult(null);
    }
  }, [open]);

  const loadContacts = useCallback(async () => {
    if (!token || contacts.length > 0) return;
    setContactsLoading(true);
    try {
      const res = await clientsApi.getContacts(token, clientId);
      setContacts((res.data ?? []).filter(c => c.email));
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, [token, clientId, contacts.length]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!token) {
      setError("Sessione non valida: effettua di nuovo l'accesso.");
      return;
    }
    setLoading(true);
    setCurrent(0);
    setError(null);
    setShowSendPanel(false);
    setSendResult(null);
    try {
      const res = await aiApi.generateQbr(token, clientId, language);
      setSlides(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generazione QBR non riuscita');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    const text = slides.map((s, i) => `--- SLIDE ${i + 1}: ${s.title} ---\n\n${s.content}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPdf = async () => {
    try {
      const b64 = await generatePdfBase64(slides, clientName);
      const byteChars = atob(b64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QBR_${clientName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Errore durante la generazione del PDF');
    }
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleAll = () => {
    const allEmails = contacts.map(c => c.email!);
    if (selectedEmails.size === allEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(allEmails));
    }
  };

  const openSendPanel = () => {
    setShowSendPanel(true);
    setSendResult(null);
    loadContacts();
  };

  const handleSend = async () => {
    if (!token || selectedEmails.size === 0) return;
    setSending(true);
    setSendResult(null);
    setError(null);
    try {
      const b64 = await generatePdfBase64(slides, clientName);
      await qbrApi.send(token, clientName, [...selectedEmails], b64, language);
      setSendResult(`QBR inviata a ${selectedEmails.size} contatt${selectedEmails.size === 1 ? 'o' : 'i'}`);
      setSelectedEmails(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invio fallito');
    } finally {
      setSending(false);
    }
  };

  const slide = slides[current];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">QBR - Quarterly Business Review</h2>
            <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {slides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-8">
              <Presentation className="w-12 h-12 text-purple-300 mb-4" />
              <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                Genera una presentazione da condividere con il cliente: percorso e temi emersi solo da email e meeting.
              </p>
              <div className="flex items-center gap-1.5 mb-5">
                {LANG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLanguage(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      language === opt.value
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {error && (
                <p className="text-sm text-red-600 mb-4 text-center max-w-md" role="alert">
                  {error}
                </p>
              )}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />}
                {loading ? 'Generazione in corso...' : 'Genera QBR'}
              </button>
            </div>
          ) : slide ? (
            <div className="p-6">
              {/* Slide preview */}
              <div className={`rounded-xl ${SLIDE_BG[slide.type] ?? SLIDE_BG.intro} ${SLIDE_TEXT[slide.type] ?? SLIDE_TEXT.intro} p-8 mb-4 min-h-[280px] max-h-[480px] flex flex-col`}>
                <p className="text-xs uppercase tracking-wider opacity-70 mb-2">Slide {current + 1} / {slides.length}</p>
                <h3 className="text-2xl font-bold mb-4">{slide.title}</h3>
                <div className="flex-1 text-sm leading-relaxed whitespace-pre-wrap opacity-90 overflow-y-auto">
                  {slide.content}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrent(c => Math.max(0, c - 1))}
                  disabled={current === 0}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-purple-600' : 'bg-slate-300'}`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setCurrent(c => Math.min(slides.length - 1, c + 1))}
                  disabled={current === slides.length - 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Actions */}
              {error && (
                <p className="text-sm text-red-600 mt-3" role="alert">
                  {error}
                </p>
              )}
              {sendResult && (
                <p className="text-sm text-emerald-600 mt-3 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> {sendResult}
                </p>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Rigenera
                </button>
                <button
                  onClick={copyAll}
                  className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiato' : 'Copia'}
                </button>
                <button
                  onClick={downloadPdf}
                  className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  onClick={openSendPanel}
                  className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Invia
                </button>
              </div>

              {/* Send panel */}
              {showSendPanel && (
                <div className="mt-4 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Seleziona destinatari
                    </h4>
                    {contacts.length > 0 && (
                      <button
                        onClick={toggleAll}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                      >
                        {selectedEmails.size === contacts.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                      </button>
                    )}
                  </div>

                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-sm">Caricamento contatti...</span>
                    </div>
                  ) : contacts.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">Nessun contatto con email trovato per questa azienda.</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {contacts.map(c => (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            selectedEmails.has(c.email!)
                              ? 'bg-purple-50 border border-purple-200'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmails.has(c.email!)}
                            onChange={() => toggleEmail(c.email!)}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{c.email}{c.jobTitle ? ` - ${c.jobTitle}` : ''}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {contacts.length > 0 && (
                    <button
                      onClick={handleSend}
                      disabled={sending || selectedEmails.size === 0}
                      className="w-full mt-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Invio in corso...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Invia a {selectedEmails.size} contatt{selectedEmails.size === 1 ? 'o' : 'i'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
