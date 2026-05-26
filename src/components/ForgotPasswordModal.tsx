'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Step slide variants ──────────────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

const slideTransition = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] transition-colors';

// ─── Error Banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="p-3 rounded-lg bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-start gap-2"
    >
      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <span>{message}</span>
    </motion.div>
  );
}

// ─── Step Dots ────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            width: current === i ? 24 : 8,
            backgroundColor: current === i ? '#FF4DCA' : '#374151',
          }}
          transition={{ duration: 0.3 }}
          className="h-2 rounded-full"
        />
      ))}
    </div>
  );
}

// ─── Step 1: Email ────────────────────────────────────────────────────────────

interface Step1Props {
  onSuccess: (email: string) => void;
}

function StepEmail({ onSuccess }: Step1Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (authError) {
        setError(authError.message);
      } else {
        onSuccess(email.trim());
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 mb-4">
          <Mail className="w-6 h-6 text-[#8B5CF6]" />
        </div>
        <h2 className="font-orbitron font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] tracking-wide">
          RECOVER ACCESS
        </h2>
        <p className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase mt-1">
          identity verification protocol
        </p>
      </div>

      <p className="text-xs text-neutral-400 text-center leading-relaxed">
        Enter your registered subnet email address. We&apos;ll transmit a 6-digit recovery code.
      </p>

      <AnimatePresence mode="wait">
        {error && <ErrorBanner message={error} />}
      </AnimatePresence>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6]">
          Subnet Email Address
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
            <Mail className="w-4 h-4" />
          </span>
          <input
            type="email"
            required
            autoFocus
            placeholder="name@nexus.com"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="relative w-full group overflow-hidden rounded-lg py-2.5 px-4 text-sm font-mono font-bold tracking-widest uppercase transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: loading
            ? 'linear-gradient(135deg, #4c1d95, #2d1b69)'
            : 'linear-gradient(135deg, #7c3aed, #4c1d95)',
          border: '1px solid rgba(139, 92, 246, 0.5)',
          color: '#e9d5ff',
          boxShadow: loading ? 'none' : '0 0 20px rgba(139,92,246,0.25)',
        }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              TRANSMITTING...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" />
              SEND RECOVERY CODE
            </>
          )}
        </span>
        {!loading && (
          <span className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/0 via-[#8B5CF6]/10 to-[#8B5CF6]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        )}
      </button>
    </form>
  );
}

// ─── Step 2: OTP ──────────────────────────────────────────────────────────────

interface Step2Props {
  email: string;
  onSuccess: () => void;
  onResend: () => void;
}

function StepOtp({ email, onSuccess, onResend }: Step2Props) {
  const [digits, setDigits] = useState<string[]>([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;

    const id = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [cooldown]);

  const otp = digits.join('');

  const focusNext = (index: number) => {
    if (index < 7) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const focusPrev = (index: number) => {
    if (index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    // allow full paste
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, '').slice(0, 8);

      if (cleaned.length > 0) {
        const newDigits = [...digits];

        for (let i = 0; i < cleaned.length && index + i < 8; i++) {
          newDigits[index + i] = cleaned[i];
        }

        setDigits(newDigits);

        const nextFocus = Math.min(index + cleaned.length, 7);

        inputsRef.current[nextFocus]?.focus();
      }

      return;
    }

    const digit = value.replace(/\D/g, '');

    const newDigits = [...digits];
    newDigits[index] = digit;

    setDigits(newDigits);

    if (digit) {
      focusNext(index);
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      } else {
        focusPrev(index);
      }
    } else if (e.key === 'ArrowLeft') {
      focusPrev(index);
    } else if (e.key === 'ArrowRight') {
      focusNext(index);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (otp.length < 8) {
      setError('Please enter all 8 digits of your recovery code.');
      return;
    }

    setLoading(true);

    try {
      const { error: supaErr } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      });

      if (supaErr) {
        setError(supaErr.message);

        setDigits(['', '', '', '', '', '', '', '']);

        setTimeout(() => {
          inputsRef.current[0]?.focus();
        }, 50);
      } else {
        onSuccess();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError('');

    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/callback',
      });

      setCooldown(60);

      setDigits(['', '', '', '', '', '', '', '']);

      setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 50);

      onResend();
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#FF4DCA]/10 border border-[#FF4DCA]/30 mb-4">
          <KeyRound className="w-6 h-6 text-[#FF4DCA]" />
        </div>

        <h2 className="font-orbitron font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] tracking-wide">
          VERIFY CODE
        </h2>

        <p className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase mt-1">
          8-digit recovery token
        </p>
      </div>

      <p className="text-xs text-neutral-400 text-center leading-relaxed">
        An 8-digit recovery code was transmitted to{' '}
        <span className="text-[#FF4DCA] font-mono break-all">
          {email}
        </span>.
      </p>

      <AnimatePresence mode="wait">
        {error && <ErrorBanner message={error} />}
      </AnimatePresence>

      <div className="flex items-center justify-center gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            autoFocus={i === 0}
            onChange={(e) =>
              handleDigitChange(i, e.target.value)
            }
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            className="w-11 h-13 text-center text-xl font-mono font-bold text-white rounded-xl border transition-all duration-200 outline-none select-all caret-transparent"
            style={{
              height: '52px',
              background: digit
                ? 'linear-gradient(135deg, rgba(255,77,202,0.08), rgba(139,92,246,0.08))'
                : 'rgba(5,3,8,0.6)',
              borderColor: digit ? '#FF4DCA' : '#374151',
              boxShadow: digit
                ? '0 0 12px rgba(255,77,202,0.2)'
                : 'none',
            }}
          />
        ))}
      </div>

      <button
        type="submit"
        disabled={loading || otp.length < 8}
        className="relative w-full group overflow-hidden rounded-lg py-2.5 px-4 text-sm font-mono font-bold tracking-widest uppercase transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AUTHENTICATING...
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              VERIFY CODE
            </>
          )}
        </span>
      </button>
    </form>
  );
}
// ─── Step 3: New Password ─────────────────────────────────────────────────────

interface Step3Props {
  onSuccess: () => void;
}

function StepNewPassword({ onSuccess }: Step3Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (supaErr) {
        setError(supaErr.message);
      } else {
        setSucceeded(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (succeeded) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-8 gap-4 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"
          style={{ boxShadow: '0 0 30px rgba(16,185,129,0.2)' }}
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </motion.div>
        <div>
          <h3 className="font-orbitron font-black text-lg text-emerald-400 tracking-wide">
            ACCESS RESTORED
          </h3>
          <p className="text-xs text-neutral-400 font-mono mt-1.5 tracking-wide">
            Password updated successfully. Closing...
          </p>
        </div>
      </motion.div>
    );
  }

  const passwordStrength = (() => {
    if (!newPassword) return null;
    if (newPassword.length < 8) return { label: 'TOO SHORT', color: '#ef4444', width: '25%' };
    if (newPassword.length < 10) return { label: 'WEAK', color: '#f97316', width: '45%' };
    if (/[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword))
      return { label: 'STRONG', color: '#10b981', width: '100%' };
    if (/[A-Z]/.test(newPassword) || /[0-9]/.test(newPassword))
      return { label: 'MODERATE', color: '#eab308', width: '70%' };
    return { label: 'WEAK', color: '#f97316', width: '45%' };
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 mb-4">
          <Lock className="w-6 h-6 text-[#8B5CF6]" />
        </div>
        <h2 className="font-orbitron font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] tracking-wide">
          SET NEW KEY
        </h2>
        <p className="text-[10px] font-mono tracking-widest text-neutral-500 uppercase mt-1">
          establish new access credentials
        </p>
      </div>

      <AnimatePresence mode="wait">
        {error && <ErrorBanner message={error} />}
      </AnimatePresence>

      {/* New Password */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6]">
          New Access Key
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
            <Lock className="w-4 h-4" />
          </span>
          <input
            type={showNew ? 'text' : 'password'}
            required
            autoFocus
            placeholder="••••••••"
            className={`${inputCls} pr-10`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Password strength bar */}
        {passwordStrength && (
          <div className="space-y-1">
            <div className="w-full h-1 rounded-full bg-neutral-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: passwordStrength.width }}
                transition={{ duration: 0.3 }}
                className="h-full rounded-full"
                style={{ backgroundColor: passwordStrength.color }}
              />
            </div>
            <p
              className="text-[9px] font-mono tracking-widest"
              style={{ color: passwordStrength.color }}
            >
              {passwordStrength.label}
            </p>
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6]">
          Confirm Access Key
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
            <Lock className="w-4 h-4" />
          </span>
          <input
            type={showConfirm ? 'text' : 'password'}
            required
            placeholder="••••••••"
            className={`${inputCls} pr-10`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {confirmPassword && newPassword && confirmPassword !== newPassword && (
          <p className="text-[9px] font-mono text-red-400 tracking-widest">
            KEYS DO NOT MATCH
          </p>
        )}
        {confirmPassword && newPassword && confirmPassword === newPassword && (
          <p className="text-[9px] font-mono text-emerald-400 tracking-widest">
            KEYS MATCH ✓
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="relative w-full group overflow-hidden rounded-lg py-2.5 px-4 text-sm font-mono font-bold tracking-widest uppercase transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: loading
            ? 'linear-gradient(135deg, #4c1d95, #2d1b69)'
            : 'linear-gradient(135deg, #7c3aed, #4c1d95)',
          border: '1px solid rgba(139, 92, 246, 0.5)',
          color: '#e9d5ff',
          boxShadow: loading ? 'none' : '0 0 20px rgba(139,92,246,0.25)',
        }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              UPDATING...
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              SET NEW PASSWORD
            </>
          )}
        </span>
        {!loading && (
          <span className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/0 via-[#8B5CF6]/10 to-[#8B5CF6]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        )}
      </button>
    </form>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [email, setEmail] = useState('');

  const goToStep = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }, [step]);

  const handleClose = () => {
    onClose();
    // Reset after animation completes
    setTimeout(() => {
      setStep(0);
      setDirection(1);
      setEmail('');
    }, 300);
  };

  const handleEmailSuccess = (resolvedEmail: string) => {
    setEmail(resolvedEmail);
    goToStep(1);
  };

  const handleOtpSuccess = () => {
    goToStep(2);
  };

  const handlePasswordSuccess = () => {
    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-md rounded-2xl p-6 pointer-events-auto overflow-hidden"
              style={{
                background: '#050308',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                boxShadow:
                  '0 0 60px rgba(139,92,246,0.2), 0 0 0 1px rgba(139,92,246,0.05), inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ambient glow top */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,77,202,0.6), rgba(139,92,246,0.6), transparent)',
                }}
              />

              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-800/60 transition-all duration-200 z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Step dots */}
              <StepDots current={step} />

              {/* Step content with slide animation */}
              <div className="overflow-hidden">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                  >
                    {step === 0 && (
                      <StepEmail onSuccess={handleEmailSuccess} />
                    )}
                    {step === 1 && (
                      <StepOtp
                        email={email}
                        onSuccess={handleOtpSuccess}
                        onResend={() => {/* no-op, state resets in component */ }}
                      />
                    )}
                    {step === 2 && (
                      <StepNewPassword onSuccess={handlePasswordSuccess} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom ambient glow */}
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)',
                }}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
