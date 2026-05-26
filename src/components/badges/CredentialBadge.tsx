'use client';

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Star, Loader2 } from 'lucide-react';
import BuzzNexusLogo from '@/components/brand/BuzzNexusLogo';
import BadgeOctagonFrame from '@/components/badges/BadgeOctagonFrame';
import { BADGE_CLIP_CSS, BADGE_H, BADGE_W } from '@/components/badges/badgeShape';
import {
  CredentialFloralCluster,
  CredentialCornerBloom,
} from '@/components/badges/CredentialFloral';
import { downloadBadgeScreenshot } from '@/lib/credentialExport';

export type CredentialBadgeProps = {
  studentName: string;
  score: number;
  role?: string;
  arenaCode?: string;
  tier?: 'bronze' | 'silver' | 'gold' | 'elite';
  onDownload?: () => void;
};

const CAPTURE_W = 360;
const CAPTURE_H = 520;

function Laurel({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      className={`w-10 h-16 opacity-80 ${side === 'right' ? 'scale-x-[-1]' : ''}`}
      viewBox="0 0 40 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M20 4 Q8 20 12 40 Q16 52 20 60 Q24 52 28 40 Q32 20 20 4"
        stroke={side === 'left' ? '#FF4DCA' : '#A78BFA'}
        strokeWidth="1.2"
      />
    </svg>
  );
}

function StarsArc() {
  const sizes = [12, 14, 20, 14, 12];
  const colors = ['#e9d5ff', '#e9d5ff', '#A78BFA', '#e9d5ff', '#e9d5ff'];
  return (
    <div className="flex items-end justify-center gap-1.5 mb-1">
      {sizes.map((s, i) => (
        <Star
          key={i}
          className="shrink-0"
          style={{ width: s, height: s, color: colors[i], fill: i === 2 ? colors[i] : 'transparent' }}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

export default function CredentialBadge({
  studentName,
  score,
  role = 'Arena Contender',
  onDownload,
}: CredentialBadgeProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    setDownloading(true);
    setDownloadError('');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const ok = await downloadBadgeScreenshot(captureRef.current, studentName);
      if (!ok) {
        setDownloadError('Could not save file. Allow downloads for this site in browser settings.');
      }
    } catch (err) {
      console.error('[credential download]', err);
      setDownloadError('Download error. Try Chrome/Edge and allow downloads.');
    }
    setDownloading(false);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 90, damping: 14 }}
        className="relative"
      >
        {/* On-screen decorations — NOT included in download */}
        <div
          className="relative mx-auto pointer-events-none"
          style={{ width: CAPTURE_W, height: CAPTURE_H }}
          aria-hidden
        >
          <CredentialFloralCluster side="left" />
          <CredentialFloralCluster side="right" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="relative" style={{ width: BADGE_W, height: BADGE_H }}>
              <CredentialCornerBloom corner="tl" hue="cyan" />
              <CredentialCornerBloom corner="tr" hue="pink" />
              <CredentialCornerBloom corner="bl" hue="purple" />
              <CredentialCornerBloom corner="br" hue="pink" />
            </div>
          </div>
        </div>

        {/* Download = badge only (no flowers outside outline) */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: BADGE_W, height: BADGE_H }}
        >
          <div
            ref={captureRef}
            className="relative w-full h-full overflow-hidden"
            style={{
              clipPath: BADGE_CLIP_CSS,
              WebkitClipPath: BADGE_CLIP_CSS,
            }}
          >
            <BadgeOctagonFrame>
              <div className="relative z-10 flex flex-col items-center gap-2 mt-1">
                <div className="rounded-xl border border-pink-500/50 bg-black/70 p-2 shadow-[0_0_24px_rgba(255,77,202,0.35)]">
                  <BuzzNexusLogo size={48} />
                </div>
                <h1 className="font-orbitron font-black text-lg tracking-[0.2em]">
                  <span className="text-[#FF4DCA]">BUZZ</span>
                  <span
                    data-export-brand
                    className="text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-[#8B5CF6]"
                  >
                    NEXUS
                  </span>
                </h1>
              </div>

              <div className="relative z-10 text-center mt-4 flex-1 flex flex-col justify-center px-2">
                <p className="font-orbitron font-bold text-3xl text-white tracking-wide">
                  {studentName}
                </p>
                <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.35em] mt-2 flex items-center justify-center gap-2">
                  <span className="h-px w-6 bg-neutral-600" />
                  {role}
                  <span className="h-px w-6 bg-neutral-600" />
                </p>
              </div>

              <div className="relative z-10 w-full flex flex-col items-center pb-1">
                <StarsArc />
                <div className="flex items-center justify-center gap-2 w-full px-2">
                  <Laurel side="left" />
                  <div className="text-center">
                    <p
                      data-export-score
                      className="font-orbitron font-black text-6xl leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#FF4DCA] via-fuchsia-400 to-[#8B5CF6]"
                      style={{ filter: 'drop-shadow(0 0 14px rgba(255,77,202,0.55))' }}
                    >
                      {score}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.4em] mt-1">
                      POINTS
                    </p>
                  </div>
                  <Laurel side="right" />
                </div>
              </div>

              <div className="relative z-10 text-center mt-auto pt-3 pb-1">
                <p className="text-[9px] font-mono tracking-[0.2em] text-neutral-500">
                  <span className="text-neutral-400">PLAY. LEARN. </span>
                  <span className="text-[#FF4DCA] font-semibold">DOMINATE.</span>
                </p>
                <div className="mx-auto mt-2 w-6 h-6 flex items-center justify-center rounded-sm bg-black/80 border border-pink-500/40">
                  <Star className="w-3 h-3 text-[#FF4DCA]" fill="#FF4DCA" />
                </div>
              </div>
            </BadgeOctagonFrame>
          </div>
        </div>
      </motion.div>

      {downloadError && (
        <p className="text-xs font-mono text-red-400 text-center max-w-xs">{downloadError}</p>
      )}

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 px-6 py-3 rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/80 to-fuchsia-950/50 text-violet-100 text-xs font-mono font-bold tracking-wider hover:border-pink-500/50 disabled:opacity-60 transition-all"
      >
        {downloading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            CAPTURING BADGE...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            DOWNLOAD CREDENTIAL
          </>
        )}
      </button>
    </div>
  );
}
