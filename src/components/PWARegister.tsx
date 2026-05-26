'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('BuzzNexus Service Worker registered on scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('BuzzNexus Service Worker registration failed:', err);
        });
    }
  }, []);

  return null;
}
