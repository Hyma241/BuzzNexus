'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  X, Loader2, Radio, PresentationIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PdfProjectorModeProps {
  roomCode: string;
  roomId: string;
  isMentor: boolean;
  initialPages: string[];
  initialCurrentPage: number;
  initialTotalPages: number;
  pdfTitle: string;
  onExitPdfMode?: () => void;
}

export default function PdfProjectorMode({
  roomCode,
  roomId,
  isMentor,
  initialPages,
  initialCurrentPage,
  initialTotalPages,
  pdfTitle,
  onExitPdfMode,
}: PdfProjectorModeProps) {
  const [currentPage, setCurrentPage] = useState(initialCurrentPage);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [syncError, setSyncError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const totalPages = initialTotalPages || initialPages.length;

  // ── Realtime page sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`pdf-sync-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${roomCode}`,
        },
        (payload) => {
          const newPage = (payload.new as { pdf_current_page?: number }).pdf_current_page;
          if (newPage && newPage !== currentPage) {
            setCurrentPage(newPage);
            setImageLoaded(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, currentPage]);

  // ── Broadcast page change (mentor only) ─────────────────────────────────────
  const broadcastPageChange = useCallback(async (page: number) => {
    if (!isMentor) return;
    const { error } = await supabase
      .from('rooms')
      .update({ pdf_current_page: page })
      .eq('id', roomId);
    if (error) setSyncError('Sync failed. Retrying...');
    else setSyncError('');
  }, [isMentor, roomId]);

  const goTo = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(clamped);
    setImageLoaded(false);
    broadcastPageChange(clamped);
  }, [totalPages, broadcastPageChange]);

  const prev = useCallback(() => goTo(currentPage - 1), [currentPage, goTo]);
  const next = useCallback(() => goTo(currentPage + 1), [currentPage, goTo]);

  // ── Keyboard controls (mentor) ───────────────────────────────────────────────
  useEffect(() => {
    if (!isMentor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMentor, next, prev]);

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const pageUrl = initialPages[currentPage - 1] || '';

  // ── Thumbnail strip ──────────────────────────────────────────────────────────
  const thumbnailCount = Math.min(initialPages.length, 8);
  const thumbnailStart = Math.max(0, Math.min(currentPage - Math.ceil(thumbnailCount / 2), initialPages.length - thumbnailCount));

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col bg-black relative select-none"
      style={{ minHeight: '400px' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#050308]/95 border-b border-neutral-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <PresentationIcon className="w-4 h-4 text-[#FF4DCA]" />
          <span className="font-orbitron text-sm text-white truncate max-w-[240px]" title={pdfTitle}>
            {pdfTitle || 'PDF PRESENTATION'}
          </span>
          {!isMentor && (
            <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-mono px-2 py-0.5 rounded animate-pulse">
              <Radio className="w-2.5 h-2.5" /> LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
          {syncError && <span className="text-red-400 text-[9px]">{syncError}</span>}
          <span>
            PAGE <span className="text-[#FF4DCA] font-bold tabular-nums">{currentPage}</span> / {totalPages}
          </span>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {isMentor && onExitPdfMode && (
            <button
              onClick={onExitPdfMode}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-900 border border-neutral-700 hover:border-red-500/50 hover:text-red-400 text-neutral-400 transition-colors text-[9px] font-mono"
              title="Exit PDF Mode"
            >
              <X className="w-3 h-3" /> EXIT PDF MODE
            </button>
          )}
        </div>
      </div>

      {/* Page display */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-neutral-950">
        <AnimatePresence mode="wait">
          {pageUrl ? (
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.22 }}
              className="relative flex items-center justify-center w-full h-full"
            >
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />
                </div>
              )}
              <img
                src={pageUrl}
                alt={`Slide ${currentPage}`}
                onLoad={() => setImageLoaded(true)}
                className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                style={{ maxHeight: 'calc(100vh - 140px)' }}
                draggable={false}
              />
            </motion.div>
          ) : (
            <div className="text-neutral-600 font-mono text-sm text-center">
              <PresentationIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
              No page available
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls (mentor only) */}
      {isMentor && (
        <div className="bg-[#050308]/95 backdrop-blur-xl border-t border-neutral-900 px-4 py-3 shrink-0 z-10">
          <div className="flex items-center gap-4">
            {/* Prev/Next */}
            <button
              onClick={prev}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/20 text-[#8B5CF6] text-xs font-mono disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> PREV
            </button>

            {/* Thumbnail strip */}
            <div className="flex items-center gap-1 flex-1 overflow-hidden">
              {initialPages.slice(thumbnailStart, thumbnailStart + thumbnailCount).map((url, i) => {
                const pageNum = thumbnailStart + i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => goTo(pageNum)}
                    title={`Page ${pageNum}`}
                    className={`shrink-0 rounded border-2 overflow-hidden transition-all duration-200 ${
                      pageNum === currentPage
                        ? 'border-[#FF4DCA] shadow-[0_0_8px_rgba(255,77,202,0.5)]'
                        : 'border-neutral-800 hover:border-neutral-600 opacity-60 hover:opacity-100'
                    }`}
                    style={{ width: 48, height: 34 }}
                  >
                    <img
                      src={url}
                      alt={`Thumb ${pageNum}`}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </button>
                );
              })}
              {initialPages.length > thumbnailCount && (
                <span className="text-[10px] font-mono text-neutral-600 shrink-0 px-1">
                  +{initialPages.length - thumbnailCount} more
                </span>
              )}
            </div>

            {/* Jump to page */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && jumpInput) {
                    goTo(parseInt(jumpInput));
                    setJumpInput('');
                  }
                }}
                placeholder={String(currentPage)}
                className="w-14 bg-neutral-950 border border-neutral-800 rounded text-center text-xs font-mono text-white py-1.5 focus:border-[#8B5CF6] focus:outline-none"
              />
              <span className="text-[10px] font-mono text-neutral-600">/ {totalPages}</span>
            </div>

            <button
              onClick={next}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[#FF4DCA]/10 border border-[#FF4DCA]/40 hover:bg-[#FF4DCA]/20 text-[#FF4DCA] text-xs font-mono disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              NEXT <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-[9px] font-mono text-neutral-700 text-center mt-1.5">
            ← → arrow keys · F = fullscreen · SPACE = next
          </div>
        </div>
      )}

      {/* Participant minimal indicator */}
      {!isMentor && (
        <div className="bg-[#050308]/90 border-t border-neutral-900 px-4 py-2 shrink-0 flex items-center justify-center gap-3">
          <span className="text-[10px] font-mono text-neutral-500">FOLLOWING MENTOR PRESENTATION</span>
          <span className="font-mono text-xs text-[#FF4DCA] tabular-nums">
            {currentPage} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
