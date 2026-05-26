'use client';

import { motion } from 'framer-motion';

type Props = {
  x: string;
  y: string;
  size: number;
  hue: 'pink' | 'purple' | 'cyan';
  delay: number;
  duration: number;
  rotate?: number;
};

/** Vibrant neon line-art — reference img 3 (slightly soft, not harsh) */
const PALETTE = {
  pink: {
    stroke: '#FF4DCA',
    glow: 'rgba(255,77,202,0.5)',
    fill: 'rgba(255,77,202,0.08)',
    vein: 'rgba(255,120,210,0.45)',
  },
  purple: {
    stroke: '#C084FC',
    glow: 'rgba(192,132,252,0.48)',
    fill: 'rgba(139,92,246,0.08)',
    vein: 'rgba(180,140,255,0.4)',
  },
  cyan: {
    stroke: '#22D3EE',
    glow: 'rgba(34,211,238,0.45)',
    fill: 'rgba(34,211,238,0.06)',
    vein: 'rgba(100,230,255,0.38)',
  },
};

export default function NeonFlower({ x, y, size, hue, delay, duration, rotate = 0 }: Props) {
  const c = PALETTE[hue];
  const uid = `nf-${hue}-${size}-${delay}`.replace(/\W/g, '');

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size * 1.45,
        rotate: `${rotate}deg`,
        filter: `drop-shadow(0 0 12px ${c.glow}) drop-shadow(0 0 24px ${c.glow})`,
      }}
      animate={{
        opacity: [0.32, 0.58, 0.38, 0.52, 0.32],
        y: [0, -36, -16, -44, 0],
        x: [0, 18, -12, 14, 0],
        rotate: [rotate, rotate + 6, rotate - 4, rotate + 5, rotate],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 100 145" className="w-full h-full" fill="none" aria-hidden>
        <defs>
          <filter id={`${uid}-g`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${uid}-g)`}>
          <path
            d="M50 132 Q47 98 50 70 Q53 44 50 16"
            stroke={c.stroke}
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.75"
          />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 50 54)`}>
              <path
                d="M50 54 L50 10 C34 18 32 40 50 54 C68 40 66 18 50 10 Z"
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth="1.05"
                strokeLinejoin="round"
                opacity="0.92"
              />
              <path d="M50 18 L50 46 M44 28 L56 28 M50 24 L50 50" stroke={c.vein} strokeWidth="0.45" />
            </g>
          ))}
          <circle cx="50" cy="54" r="5" fill="none" stroke={c.stroke} strokeWidth="0.85" opacity="0.9" />
          <circle cx="50" cy="54" r="2" fill={c.stroke} opacity="0.75" />
          {/* sparkle particles */}
          <circle cx="14" cy="82" r="1.3" fill={c.stroke} opacity="0.7" />
          <circle cx="88" cy="68" r="1" fill={c.stroke} opacity="0.6" />
          <circle cx="72" cy="118" r="0.8" fill={c.stroke} opacity="0.5" />
          <path d="M8 108 h9 M90 36 h8 M22 28 v6" stroke={c.stroke} strokeWidth="0.4" opacity="0.4" />
        </g>
      </svg>
    </motion.div>
  );
}

export const FLOWER_LAYOUT: Props[] = [
  { x: '1%', y: '5%', size: 95, hue: 'pink', delay: 0, duration: 24, rotate: -12 },
  { x: '70%', y: '3%', size: 82, hue: 'cyan', delay: 1.5, duration: 26, rotate: 8 },
  { x: '84%', y: '36%', size: 74, hue: 'purple', delay: 0.8, duration: 22, rotate: 15 },
  { x: '6%', y: '46%', size: 68, hue: 'purple', delay: 2.5, duration: 20, rotate: -8 },
  { x: '55%', y: '50%', size: 98, hue: 'pink', delay: 0.3, duration: 28, rotate: 5 },
  { x: '30%', y: '65%', size: 62, hue: 'cyan', delay: 3.5, duration: 23, rotate: -15 },
  { x: '88%', y: '70%', size: 56, hue: 'pink', delay: 2, duration: 21, rotate: 20 },
  { x: '0%', y: '76%', size: 72, hue: 'cyan', delay: 1.2, duration: 25, rotate: -5 },
  { x: '42%', y: '10%', size: 52, hue: 'purple', delay: 4, duration: 19, rotate: 10 },
  { x: '16%', y: '26%', size: 46, hue: 'pink', delay: 3, duration: 27, rotate: -18 },
  { x: '66%', y: '20%', size: 60, hue: 'cyan', delay: 5, duration: 22, rotate: 12 },
  { x: '48%', y: '80%', size: 54, hue: 'purple', delay: 4.5, duration: 24, rotate: -10 },
  { x: '12%', y: '2%', size: 50, hue: 'cyan', delay: 1.8, duration: 20, rotate: 6 },
  { x: '36%', y: '40%', size: 44, hue: 'pink', delay: 2.8, duration: 18, rotate: -22 },
  { x: '80%', y: '16%', size: 48, hue: 'purple', delay: 4.2, duration: 23, rotate: 14 },
  { x: '4%', y: '58%', size: 42, hue: 'pink', delay: 5.5, duration: 21, rotate: -14 },
  { x: '74%', y: '55%', size: 58, hue: 'cyan', delay: 0.6, duration: 26, rotate: 7 },
  { x: '24%', y: '86%', size: 52, hue: 'purple', delay: 3.2, duration: 22, rotate: -6 },
  { x: '90%', y: '45%', size: 40, hue: 'pink', delay: 6, duration: 17, rotate: 18 },
  { x: '46%', y: '28%', size: 38, hue: 'cyan', delay: 7, duration: 16, rotate: -20 },
  { x: '58%', y: '8%', size: 36, hue: 'purple', delay: 2.2, duration: 19, rotate: 25 },
  { x: '20%', y: '68%', size: 34, hue: 'cyan', delay: 4.8, duration: 20, rotate: -12 },
];
