'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { UserPlus, Key, Mail, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import NeonBackground from '@/components/NeonBackground';
import GlassCard from '@/components/ui/GlassCard';
import CyberButton from '@/components/ui/CyberButton';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/dashboard');
      }
    });
  }, [router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            username: username,
          },
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Clean up input fields
        setFullName('');
        setUsername('');
        setEmail('');
        setPassword('');
        // Automatically redirect to login page after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 z-10">
      <NeonBackground />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8 select-none">
          <Link href="/">
            <h1 className="font-orbitron text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] hover:scale-105 transition-transform duration-300 filter drop-shadow-[0_0_10px_rgba(255,77,202,0.4)] cursor-pointer">
              BUZZNEXUS
            </h1>
          </Link>
          <p className="text-xs text-neutral-400 font-mono tracking-widest mt-2 uppercase">
            agent initialization node
          </p>
        </div>

        <GlassCard glowColor="pink" hoverEffect title="REGISTER OPERATOR" subtitle="create mentor account">
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Registration successful! Redirecting to credentials gate...</span>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA]">
                Operator Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Lex Sterling"
                  className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF4DCA] focus:ring-1 focus:ring-[#FF4DCA] transition-colors"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA]">
                Operator Call Sign (Username)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="lex_nexus"
                  className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF4DCA] focus:ring-1 focus:ring-[#FF4DCA] transition-colors"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA]">
                Subnet Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="lex@nexus.com"
                  className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF4DCA] focus:ring-1 focus:ring-[#FF4DCA] transition-colors"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FF4DCA]">
                Secret Access Key (Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <Key className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#FF4DCA] focus:ring-1 focus:ring-[#FF4DCA] transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <CyberButton variant="pink" fullWidth type="submit" disabled={loading || success}>
                <UserPlus className="w-4 h-4" />
                {loading ? 'INITIALIZING...' : 'INITIALIZE AGENT'}
              </CyberButton>
            </div>
          </form>

          <div className="mt-6 text-center text-xs text-neutral-500 font-mono">
            Already registered?{' '}
            <Link href="/login" className="text-[#8B5CF6] hover:text-[#a78bfa] transition-colors hover:underline">
              ACCESS NODE
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
