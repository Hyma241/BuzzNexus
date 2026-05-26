'use client';

import { motion } from 'framer-motion';

type Hue = 'pink' | 'purple' | 'cyan';

const COLORS: Record<Hue, { stroke: string; glow: string; vein: string }> = {
  pink: { stroke: '#FF4DCA', glow: 'rgba(255,77,202,0.65)', vein: 'rgba(255,77,202,0.35)' },
  purple: { stroke: '#A78BFA', glow: 'rgba(167,139,250,0.55)', vein: 'rgba(139,92,246,0.35)' },
  cyan: { stroke: '#22D3EE', glow: 'rgba(34,211,238,0.5)', vein: 'rgba(34,211,238,0.3)' },
};

type LilyProps = {
  hue: Hue;
  uid: string;
  className?: string;
  scale?: number;
};

/** Outline neon lily — wireframe petals + veins (credential only) */
export function CredentialLily({ hue, uid, className = '', scale = 1 }: LilyProps) {
  const c = COLORS[hue];
  const gid = `glow-${uid}`;

  return (
    <svg
      className={className}
      viewBox="0 0 120 160"
      fill="none"
      style={{ transform: `scale(${scale})`, filter: `drop-shadow(0 0 12px ${c.glow})` }}
      aria-hidden
    >
      <defs>
        <filter id={gid} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter={`url(#${gid})`}>
        {/* stem */}
        <path
          d="M60 148 Q58 110 60 78 Q62 48 60 22"
          stroke={c.stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* 6 outline lily petals */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 60 58)`}>
            <path
              d="M60 58 L60 14 C44 22 42 42 60 58 C78 42 76 22 60 14 Z"
              fill="rgba(0,0,0,0.15)"
              stroke={c.stroke}
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
            <path d="M60 22 L60 50 M54 34 L66 34" stroke={c.vein} strokeWidth="0.45" />
          </g>
        ))}

        {/* center spark */}
        <circle cx="60" cy="58" r="5" fill="none" stroke={c.stroke} strokeWidth="0.8" opacity="0.8" />
        <circle cx="60" cy="58" r="2" fill={c.stroke} opacity="0.6" />

        {/* digital flecks */}
        <circle cx="22" cy="90" r="1.2" fill={c.stroke} opacity="0.6" />
        <circle cx="98" cy="70" r="1" fill={c.stroke} opacity="0.5" />
        <path d="M14 120 h10 M96 40 h8" stroke={c.stroke} strokeWidth="0.4" opacity="0.35" />
      </g>
    </svg>
  );
}

type ClusterProps = {
  side: 'left' | 'right';
};

/** Animated floral cluster framing the credential card */
export function CredentialFloralCluster({ side }: ClusterProps) {
  const flip = side === 'right' ? 'scale-x-[-1]' : '';
  const pos = side === 'left' ? 'left-0' : 'right-0';

  return (
    <div
      className={`credential-floral-decor absolute ${pos} top-0 bottom-0 w-[42%] pointer-events-none overflow-visible`}
      style={{ transform: flip }}
    >
      <motion.div
        className="absolute -left-2 top-[8%] w-[90px] h-[120px]"
        animate={{ y: [0, -10, 4, -8, 0], rotate: [0, 2, -2, 1, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <CredentialLily hue="pink" uid={`${side}-a`} scale={0.95} />
      </motion.div>

      <motion.div
        className="absolute left-4 top-[42%] w-[75px] h-[100px]"
        animate={{ y: [0, 12, -6, 10, 0], rotate: [0, -3, 2, 0, 0] }}
        transition={{ duration: 11, delay: 0.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <CredentialLily hue="purple" uid={`${side}-b`} scale={0.78} />
      </motion.div>

      <motion.div
        className="absolute left-8 top-[68%] w-[60px] h-[80px] opacity-80"
        animate={{ y: [0, -8, 6, 0], opacity: [0.5, 0.85, 0.6, 0.5] }}
        transition={{ duration: 8, delay: 1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <CredentialLily hue="cyan" uid={`${side}-c`} scale={0.62} />
      </motion.div>
    </div>
  );
}

/** Corner accent blooms */
export function CredentialCornerBloom({ corner, hue }: { corner: 'tl' | 'tr' | 'bl' | 'br'; hue: Hue }) {
  const pos = {
    tl: 'left-2 top-2',
    tr: 'right-2 top-2 scale-x-[-1]',
    bl: 'left-2 bottom-16',
    br: 'right-2 bottom-16 scale-x-[-1]',
  }[corner];

  return (
    <motion.div
      className={`credential-floral-decor absolute ${pos} w-14 h-20 opacity-70`}
      animate={{ opacity: [0.4, 0.75, 0.45], scale: [1, 1.05, 1] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
    >
      <CredentialLily hue={hue} uid={`corner-${corner}`} scale={0.45} />
    </motion.div>
  );
}
