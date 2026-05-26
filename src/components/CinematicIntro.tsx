'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function CinematicIntro({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 1000);
    const t2 = setTimeout(() => setStage(2), 2200);
    const t3 = setTimeout(() => setStage(3), 3200);
    const t4 = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 800);
    }, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050308]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.05)_0%,transparent_70%)] pointer-events-none" />
          
          <div className="flex flex-col items-center max-w-md px-6 text-center select-none">
            {stage === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: [0, 1, 0.8, 1], scale: 1 }}
                className="text-xs tracking-[0.4em] text-[#FF4DCA] font-mono uppercase"
              >
                establishing secure nexus link...
              </motion.div>
            )}

            {stage >= 1 && (
              <div className="relative">
                <motion.div
                  className="absolute -inset-4 bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] opacity-30 blur-2xl rounded-full"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: stage >= 2 ? [0.2, 0.5, 0.2] : 0.3, scale: stage >= 2 ? [0.9, 1.1, 0.9] : 1 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />

                <motion.h1
                  className="font-orbitron text-5xl md:text-6xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] via-white to-[#8B5CF6] relative z-10 select-none cursor-default filter drop-shadow-[0_0_15px_rgba(255,77,202,0.5)]"
                  initial={{ opacity: 0, letterSpacing: '0.4em' }}
                  animate={{ opacity: 1, letterSpacing: '0.15em' }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                >
                  BUZZNEXUS
                </motion.h1>
              </div>
            )}

            {stage >= 2 && (
              <motion.div
                className="mt-8 w-64 h-[2px] bg-neutral-900 rounded-full overflow-hidden relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6]"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.5, ease: 'easeInOut' }}
                />
              </motion.div>
            )}

            {stage === 2 && (
              <motion.div
                className="mt-3 text-[10px] tracking-[0.2em] text-[#8B5CF6] font-mono uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                synchronizing realtime data...
              </motion.div>
            )}

            {stage >= 3 && (
              <motion.div
                className="mt-3 text-[10px] tracking-[0.2em] text-emerald-400 font-mono uppercase font-semibold"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                NEXUS LINK ACTIVE
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
