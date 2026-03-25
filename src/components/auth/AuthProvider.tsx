'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useAuthStore } from '@/lib/store/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setToken, setLoading } = useAuthStore();

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const token = await user.getIdToken();
        setToken(token);
      } else {
        setToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [setUser, setToken, setLoading]);

  return <>{children}</>;
}
