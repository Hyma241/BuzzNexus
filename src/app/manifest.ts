import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BuzzNexus Realtime Quiz Battle',
    short_name: 'BuzzNexus',
    description: 'AI-powered realtime classroom quiz battle platform with cinematic animations and live lobbies.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050308',
    theme_color: '#8B5CF6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
