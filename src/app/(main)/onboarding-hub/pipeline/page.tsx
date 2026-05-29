'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth';
import { onboardingHubApi } from '@/lib/api/client';
import { OnboardingKanban, type OnboardingCard } from '@/components/onboarding-hub/OnboardingKanban';
import { Loader2 } from 'lucide-react';

export default function OnboardingPipelinePage() {
  const { token } = useAuthStore();
  const [cards, setCards] = useState<OnboardingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    onboardingHubApi.pipeline(token)
      .then(res => setCards(res.data?.cards ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Errore'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        Lo stage di ogni cliente corrisponde al ticket di onboarding su HubSpot. I dati si aggiornano con la sync giornaliera.
      </p>
      <OnboardingKanban cards={cards} />
    </div>
  );
}
