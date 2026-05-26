'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle2, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import NeonBackground from '@/components/NeonBackground';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Detect recovery session — handles BOTH link-click and OTP-verified flows
  useEffect(() => {
    // Check for existing recovery session immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // Also listen for PASSWORD_RECOVERY event (fired when user clicks the reset link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;
      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    if (!newPassword) return null;
    if (newPassword.length < 8) return { label: 'TOO SHORT', color: '#ef4444', w: '25%' };
    if (/[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword))
      return { label: 'STRONG', color: '#10b981', w: '100%' };
    if (/[A-Z]/.test(newPassword) || /[0-9]/.test(newPassword))
      return { label: 'MODERATE', color: '#eab308', w: '65%' };
    return { label: 'WEAK', color: '#f97316', w: '40%' };
  })();

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 z-10">
      <NeonBackground />
      <div className="relative z-10 w-full max-w-md">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="font-orbitron text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] drop-shadow-[0_0_10px_rgba(255,77,202,0.4)]">
            BUZZNEXUS
          </h1>
          <p className="text-xs text-neutral-400 font-mono tracking-widest mt-2 uppercase">password reset protocol</p>
        </div>

        <div
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: '#050308',
            border: '1px solid rgba(139,92,246,0.3)',
            boxShadow: '0 0 60px rgba(139,92,246,0.18)',
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(255,77,202,0.6),rgba(139,92,246,0.6),transparent)' }} />

          <AnimatePresence mode="wait">
            {success ? (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-8 gap-4 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280 }}
                  className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"
                  style={{ boxShadow: '0 0 30px rgba(16,185,129,0.2)' }}>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </motion.div>
                <h3 className="font-orbitron font-black text-lg text-emerald-400">ACCESS RESTORED</h3>
                <p className="text-xs text-neutral-400 font-mono">Password updated. Redirecting to login...</p>
              </motion.div>
            ) : !ready ? (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-10 space-y-4">
                <Loader2 className="w-10 h-10 text-[#8B5CF6] animate-spin mx-auto" />
                <p className="text-sm font-mono text-neutral-400">Verifying recovery session...</p>
                <p className="text-[10px] font-mono text-neutral-600">
                  If nothing happens, go back and request a new code.
                </p>
                <button onClick={() => router.push('/login')}
                  className="text-[10px] font-mono text-[#FF4DCA] hover:underline">
                  ← Back to Login
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSetPassword} className="space-y-5">
                <div className="text-center mb-2">
                  <div className="inline-flex w-14 h-14 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 items-center justify-center mb-3">
                    <ShieldCheck className="w-6 h-6 text-[#8B5CF6]" />
                  </div>
                  <h2 className="font-orbitron font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6]">
                    SET NEW PASSWORD
                  </h2>
                  <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mt-1">
                    establish new access credentials
                  </p>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6]">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <input type={showNew ? 'text' : 'password'} value={newPassword} autoFocus required
                      onChange={(e) => setNewPassword(e.target.value)} placeholder="min. 8 characters"
                      className="w-full bg-[#050308]/80 border border-neutral-800 rounded-lg py-3 pl-10 pr-10 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#8B5CF6] transition-colors" />
                    <button type="button" onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {strength && (
                    <div className="space-y-1">
                      <div className="w-full h-1 rounded-full bg-neutral-800 overflow-hidden">
                        <motion.div animate={{ width: strength.w }} transition={{ duration: 0.3 }}
                          className="h-full rounded-full" style={{ backgroundColor: strength.color }} />
                      </div>
                      <p className="text-[9px] font-mono tracking-widest" style={{ color: strength.color }}>{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6]">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} required
                      onChange={(e) => setConfirmPassword(e.target.value)} placeholder="repeat password"
                      className="w-full bg-[#050308]/80 border border-neutral-800 rounded-lg py-3 pl-10 pr-10 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#8B5CF6] transition-colors" />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <p className={`text-[9px] font-mono tracking-widest ${confirmPassword === newPassword ? 'text-emerald-400' : 'text-red-400'}`}>
                      {confirmPassword === newPassword ? 'PASSWORDS MATCH ✓' : 'PASSWORDS DO NOT MATCH'}
                    </p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] text-black font-orbitron font-bold text-sm tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> UPDATING...</> : <><ShieldCheck className="w-4 h-4" /> SET NEW PASSWORD</>}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
