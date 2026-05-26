'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

import {
  Hash,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  Wifi,
} from 'lucide-react';

import NeonBackground from '@/components/NeonBackground';
import GlassCard from '@/components/ui/GlassCard';
import CyberButton from '@/components/ui/CyberButton';

import Link from 'next/link';

export default function JoinGeneralPage() {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyCode = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const cleanCode = code.trim();

      if (
        !cleanCode ||
        cleanCode.length !== 6
      ) {
        setError(
          'Please enter a valid 6-digit arena code.'
        );

        setLoading(false);
        return;
      }

      console.log(
        'Checking room:',
        cleanCode
      );

      const {
        data: room,
        error: roomError,
      } = await supabase
        .from('rooms')
        .select(
          `
          id,
          code,
          game_state,
          participant_limit,
          join_count
        `
        )
        .eq('code', cleanCode)
        .single();

      console.log('ROOM:', room);
      console.log(
        'ROOM ERROR:',
        roomError
      );

      if (roomError || !room) {
        setError(
          'Arena not found. Verify the code.'
        );

        setLoading(false);
        return;
      }

      // ROOM FULL
      if (
        room.participant_limit &&
        room.join_count >=
          room.participant_limit
      ) {
        setError(
          'ROOM FULL — Arena capacity reached.'
        );

        setLoading(false);
        return;
      }

      // VALID GAME STATES
      const allowedStates = [
        'waiting',
        'lobby',
        'question_active',
        'buzz_locked',
        'answering',
      ];

      if (
        !allowedStates.includes(
          room.game_state
        )
      ) {
        setError(
          `Arena unavailable. Current state: ${room.game_state}`
        );

        setLoading(false);
        return;
      }

      console.log(
        'Redirecting to join page...'
      );

      router.push(
        `/room/${cleanCode}/join`
      );
    } catch (err) {
      console.error(
        'JOIN ERROR:',
        err
      );

      setError(
        'Network synchronization failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden text-white">
      <NeonBackground />
      <div className="absolute top-5 left-5 right-5 z-20 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#FF4DCA]/60 hover:text-[#FF4DCA] text-xs font-mono transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          BACK
        </button>
        <button
          type="button"
          onClick={() => router.push('/help')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#8B5CF6]/60 hover:text-[#8B5CF6] text-xs font-mono transition-all"
        >
          <HelpCircle className="w-4 h-4" />
          HELP
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* HEADER */}
        <div className="text-center mb-8 select-none">
          <Link href="/">
            <h1 className="font-orbitron text-4xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] hover:scale-105 transition-transform duration-300 cursor-pointer filter drop-shadow-[0_0_20px_rgba(255,77,202,0.5)]">
              BUZZNEXUS
            </h1>
          </Link>

          <p className="text-xs text-neutral-400 font-mono tracking-[0.3em] mt-3 uppercase">
            Student Arena Gateway
          </p>
        </div>

        {/* CARD */}
        <GlassCard glowColor="pink">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Wifi className="w-5 h-5 text-[#FF4DCA]" />

            <h2 className="font-orbitron text-xl font-bold tracking-wider">
              ENTER BATTLE CODE
            </h2>
          </div>

          <form
            onSubmit={handleVerifyCode}
            className="space-y-6"
          >
            {/* ERROR */}
            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-sm flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />

                <span>{error}</span>
              </div>
            )}

            {/* INPUT */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-mono tracking-[0.3em] text-[#FF4DCA]">
                6-Digit Arena Access Code
              </label>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-neutral-500">
                  <Hash className="w-5 h-5" />
                </span>

                <input
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="582914"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.replace(
                        /\D/g,
                        ''
                      )
                    )
                  }
                  className="w-full bg-black/40 border border-neutral-800 rounded-xl py-4 pl-12 pr-4 text-center text-2xl tracking-[0.4em] font-mono font-bold text-white placeholder-neutral-700 focus:outline-none focus:border-[#FF4DCA] focus:ring-2 focus:ring-[#FF4DCA]/40 transition-all duration-300"
                />
              </div>
            </div>

            {/* BUTTON */}
            <CyberButton
              variant="pink"
              fullWidth
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'LINKING TO ARENA...'
                : 'ENTER ARENA'}

              <ArrowRight className="w-4 h-4" />
            </CyberButton>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
