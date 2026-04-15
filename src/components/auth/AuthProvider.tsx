'use client';

import { useEffect } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setToken, setLoading } = useAuthStore();

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
          const token = await user.getIdToken();
          setToken(token);
        } else {
          setToken(null);
        }
      } catch {
        // If token retrieval fails, force logout state to avoid infinite loading in protected layouts.
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [setUser, setToken, setLoading]);

  return <>{children}</>;
}
