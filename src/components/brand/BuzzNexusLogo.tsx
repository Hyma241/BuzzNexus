'use client';

import React from 'react';

type Props = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
};

/** Inline SVG brand mark — B hex + lightning */
export default function BuzzNexusLogo({ size = 40, className = '', showWordmark = false }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="BuzzNexus"
      >
        <defs>
          <linearGradient id="bnx-grad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF4DCA" />
            <stop offset="0.5" stopColor="#A855F7" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
          <filter id="bnx-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M32 4L54 18V46L32 60L10 46V18L32 4Z"
          stroke="url(#bnx-grad)"
          strokeWidth="2.5"
          fill="rgba(11,8,19,0.85)"
          filter="url(#bnx-glow)"
        />
        <path
          d="M26 20H34C38 20 41 23 41 27C41 30 39 32 36 33C40 34 43 37 43 42C43 47 39 50 33 50H22V20H26ZM26 24V31H33C35.5 31 37 29.5 37 27.5C37 25.5 35.5 24 33 24H26ZM26 35V46H34C37.5 46 39 44 39 41.5C39 39 37.5 37 34 37H26Z"
          fill="url(#bnx-grad)"
        />
        <path
          d="M44 14L48 22L56 24L48 26L44 34L40 26L32 24L40 22L44 14Z"
          fill="#22D3EE"
          opacity="0.9"
        />
      </svg>
      {showWordmark && (
        <span className="font-orbitron font-black text-sm tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] via-violet-300 to-cyan-300">
          BUZZNEXUS
        </span>
      )}
    </div>
  );
}
