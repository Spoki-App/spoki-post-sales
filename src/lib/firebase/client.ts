'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { config } from '@/lib/config';

let app: FirebaseApp;
let auth: Auth;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existing = getApps()[0];
    app = existing ?? initializeApp(config.firebase);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}
