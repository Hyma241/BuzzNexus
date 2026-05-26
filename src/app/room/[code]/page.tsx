'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Room, Participant, Question, Buzz, Response } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Copy, Check, Play, ArrowLeft, Radio, ArrowRight,
  Trophy, Settings2, Zap, XCircle, CheckCircle, Timer, Monitor,
  AlertTriangle, HelpCircle, PresentationIcon, Upload, Loader2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import NeonBackground from '@/components/NeonBackground';
import GlassCard from '@/components/ui/GlassCard';
import CyberButton from '@/components/ui/CyberButton';
import { playCyberSound } from '@/lib/sounds';
import { GAME_STATES } from '@/lib/gameState';
import { useRoomChannel } from '@/lib/realtime/useRoomChannel';
import PdfProjectorMode from '@/components/PdfProjectorMode';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default function MentorWaitingRoom({ params }: PageProps) {
  const router = useRouter();
  const { code } = React.use(params);

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copied, setCopied] = useState(false);

  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; created_at: string }>>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [buzzes, setBuzzes] = useState<Buzz[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const [marksPerQuestion, setMarksPerQuestion] = useState(500);
  const [timerOverride, setTimerOverride] = useState<number | ''>('');
  const [negativeMarkingPenalty, setNegativeMarkingPenalty] = useState(0);

  // PDF Projector state
  const [pdfModeActive, setPdfModeActive] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState('');
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Initial load ───────────────────────────────────────────
  useEffect(() => {
    const fetchRoomDetails = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push('/login'); return; }

        const { data: roomData, error: roomError } = await supabase
          .from('rooms').select('*').eq('code', code).maybeSingle();

        if (roomError || !roomData) {
          setError('Channel frequency not active. Verify room code.');
          setLoading(false); return;
        }
        if (roomData.mentor_id !== session.user.id) {
          setError('Access denied. Security clearance insufficient.');
          setLoading(false); return;
        }

        setRoom(roomData as Room);
        roomRef.current = roomData as Room;

        const { data: quizzesData } = await supabase
          .from('quizzes').select('*').eq('mentor_id', session.user.id)
          .order('created_at', { ascending: false });

        if (quizzesData) {
          setQuizzes(quizzesData);
          const qid = roomData.current_quiz_id || quizzesData[0]?.id || '';
          setSelectedQuizId(qid);
          if (qid) await fetchQuestions(qid);
        }

        // Fetch participants immediately
        const { data: parts } = await supabase
          .from('participants').select('*').eq('room_id', roomData.id)
          .order('join_order', { ascending: true });
        if (parts) setParticipants(parts as Participant[]);

        // Fetch buzzes/responses if in active game
        if (roomData.current_question_id) {
          await Promise.all([
            fetchBuzzes(roomData.id, roomData.current_question_id),
            fetchResponses(roomData.current_question_id),
          ]);
        }

        setLoading(false);
      } catch {
        setError('Connection error.');
        setLoading(false);
      }
    };
    fetchRoomDetails();
  }, [code, router]);

  // Sync PDF state from room record
  useEffect(() => {
    if (!room) return;
    const r = room as Room & {
      pdf_mode_active?: boolean;
      pdf_pages?: string[];
      pdf_current_page?: number;
      pdf_total_pages?: number;
      pdf_title?: string;
    };
    if (r.pdf_mode_active) {
      setPdfModeActive(true);
      setPdfPages(r.pdf_pages || []);
      setPdfCurrentPage(r.pdf_current_page || 1);
      setPdfTotalPages(r.pdf_total_pages || 0);
      setPdfTitle(r.pdf_title || '');
    } else {
      setPdfModeActive(false);
    }
  }, [room]);

  const fetchQuestions = useCallback(async (quizId: string) => {
    const { data } = await supabase
      .from('questions').select('*').eq('quiz_id', quizId)
      .order('order_index', { ascending: true });
    if (data) setQuestions(data as Question[]);
  }, []);

  const fetchBuzzes = useCallback(async (roomId: string, questionId: string) => {
    const { data } = await supabase
      .from('buzzes').select('*, participants(*)')
      .eq('room_id', roomId).eq('question_id', questionId)
      .order('buzz_time', { ascending: true });
    if (data) setBuzzes(data as Buzz[]);
  }, []);

  const fetchResponses = useCallback(async (questionId: string) => {
    const { data } = await supabase
      .from('responses').select('*').eq('question_id', questionId);
    if (data) setResponses(data as Response[]);
  }, []);

  const fetchParticipants = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('participants').select('*').eq('room_id', roomId)
      .order('score', { ascending: false });
    if (data) setParticipants(data as Participant[]);
  }, []);

  const handleRoomRealtime = useCallback(
    async (newRoom: Room, oldRoom: Room | null) => {
      setRoom(newRoom);
      roomRef.current = newRoom;

      if (newRoom.current_question_id !== oldRoom?.current_question_id) {
        setResponses([]);
        setBuzzes([]);
        if (newRoom.current_question_id) {
          await Promise.all([
            fetchBuzzes(newRoom.id, newRoom.current_question_id),
            fetchResponses(newRoom.current_question_id),
          ]);
        }
      }

      if (newRoom.game_state !== oldRoom?.game_state) {
        if (newRoom.game_state === GAME_STATES.QUESTION_ACTIVE) playCyberSound('transition');
        if (newRoom.game_state === GAME_STATES.BUZZ_LOCKED) playCyberSound('lock');
        if (newRoom.game_state === GAME_STATES.EVALUATION) playCyberSound('lock');
        if (newRoom.game_state === GAME_STATES.QUESTION_RESULTS) playCyberSound('correct');
        if (newRoom.game_state === GAME_STATES.LEADERBOARD) playCyberSound('transition');
      }
    },
    [fetchBuzzes, fetchResponses]
  );

  const { setRoomSnapshot } = useRoomChannel({
    roomId: room?.id ?? null,
    channelPrefix: 'mentor',
    onRoomUpdate: handleRoomRealtime,
    enabled: Boolean(room),
  });

  useEffect(() => {
    if (room) setRoomSnapshot(room);
  }, [room, setRoomSnapshot]);

  useEffect(() => {
    if (!room) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`mentor-extra-${room.id}-v3`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
        () => fetchParticipants(room.id)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'buzzes', filter: `room_id=eq.${room.id}` },
        async () => {
          if (roomRef.current?.current_question_id) {
            await fetchBuzzes(room.id, roomRef.current.current_question_id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        async (payload) => {
          const qId = roomRef.current?.current_question_id;
          if (!qId) return;
          await fetchResponses(qId);
          if (payload.eventType === 'INSERT') {
            setResponses((prev) => {
              const row = payload.new as Response;
              return prev.find((r) => r.id === row.id) ? prev : [...prev, row];
            });
          } else if (payload.eventType === 'UPDATE') {
            setResponses((prev) =>
              prev.map((r) => (r.id === (payload.new as Response).id ? (payload.new as Response) : r))
            );
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [room?.id, fetchBuzzes, fetchResponses, fetchParticipants]);

  // ── Countdown timer ────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!room || room.game_state !== GAME_STATES.QUESTION_ACTIVE || !room.question_start_time) {
      setTimeRemaining(0);
      return;
    }

    const currentQ = questions.find(q => q.id === room.current_question_id);
    if (!currentQ) return;

    const timeLimitMs = (room.timer_override || currentQ.time_limit) * 1000;

    const updateTimer = () => {
      const elapsed = Date.now() - new Date(room.question_start_time!).getTime();
      const remaining = Math.max(0, timeLimitMs - elapsed);
      setTimeRemaining(Math.ceil(remaining / 1000));

      // Auto-advance if timer expires
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleTimerExpired();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.game_state, room?.question_start_time, room?.current_question_id, questions]);

  const handleTimerExpired = async () => {
    if (!room || room.game_state !== GAME_STATES.QUESTION_ACTIVE) return;
    await supabase.rpc('force_question_results', { p_room_id: room.id });
  };

  // ── Quiz selection ─────────────────────────────────────────
  useEffect(() => {
    if (selectedQuizId && (room?.game_state === GAME_STATES.WAITING || room?.game_state === GAME_STATES.LOBBY)) {
      fetchQuestions(selectedQuizId);
    }
  }, [selectedQuizId, fetchQuestions]);

  // ── Actions ────────────────────────────────────────────────
  const handleStartBattle = async () => {
    if (!selectedQuizId || questions.length === 0) {
      alert('Please select a valid quiz with questions first.');
      return;
    }
    setActionLoading(true);
    const firstQuestion = questions[0];
    playCyberSound('transition');

    await supabase.rpc('start_question', {
      p_room_id: room!.id,
      p_quiz_id: selectedQuizId,
      p_question_id: firstQuestion.id,
      p_marks: marksPerQuestion,
      p_timer_override: timerOverride === '' ? null : Number(timerOverride),
      p_negative_penalty: negativeMarkingPenalty,
    });

    setActionLoading(false);
  };

  const handleNextQuestion = async () => {
    if (!room) return;
    setActionLoading(true);
    const currentIndex = questions.findIndex(q => q.id === room.current_question_id);

    if (currentIndex !== -1 && currentIndex + 1 < questions.length) {
      const nextQuestion = questions[currentIndex + 1];
      playCyberSound('transition');
      await supabase.rpc('advance_to_next_question', {
        p_room_id: room.id,
        p_next_question_id: nextQuestion.id,
      });
    } else {
      playCyberSound('transition');
      await supabase.rpc('advance_to_next_question', {
        p_room_id: room.id,
        p_next_question_id: null,
      });
    }
    setActionLoading(false);
  };

  const handleForceSkip = async () => {
    if (!room) return;
    await supabase.rpc('force_question_results', { p_room_id: room.id });
  };

  const gradeAnswer = async (isCorrect: boolean) => {
    if (!room?.locked_participant_id || !room?.current_question_id) return;
    setActionLoading(true);

    const points = isCorrect
      ? room.marks_per_question
      : -(room.negative_marking_penalty || 0);

    try {
      const { data } = await supabase.rpc('grade_answer', {
        p_room_id: room.id,
        p_question_id: room.current_question_id,
        p_participant_id: room.locked_participant_id,
        p_is_correct: isCorrect,
        p_points: points,
        p_current_buzzer_index: room.current_buzzer_index || 0,
      });

      if (isCorrect) {
        playCyberSound('correct');
      } else {
        playCyberSound('wrong');
        // If grade_answer RPC advanced the buzzer, the room update will come via realtime
        // If no next buzzer, it went to question_results
        if (data && !data.has_next) {
          // Already moved to question_results by RPC
        }
      }
    } catch (err) {
      console.error('Grade answer error:', err);
      // Fallback manual grade
      await supabase.rpc('increment_score', {
        p_id: room.locked_participant_id,
        points_to_add: points,
        new_streak: isCorrect ? 1 : 0,
      });
      await supabase.from('responses').update({
        is_correct: isCorrect,
        points_awarded: points,
      }).eq('question_id', room.current_question_id)
        .eq('participant_id', room.locked_participant_id);

      await supabase.from('rooms').update({
        game_state: 'question_results',
        locked_participant_id: null,
      }).eq('id', room.id);
    }

    setActionLoading(false);
  };

  const exportLeaderboard = (format: 'csv' | 'pdf' | 'xlsx' = 'csv') => {
    if (!room) return;
    window.open(`/api/export-leaderboard?roomId=${room.id}&format=${format}`, '_blank');
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${code}/join`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePdfUpload = async (file: File) => {
    if (!room) return;
    setPdfUploading(true);
    setPdfUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', room.id);
      formData.append('roomCode', code);
      const res = await fetch('/api/upload-pdf', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
      setPdfPages(data.pages);
      setPdfTotalPages(data.totalPages);
      setPdfTitle(data.title);
      setPdfCurrentPage(1);
      setPdfModeActive(true);
    } catch (err: unknown) {
      setPdfUploadError(err instanceof Error ? err.message : 'PDF upload failed');
    } finally {
      setPdfUploading(false);
    }
  };

  const handleExitPdfMode = async () => {
    if (!room) return;
    await supabase.from('rooms').update({ pdf_mode_active: false }).eq('id', room.id);
    setPdfModeActive(false);
  };

  // ── Derived state ──────────────────────────────────────────
  const currentQuestionIndex = questions.findIndex(q => q.id === room?.current_question_id);
  const currentQuestion = currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null;
  const currentResponse = responses.find(r => r.participant_id === room?.locked_participant_id);
  const isExactMatch = currentResponse && currentQuestion
    ? currentResponse.selected_answer.trim().toLowerCase() === currentQuestion.correct_answer.trim().toLowerCase()
    : false;
  const lockedParticipant = participants.find(p => p.id === room?.locked_participant_id);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050308] text-white flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-t-[#8B5CF6] border-neutral-800 animate-spin" />
          <div className="text-[#8B5CF6] text-xs tracking-widest animate-pulse">INITIALIZING ARENA...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#050308] text-white flex items-center justify-center p-6">
        <NeonBackground />
        <GlassCard glowColor="pink" className="max-w-md w-full text-center relative z-10">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="font-orbitron font-bold text-xl text-red-400 mb-2">ACCESS DENIED</h2>
          <p className="text-neutral-400 font-mono text-sm mb-6">{error}</p>
          <CyberButton variant="outline" onClick={() => router.push('/dashboard')}>
            RETURN TO DASHBOARD
          </CyberButton>
        </GlassCard>
      </div>
    );
  }

  if (!room) return null;

  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/room/${code}/join`;
  const isGameActive =
    room.game_state !== GAME_STATES.WAITING &&
    room.game_state !== GAME_STATES.LOBBY &&
    room.game_state !== GAME_STATES.LEADERBOARD;

  return (
    <div className="relative min-h-screen flex flex-col z-10 text-white font-sans pb-12 overflow-hidden">
      <NeonBackground />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between relative z-10 border-b border-neutral-800/60">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-950/60 border border-neutral-800 hover:border-neutral-600 text-xs font-mono transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> CONTROL DECK
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FF4DCA] animate-pulse" />
            <span className="font-orbitron font-bold text-sm text-white tracking-wider">
              ARENA <span className="text-[#FF4DCA]">{code}</span>
            </span>
          </div>

          <button
            onClick={() => window.open(`/room/${code}/projector`, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-950/60 border border-indigo-500/50 hover:bg-indigo-600/30 text-indigo-300 text-xs font-mono shadow-[0_0_10px_rgba(99,102,241,0.3)] transition-all"
          >
            <Monitor className="w-3.5 h-3.5" /> PROJECTOR
          </button>
          <button
            onClick={() => router.push('/help')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-950/60 border border-neutral-800 hover:border-[#8B5CF6]/60 hover:text-[#8B5CF6] text-xs font-mono transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5" /> HELP
          </button>
        </div>
      </header>

      {/* PDF Mode fullscreen overlay */}
      {pdfModeActive && pdfPages.length > 0 && (
        <div className="fixed inset-0 z-40 bg-black flex flex-col" style={{ top: '0', left: '0' }}>
          <PdfProjectorMode
            roomCode={code}
            roomId={room.id}
            isMentor={true}
            initialPages={pdfPages}
            initialCurrentPage={pdfCurrentPage}
            initialTotalPages={pdfTotalPages}
            pdfTitle={pdfTitle}
            onExitPdfMode={handleExitPdfMode}
          />
        </div>
      )}

      {/* PDF upload error toast */}
      {pdfUploadError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-950/90 border border-red-500/50 text-red-200 text-xs font-mono rounded-xl shadow-xl max-w-sm text-center">
          ⚠ {pdfUploadError}
        </div>
      )}

      <main className="w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 mt-6">

        {/* ── Left Panel: Controls ── */}
        <div className="lg:col-span-4 space-y-5">

          {/* Waiting State */}
          {(room.game_state === GAME_STATES.WAITING || room.game_state === GAME_STATES.LOBBY) && (
            <GlassCard glowColor="purple">
              <div className="space-y-5">
                {/* Room Code + QR */}
                <div className="text-center space-y-4">
                  <span className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase block">Arena Access Signature</span>
                  <div className="py-4 px-6 rounded-lg bg-neutral-950 border border-[#8B5CF6]/50 text-[#8B5CF6] font-orbitron text-5xl font-black tracking-wider text-center select-all shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                    {code}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <div className="p-3 bg-white rounded-lg shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                      <QRCodeSVG value={inviteUrl} size={140} bgColor="#ffffff" fgColor="#000000" level="Q" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleCopyLink}
                        className="flex items-center gap-2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 hover:border-[#FF4DCA] text-xs font-mono transition-all"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'COPIED!' : 'COPY LINK'}
                      </button>
                      <div className="text-[10px] text-neutral-600 font-mono text-center">or share code</div>
                    </div>
                  </div>
                </div>

                {/* Battle Config */}
                <div className="space-y-4">
                  <h3 className="text-xs font-orbitron font-bold text-white flex items-center gap-2 uppercase">
                    <Settings2 className="w-4 h-4 text-[#8B5CF6]" /> Battle Configuration
                  </h3>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest block">Select Quiz</label>
                    <select
                      value={selectedQuizId}
                      onChange={(e) => setSelectedQuizId(e.target.value)}
                      className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2.5 px-4 text-sm text-white focus:border-[#8B5CF6] focus:outline-none"
                    >
                      {quizzes.length === 0 && <option value="">No quizzes — generate one first</option>}
                      {quizzes.map(q => (
                        <option key={q.id} value={q.id}>{q.title}</option>
                      ))}
                    </select>
                    {questions.length > 0 && (
                      <p className="text-[10px] text-[#8B5CF6] font-mono">{questions.length} questions loaded</p>
                    )}
                  </div>

                  {/* PDF Presentation Upload */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest block flex items-center gap-1.5">
                      <PresentationIcon className="w-3 h-3 text-[#FF4DCA]" /> PDF Presentation (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={pdfUploading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-[#FF4DCA]/30 hover:border-[#FF4DCA]/60 hover:bg-[#FF4DCA]/5 text-[#FF4DCA] text-xs font-mono transition-all disabled:opacity-50 group"
                    >
                      {pdfUploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> PROCESSING PDF...</>
                        : <><Upload className="w-4 h-4 group-hover:scale-110 transition-transform" /> UPLOAD PDF / CAPTURE WITH CAMERA</>}
                    </button>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ''; }}
                    />
                    {pdfUploadError && (
                      <p className="text-[10px] font-mono text-red-400">{pdfUploadError}</p>
                    )}
                    <p className="text-[9px] font-mono text-neutral-700">PDF or photo/scan • projects live to all participants</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest block">Marks / Question</label>
                      <input
                        type="number" min="1" max="10000"
                        value={marksPerQuestion}
                        onChange={(e) => setMarksPerQuestion(parseInt(e.target.value) || 500)}
                        className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2 px-3 text-sm text-white focus:border-[#8B5CF6] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest block">Timer Override (s)</label>
                      <input
                        type="number" min="5" max="300" placeholder="Default"
                        value={timerOverride}
                        onChange={(e) => setTimerOverride(e.target.value === '' ? '' : parseInt(e.target.value))}
                        className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2 px-3 text-sm text-white focus:border-[#8B5CF6] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[10px] text-red-500 font-mono uppercase tracking-widest block">Negative Marking Penalty (pts)</label>
                      <input
                        type="number" min="0" max="10000"
                        value={negativeMarkingPenalty}
                        onChange={(e) => setNegativeMarkingPenalty(parseInt(e.target.value) || 0)}
                        className="w-full bg-[#050308]/60 border border-neutral-800 rounded-md py-2 px-3 text-sm text-white focus:border-red-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <CyberButton
                  variant="pink" fullWidth
                  onClick={handleStartBattle}
                  disabled={participants.length === 0 || questions.length === 0 || actionLoading}
                >
                  <Play className="w-4 h-4" />
                  {participants.length === 0 ? 'WAITING FOR PLAYERS...' : 'INITIATE BATTLE'}
                </CyberButton>

                {questions.length === 0 && selectedQuizId && (
                  <p className="text-[10px] text-red-400 font-mono text-center">Quiz has no questions. Generate questions first.</p>
                )}
              </div>
            </GlassCard>
          )}

          {/* Active Game Controls */}
          {isGameActive && (
            <GlassCard glowColor="purple">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-orbitron font-bold text-[#FF4DCA]">
                    TARGET {currentQuestionIndex + 1}/{questions.length}
                  </div>
                  {room.game_state === GAME_STATES.QUESTION_ACTIVE && (
                    <div className={`flex items-center gap-2 font-mono text-lg font-bold ${timeRemaining <= 5 ? 'text-red-400' : 'text-white'}`}>
                      <Timer className="w-4 h-4" />
                      {timeRemaining}s
                    </div>
                  )}
                </div>

                {/* State badge */}
                <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest font-bold text-center border
                  ${room.game_state === GAME_STATES.QUESTION_ACTIVE ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-400' : ''}
                  ${(room.game_state === GAME_STATES.BUZZ_LOCKED || room.game_state === GAME_STATES.ANSWERING) ? 'bg-yellow-900/30 border-yellow-500/40 text-yellow-400' : ''}
                  ${room.game_state === GAME_STATES.EVALUATION ? 'bg-purple-900/30 border-purple-500/40 text-purple-300' : ''}
                  ${room.game_state === GAME_STATES.QUESTION_RESULTS ? 'bg-blue-900/30 border-blue-500/40 text-blue-400' : ''}
                `}>
                  {room.game_state === GAME_STATES.QUESTION_ACTIVE && '● QUESTION LIVE'}
                  {(room.game_state === GAME_STATES.BUZZ_LOCKED || room.game_state === GAME_STATES.ANSWERING) && `⚡ ${lockedParticipant?.name || 'PLAYER'} ANSWERING`}
                  {room.game_state === GAME_STATES.EVALUATION && `◆ EVALUATING ${lockedParticipant?.name || 'PLAYER'}`}
                  {room.game_state === GAME_STATES.QUESTION_RESULTS && '✓ RESULTS'}
                </div>

                {/* Buzzer Feed */}
                <div className="space-y-2">
                  <h4 className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-yellow-400" /> LIVE BUZZER FEED
                  </h4>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {buzzes.length === 0 ? (
                      <div className="p-3 text-xs font-mono text-neutral-600 border border-dashed border-neutral-800 text-center rounded">
                        AWAITING BUZZ...
                      </div>
                    ) : (
                      buzzes.map((buzz, i) => {
                        const isActive =
                          i === (room.current_buzzer_index || 0) &&
                          (room.game_state === GAME_STATES.BUZZ_LOCKED ||
                            room.game_state === GAME_STATES.ANSWERING ||
                            room.game_state === GAME_STATES.EVALUATION);
                        const resp = responses.find(r => r.participant_id === buzz.participant_id);
                        return (
                          <div
                            key={buzz.id}
                            className={`p-2 rounded flex items-center justify-between border transition-all ${
                              isActive
                                ? 'bg-yellow-900/30 border-yellow-500/50 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                : 'bg-neutral-900/50 border-neutral-800'
                            }`}
                          >
                            <span className="font-mono text-xs flex gap-2 items-center">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                isActive ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'
                              }`}>{i + 1}</span>
                              <span className={isActive ? 'text-yellow-400 font-bold' : 'text-neutral-400'}>
                                {(buzz.participants as Participant | undefined)?.name || `P${i + 1}`}
                              </span>
                            </span>
                            <div className="flex items-center gap-2">
                              {resp && (
                                resp.is_correct
                                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  : <XCircle className="w-3.5 h-3.5 text-red-400" />
                              )}
                              <span className="text-[10px] font-mono text-neutral-600">
                                #{i + 1}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Force Skip */}
                {room.game_state === GAME_STATES.QUESTION_ACTIVE && (
                  <button
                    onClick={handleForceSkip}
                    className="w-full py-2 rounded text-xs font-mono text-neutral-500 border border-dashed border-neutral-700 hover:border-red-500/50 hover:text-red-400 transition-all"
                  >
                    FORCE SKIP TO RESULTS
                  </button>
                )}

                {/* Grading Panel */}
                {(room.game_state === GAME_STATES.BUZZ_LOCKED ||
                  room.game_state === GAME_STATES.ANSWERING ||
                  room.game_state === GAME_STATES.EVALUATION) && (
                  <div className="space-y-3">
                    {currentResponse ? (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded border border-[#FF4DCA]/30 bg-[#FF4DCA]/5 space-y-4"
                        >
                          <h4 className="font-orbitron font-bold text-[#FF4DCA] text-sm text-center">
                            EVALUATE RESPONSE
                          </h4>
                          <div className="space-y-2">
                            <div className="p-3 bg-neutral-950 rounded text-center">
                              <span className="text-[10px] text-neutral-500 block mb-1">PLAYER ANSWERED:</span>
                              <span className="font-bold text-white text-base break-words">
                                {currentResponse.selected_answer}
                              </span>
                            </div>
                            {currentQuestion?.question_type === 'mcq' && (
                              <div className="p-2 bg-emerald-950/30 rounded text-center">
                                <span className="text-[10px] text-emerald-500 block mb-1">CORRECT ANSWER:</span>
                                <span className="font-mono text-emerald-400 text-sm">
                                  {currentQuestion.correct_answer}
                                </span>
                              </div>
                            )}
                          </div>

                          {isExactMatch && currentQuestion?.question_type !== 'descriptive' ? (
                            <div className="space-y-2 text-center">
                              <div className="text-emerald-400 text-[10px] font-mono font-bold animate-pulse">
                                ✓ AUTO-DETECTED CORRECT
                              </div>
                              <CyberButton variant="purple" fullWidth onClick={() => gradeAnswer(true)} disabled={actionLoading}>
                                AWARD +{room.marks_per_question} & NEXT
                              </CyberButton>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => gradeAnswer(false)}
                                disabled={actionLoading}
                                className="flex-1 p-3 rounded bg-red-950/40 border border-red-500/50 hover:bg-red-900/60 text-red-400 font-bold text-xs uppercase transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4" />
                                WRONG {room.negative_marking_penalty > 0 ? `(-${room.negative_marking_penalty})` : ''}
                              </button>
                              <button
                                onClick={() => gradeAnswer(true)}
                                disabled={actionLoading}
                                className="flex-1 p-3 rounded bg-emerald-950/40 border border-emerald-500/50 hover:bg-emerald-900/60 text-emerald-400 font-bold text-xs uppercase transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4" />
                                CORRECT
                              </button>
                            </div>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="p-4 text-center border border-dashed border-yellow-500/30 rounded bg-yellow-900/10">
                        <div className="text-yellow-400 font-mono text-xs animate-pulse uppercase tracking-widest">
                          ⚡ Awaiting player answer...
                        </div>
                        <div className="text-neutral-500 font-mono text-[10px] mt-1">
                          {lockedParticipant?.name || 'Player'} is typing...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Next Question */}
                {room.game_state === GAME_STATES.QUESTION_RESULTS && (
                  <CyberButton variant="pink" fullWidth onClick={handleNextQuestion} disabled={actionLoading}>
                    <ArrowRight className="w-4 h-4" />
                    {currentQuestionIndex + 1 < questions.length ? 'NEXT TARGET' : 'SHOW FINAL PODIUM'}
                  </CyberButton>
                )}
              </div>
            </GlassCard>
          )}

          {/* Leaderboard state */}
          {room.game_state === GAME_STATES.LEADERBOARD && (
            <GlassCard glowColor="pink">
              <div className="text-center space-y-4">
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto" />
                <h3 className="font-orbitron font-bold text-xl text-white">BATTLE OVER</h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => exportLeaderboard('csv')}
                    className="py-2 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-[#FF4DCA]/60 text-xs font-mono text-neutral-200 transition-colors"
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportLeaderboard('xlsx')}
                    className="py-2 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-[#FF4DCA]/60 text-xs font-mono text-neutral-200 transition-colors"
                  >
                    XLSX
                  </button>
                  <button
                    type="button"
                    onClick={() => exportLeaderboard('pdf')}
                    className="py-2 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-[#FF4DCA]/60 text-xs font-mono text-neutral-200 transition-colors"
                  >
                    PDF
                  </button>
                </div>
                <CyberButton variant="outline" fullWidth onClick={() => router.push('/dashboard')}>
                  RETURN TO DASHBOARD
                </CyberButton>
              </div>
            </GlassCard>
          )}
        </div>

        {/* ── Right Panel: Participants & Question Preview ── */}
        <div className="lg:col-span-8 space-y-5">

          {/* Waiting / Leaderboard: Participants list */}
          {(room.game_state === GAME_STATES.WAITING ||
            room.game_state === GAME_STATES.LOBBY ||
            room.game_state === GAME_STATES.LEADERBOARD) && (
            <GlassCard glowColor="pink">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-orbitron font-bold text-lg text-white">
                  {room.game_state === 'leaderboard' ? '🏆 FINAL LEADERBOARD' : 'CONTENDERS'}
                </h3>
                <span className="text-xs font-mono text-[#FF4DCA] border border-[#FF4DCA]/30 px-3 py-1 rounded-full bg-[#FF4DCA]/5">
                  {participants.length} / {room.participant_limit} JOINED
                </span>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 font-mono text-xs">
                  <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p>Waiting for players to join...</p>
                  <p className="mt-2 text-[10px]">Share the code: <span className="text-[#FF4DCA]">{code}</span></p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {participants.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-3 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-between hover:border-[#FF4DCA]/40 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#FF4DCA] to-[#8B5CF6] flex items-center justify-center text-[10px] font-bold text-black font-orbitron">
                          #{(p.join_order || p.player_number).toString().padStart(2, '0')}
                        </span>
                        <span className="font-mono text-sm text-white truncate max-w-[90px]">{p.name}</span>
                      </div>
                      <span className="text-[#FF4DCA] font-bold font-mono">{p.score}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* Active game: Question preview + current state */}
          {isGameActive && currentQuestion && (
            <GlassCard glowColor="purple">
              <div className="space-y-5">
                {/* Question */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">
                      Q{currentQuestionIndex + 1} • {currentQuestion.question_type.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-[#8B5CF6] font-mono">
                      {room.marks_per_question} pts
                    </span>
                  </div>
                  <h3 className="font-orbitron font-bold text-xl text-white leading-relaxed">
                    {currentQuestion.question_text}
                  </h3>
                </div>

                {/* Options if MCQ */}
                {currentQuestion.question_type === 'mcq' && currentQuestion.options.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      const reveal = room.game_state === GAME_STATES.QUESTION_RESULTS;
                      const isCorrect = reveal && opt === currentQuestion.correct_answer;
                      return (
                        <div
                          key={i}
                          className={`p-3 rounded border text-xs font-mono flex items-center gap-2 ${
                            isCorrect
                              ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-400'
                              : 'border-neutral-700 bg-neutral-900/40 text-neutral-400'
                          }`}
                        >
                          <span className="w-5 h-5 rounded flex items-center justify-center bg-neutral-800 text-[10px] font-bold">
                            {String.fromCharCode(65 + i)}
                          </span>
                          {opt}
                          {isCorrect && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Answer key */}
                {currentQuestion.question_type !== 'mcq' && (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded">
                    <span className="text-[10px] text-emerald-500 font-mono uppercase block mb-1">Correct Answer Key:</span>
                    <p className="font-bold text-emerald-400">{currentQuestion.correct_answer}</p>
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {/* Live Leaderboard during game */}
          {isGameActive && participants.length > 0 && (
            <GlassCard glowColor="none">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <h4 className="font-orbitron font-bold text-sm text-white uppercase">Live Standings</h4>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {[...participants]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 10)
                  .map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-neutral-800/50 last:border-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        i === 0 ? 'bg-yellow-500 text-black' :
                        i === 1 ? 'bg-neutral-400 text-black' :
                        i === 2 ? 'bg-amber-600 text-black' : 'bg-neutral-800 text-neutral-400'
                      }`}>{i + 1}</span>
                      <span className="font-mono text-sm text-white flex-1 truncate">{p.name}</span>
                      <span className="font-mono font-bold text-[#FF4DCA] text-sm">{p.score}</span>
                    </div>
                  ))
                }
              </div>
            </GlassCard>
          )}
        </div>
      </main>
    </div>
  );
}
