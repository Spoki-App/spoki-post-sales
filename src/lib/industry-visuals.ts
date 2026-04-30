import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Building2,
  Car,
  Cpu,
  Dumbbell,
  Factory,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Layers,
  Megaphone,
  Scale,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sprout,
  Stethoscope,
  Truck,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

export type IndustryVisual = {
  Icon: LucideIcon;
  iconWrap: string;
  bar: string;
};

const DEFAULT: IndustryVisual = {
  Icon: Briefcase,
  iconWrap: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/90',
  bar: '#64748b',
};

const RULES: Array<{ re: RegExp; v: IndustryVisual }> = [
  {
    re: /retail|commerc|gdo|negozi|e-?commerce|ecommerce|distribut/i,
    v: {
      Icon: ShoppingBag,
      iconWrap: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/70',
      bar: '#e11d48',
    },
  },
  {
    re: /hotel|hospitality|ristor|food\s*service|bar\s|turismo|travel|ospitalit/i,
    v: {
      Icon: UtensilsCrossed,
      iconWrap: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70',
      bar: '#d97706',
    },
  },
  {
    re: /automotive|auto|mobility|motor|concessionari/i,
    v: {
      Icon: Car,
      iconWrap: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70',
      bar: '#2563eb',
    },
  },
  {
    re: /health|healthcare|salute|medico|ospedal|clinic|dent|wellness/i,
    v: {
      Icon: Stethoscope,
      iconWrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70',
      bar: '#059669',
    },
  },
  {
    re: /pharma|farmaceut|biotech/i,
    v: {
      Icon: HeartPulse,
      iconWrap: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200/70',
      bar: '#0d9488',
    },
  },
  {
    re: /finance|banking|assicur|finanz|fintech|credit/i,
    v: {
      Icon: Landmark,
      iconWrap: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70',
      bar: '#4f46e5',
    },
  },
  {
    re: /education|formazione|scuol|univers|academy|edtech/i,
    v: {
      Icon: GraduationCap,
      iconWrap: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70',
      bar: '#7c3aed',
    },
  },
  {
    re: /manufactur|industr|produzi|metal|meccan|chimic/i,
    v: {
      Icon: Factory,
      iconWrap: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/70',
      bar: '#ea580c',
    },
  },
  {
    re: /real\s*estate|immobil|costruz|ediliz|propert/i,
    v: {
      Icon: Home,
      iconWrap: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200/70',
      bar: '#0284c7',
    },
  },
  {
    re: /tech|software|it\b|digital|saas|informatic|cloud|cyber/i,
    v: {
      Icon: Cpu,
      iconWrap: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200/70',
      bar: '#0891b2',
    },
  },
  {
    re: /energy|energia|utility|utilities|oil|gas|renewable/i,
    v: {
      Icon: Zap,
      iconWrap: 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200/70',
      bar: '#ca8a04',
    },
  },
  {
    re: /logist|trasport|shipping|freight|spedizion|warehouse/i,
    v: {
      Icon: Truck,
      iconWrap: 'bg-stone-100 text-stone-800 ring-1 ring-stone-300/80',
      bar: '#57534e',
    },
  },
  {
    re: /fashion|moda|textil|abbigliamento|luxe/i,
    v: {
      Icon: Shirt,
      iconWrap: 'bg-fuchsia-50 text-fuchsia-800 ring-1 ring-fuchsia-200/70',
      bar: '#a21caf',
    },
  },
  {
    re: /beauty|bellezza|cosmet|esthetic|parrucch/i,
    v: {
      Icon: Sparkles,
      iconWrap: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200/70',
      bar: '#db2777',
    },
  },
  {
    re: /sport|fitness|gym|atlet/i,
    v: {
      Icon: Dumbbell,
      iconWrap: 'bg-lime-50 text-lime-800 ring-1 ring-lime-200/70',
      bar: '#65a30d',
    },
  },
  {
    re: /media|marketing|comunicaz|advert|agenzia\s*pubblicit/i,
    v: {
      Icon: Megaphone,
      iconWrap: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/70',
      bar: '#9333ea',
    },
  },
  {
    re: /agric|agro|food\s&|alimentar|vino|viticol/i,
    v: {
      Icon: Sprout,
      iconWrap: 'bg-green-50 text-green-800 ring-1 ring-green-200/70',
      bar: '#15803d',
    },
  },
  {
    re: /legal|legale|law|avvocat|notai/i,
    v: {
      Icon: Scale,
      iconWrap: 'bg-neutral-100 text-neutral-800 ring-1 ring-neutral-300/80',
      bar: '#404040',
    },
  },
  {
    re: /nonprofit|non-profit|ong|associazion|fondazion/i,
    v: {
      Icon: Building2,
      iconWrap: 'bg-slate-50 text-slate-800 ring-1 ring-slate-200/80',
      bar: '#475569',
    },
  },
  {
    re: /non classificat|uncategor|other|altro|n\/a/i,
    v: {
      Icon: Layers,
      iconWrap: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80',
      bar: '#94a3b8',
    },
  },
];

export function getIndustryVisual(key: string | null, label: string): IndustryVisual {
  const haystack = `${key ?? ''} ${label}`;
  for (const { re, v } of RULES) {
    if (re.test(haystack)) return v;
  }
  return DEFAULT;
}

export function industryStableId(rowKey: string | null): string {
  return rowKey === null ? '__unclassified__' : rowKey;
}

export function industryFilterParam(stableId: string): string {
  return stableId === '__unclassified__' ? '__none__' : stableId;
}
