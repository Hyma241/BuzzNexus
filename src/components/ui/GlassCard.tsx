'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  glowColor?: 'none' | 'pink' | 'purple';
  hoverEffect?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function GlassCard({
  children,
  glowColor = 'none',
  hoverEffect = false,
  className = '',
  title,
  subtitle,
}: GlassCardProps) {
  let glowStyle = 'glass-morphism';
  if (glowColor === 'pink') glowStyle = 'glass-morphism-glow-pink';
  else if (glowColor === 'purple') glowStyle = 'glass-morphism-glow-purple';

  const hoverMotion = hoverEffect
    ? {
        whileHover: {
          y: -3,
          boxShadow: '0 20px 40px rgba(0,0,0,0.35), 0 0 24px rgba(139,92,246,0.12)',
        },
        transition: { duration: 0.25 },
      }
    : {};

  return (
    <motion.div
      {...hoverMotion}
      className={`arena-panel rounded-2xl p-6 md:p-7 relative overflow-hidden ${glowStyle} ${className}`}
    >
      {/* Top accent beam */}
      <div
        className={`absolute top-0 left-0 right-0 h-px ${
          glowColor === 'pink'
            ? 'bg-gradient-to-r from-transparent via-[#FF4DCA]/60 to-transparent'
            : glowColor === 'purple'
              ? 'bg-gradient-to-r from-transparent via-[#8B5CF6]/60 to-transparent'
              : 'bg-gradient-to-r from-transparent via-white/10 to-transparent'
        }`}
      />

      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#FF4DCA]/40 rounded-tl-sm" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-violet-500/40 rounded-tr-sm" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-violet-500/30 rounded-bl-sm" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#FF4DCA]/30 rounded-br-sm" />

      {(title || subtitle) && (
        <div className="relative z-10 mb-6 pb-4 border-b border-white/5">
          {title && (
            <h3 className="font-orbitron font-bold text-lg text-white tracking-wide">{title}</h3>
          )}
          {subtitle && (
            <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-[0.2em] mt-1">
              {subtitle}
            </p>
          )}
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
