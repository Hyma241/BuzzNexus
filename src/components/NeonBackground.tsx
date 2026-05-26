'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import CyberAmbience from '@/components/background/CyberAmbience';
import NeonFlower, { FLOWER_LAYOUT } from '@/components/background/NeonFlower';

/**
 * Global backdrop — floating neon flower line art + cyber particles (all screens).
 */
export default function NeonBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_0%,#1a0f2e_0%,#000000_55%,#000000_100%)]" />

      {mounted && (
        <>
          <motion.div
            className="absolute -top-[20%] -left-[10%] w-[70%] h-[60%] rounded-full opacity-35"
            style={{
              background: 'radial-gradient(circle, rgba(255,77,202,0.28) 0%, transparent 70%)',
              filter: 'blur(80px)',
            }}
            animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-[30%] -right-[15%] w-[55%] h-[55%] rounded-full opacity-30"
            style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.32) 0%, transparent 70%)',
              filter: 'blur(90px)',
            }}
            animate={{ x: [0, -50, 0], y: [0, -20, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[-15%] left-[20%] w-[50%] h-[45%] rounded-full opacity-25"
            style={{
              background: 'radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%)',
              filter: 'blur(70px)',
            }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floating neon flower line art (all screens) */}
          <div className="absolute inset-0">
            {FLOWER_LAYOUT.map((f, i) => (
              <NeonFlower key={i} {...f} />
            ))}
          </div>

          <CyberAmbience />
        </>
      )}

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.55)_100%)]" />

      <motion.div
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent"
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
