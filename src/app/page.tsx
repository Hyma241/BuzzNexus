'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Play, ShieldAlert, Cpu, Sparkles, Zap, Users, HelpCircle } from 'lucide-react';
import NeonBackground from '@/components/NeonBackground';
import CinematicIntro from '@/components/CinematicIntro';
import CyberButton from '@/components/ui/CyberButton';
import GlassCard from '@/components/ui/GlassCard';

export default function LandingPage() {
  const router = useRouter();
  const [introComplete, setIntroComplete] = useState(false);

  return (
    <>
      {!introComplete && (
        <CinematicIntro onComplete={() => setIntroComplete(true)} />
      )}

      {introComplete && (
        <div className="relative min-h-screen flex flex-col items-center justify-between text-white overflow-hidden font-sans">
          <NeonBackground />

          {/* Top Header Navigation */}
          <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="flex items-center gap-2 select-none"
            >
              <div className="w-8 h-8 rounded bg-gradient-to-tr from-[#FF4DCA] to-[#8B5CF6] flex items-center justify-center font-bold text-black font-orbitron">
                B
              </div>
              <h1 className="font-orbitron font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] filter drop-shadow-[0_0_8px_rgba(255,77,202,0.4)]">
                BUZZNEXUS
              </h1>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="flex items-center gap-4"
            >
              <CyberButton variant="ghost" className="text-xs" onClick={() => router.push('/login')}>
                Mentor Gate
              </CyberButton>
              <button
                type="button"
                onClick={() => router.push('/help')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-950/50 hover:border-[#8B5CF6]/60 hover:text-[#8B5CF6] text-xs font-mono transition-all"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Help
              </button>
            </motion.div>
          </header>

          {/* Hero Section */}
          <main className="w-full max-w-7xl mx-auto px-6 flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 relative z-10 py-12 md:py-16">
            
            {/* Left Column: Text & Features */}
            <div className="w-full lg:w-1/2 flex flex-col space-y-8 text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="space-y-4"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 text-xs text-[#a78bfa] font-mono tracking-wide">
                  <Sparkles className="w-3.5 h-3.5" />
                  REALTIME SYNAPSE BATTLEGROUND
                </div>
                
                <h2 className="font-orbitron text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
                  AI-POWERED <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] via-white to-[#8B5CF6] filter drop-shadow-[0_0_12px_rgba(255,77,202,0.3)]">
                    QUIZ BATTLE
                  </span>
                </h2>
                
                <p className="text-neutral-400 text-sm sm:text-base max-w-lg mx-auto lg:mx-0 font-light leading-relaxed">
                  Step into the neural arena. Create real-time digital classroom rooms, challenge players, and fuse learning with high-octane competitive cyber battle.
                </p>
              </motion.div>

              {/* Quick Specs / Features Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              >
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0B0813]/40 border border-neutral-900">
                  <Zap className="w-5 h-5 text-[#FF4DCA]" />
                  <div className="text-left font-mono">
                    <div className="text-xs text-neutral-500">LATENCY</div>
                    <div className="text-sm font-semibold text-[#FF4DCA]">REALTIME</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0B0813]/40 border border-neutral-900">
                  <Cpu className="w-5 h-5 text-[#8B5CF6]" />
                  <div className="text-left font-mono">
                    <div className="text-xs text-neutral-500">OPERATOR</div>
                    <div className="text-sm font-semibold text-[#8B5CF6]">AI-DRIVEN</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0B0813]/40 border border-neutral-900">
                  <Users className="w-5 h-5 text-white" />
                  <div className="text-left font-mono">
                    <div className="text-xs text-neutral-500">CAPACITY</div>
                    <div className="text-sm font-semibold text-white">50+ PLYRS</div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Interaction Card */}
            <div className="w-full lg:w-5/12 flex justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                className="w-full max-w-sm"
              >
                <GlassCard glowColor="pink" className="shadow-2xl">
                  <div className="text-center space-y-6">
                    <div className="space-y-1">
                      <h3 className="font-orbitron font-bold text-lg text-white">ARENA TERMINAL</h3>
                      <p className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase">select connection node</p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Join Session Option */}
                      <div className="group relative rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 transition-all hover:border-[#FF4DCA]/40 cursor-pointer text-left" onClick={() => router.push('/room/join')}>
                        <div className="absolute top-3 right-3 text-neutral-600 group-hover:text-[#FF4DCA] transition-colors">
                          <Play className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-orbitron font-semibold text-sm text-white group-hover:text-[#FF4DCA] transition-colors">JOIN SESSION</div>
                          <div className="text-[11px] text-neutral-400 font-light mt-1">Enter a battle code and deploy as a participant.</div>
                        </div>
                      </div>

                      {/* Create Session Option */}
                      <div className="group relative rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 transition-all hover:border-[#8B5CF6]/40 cursor-pointer text-left" onClick={() => router.push('/dashboard')}>
                        <div className="absolute top-3 right-3 text-neutral-600 group-hover:text-[#8B5CF6] transition-colors">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-orbitron font-semibold text-sm text-white group-hover:text-[#8B5CF6] transition-colors">CREATE BATTLE</div>
                          <div className="text-[11px] text-neutral-400 font-light mt-1">Initialize a room, load quizzes, and monitor results.</div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 text-center text-[10px] text-neutral-600 font-mono uppercase flex items-center justify-center gap-1.5">
                      <ShieldAlert className="w-3 h-3 text-neutral-500" />
                      secured neural network protocol v4.0
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </div>

          </main>

          {/* Footer */}
          <footer className="w-full py-6 text-center text-xs text-neutral-600 font-mono relative z-10 border-t border-neutral-950">
            © {new Date().getFullYear()} BUZZNEXUS // DIGITAL learning ARENA. ALL RIGHTS RESERVED.
          </footer>
        </div>
      )}
    </>
  );
}
