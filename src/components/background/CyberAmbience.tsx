'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

/** Floating cyber particles & data lines — no flowers (flowers live on credential only) */
export default function CyberAmbience() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 7) % 100}%`,
        top: `${(i * 23 + 11) % 100}%`,
        size: 2 + (i % 3),
        hue: i % 3 === 0 ? '#FF4DCA' : i % 3 === 1 ? '#22D3EE' : '#A78BFA',
        delay: (i % 7) * 0.4,
        duration: 14 + (i % 9),
      })),
    []
  );

  const dataLines = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: `${5 + i * 7}%`,
        delay: i * 0.35,
        duration: 10 + (i % 5),
      })),
    []
  );

  const rings = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        left: `${15 + i * 14}%`,
        top: `${20 + (i * 13) % 60}%`,
        size: 40 + i * 18,
        delay: i * 1.2,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {rings.map((r) => (
        <motion.div
          key={`ring-${r.id}`}
          className="absolute rounded-full border border-violet-500/10"
          style={{ left: r.left, top: r.top, width: r.size, height: r.size }}
          animate={{
            opacity: [0.15, 0.35, 0.15],
            scale: [1, 1.08, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20 + r.id, delay: r.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {dataLines.map((line) => (
        <motion.div
          key={`line-${line.id}`}
          className="absolute w-px h-24 opacity-30"
          style={{
            left: line.left,
            background:
              'repeating-linear-gradient(180deg, transparent, transparent 4px, rgba(255,77,202,0.5) 4px, rgba(255,77,202,0.5) 8px)',
          }}
          initial={{ top: '-10%' }}
          animate={{ top: ['-10%', '110%'] }}
          transition={{
            duration: line.duration,
            delay: line.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.hue,
            boxShadow: `0 0 8px ${p.hue}`,
          }}
          animate={{
            y: [0, -40, -20, -55, 0],
            x: [0, 12, -6, 8, 0],
            opacity: [0.2, 0.7, 0.35, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Soft hex grid accent */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cyber-hex" width="48" height="42" patternUnits="userSpaceOnUse">
            <path
              d="M24 2 L44 14 L44 28 L24 40 L4 28 L4 14 Z"
              fill="none"
              stroke="#FF4DCA"
              strokeWidth="0.4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cyber-hex)" />
      </svg>
    </div>
  );
}
