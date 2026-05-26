'use client';

import React from 'react';
import {
  BADGE_CLIP_CSS,
  BADGE_H,
  BADGE_POINTS,
  BADGE_POINTS_INNER,
  BADGE_W,
} from '@/components/badges/badgeShape';

type Props = {
  children: React.ReactNode;
  className?: string;
  innerRef?: React.Ref<HTMLDivElement>;
};

/** Visible octagonal badge shell — not a rectangle */
export default function BadgeOctagonFrame({ children, className = '', innerRef }: Props) {
  return (
    <div
      className={`relative mx-auto ${className}`}
      style={{ width: BADGE_W, height: BADGE_H }}
    >
      {/* SVG badge outline (crisp neon frame) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-30"
        viewBox={`0 0 ${BADGE_W} ${BADGE_H}`}
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="badge-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF4DCA" />
            <stop offset="50%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="badge-glow">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polygon
          points={BADGE_POINTS}
          fill="rgba(0,0,0,0.01)"
          stroke="url(#badge-border-grad)"
          strokeWidth="2.5"
          filter="url(#badge-glow)"
        />
        <polygon
          points={BADGE_POINTS_INNER}
          stroke="rgba(34,211,238,0.45)"
          strokeWidth="1"
          fill="none"
        />
      </svg>

      <div
        ref={innerRef}
        className="absolute inset-0 flex flex-col items-center px-6 py-8 overflow-hidden"
        style={{
          clipPath: BADGE_CLIP_CSS,
          WebkitClipPath: BADGE_CLIP_CSS,
          background: 'linear-gradient(165deg, #0f0818 0%, #000000 48%, #080510 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 3px)',
          }}
        />
        {children}
      </div>
    </div>
  );
}
