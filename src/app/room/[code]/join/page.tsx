'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Room, Participant, Question, Response } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, HelpCircle, CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react';
import NeonBackground from '@/components/NeonBackground';
import GlassCard from '@/components/ui/GlassCard';
import CyberButton from '@/components/ui/CyberButton';
import { v4 as uuidv4 } from 'uuid';
import { playCyberSound } from '@/lib/sounds';
import { GAME_STATES, shouldRevealAnswers } from '@/lib/gameState';
import { sanitizeQuestionForDisplay } from '@/lib/questions';
import { useRoomChannel } from '@/lib/realtime/useRoomChannel';
import { submitStudentAnswer } from '@/lib/submitAnswer';
import CredentialBadge from '@/components/badges/CredentialBadge';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default function StudentRoom({ params }: PageProps) {
  const router = useRouter();
  const { code } = React.use(params);

  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [myResponse, setMyResponse] = useState<Response | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [buzzLoading, setBuzzLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const participantRef = useRef<Participant | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Session ID management ─────────────────────────────────
  const getSessionId = () => {
    if (typeof window === 'undefined') return uuidv4();
    let sid = localStorage.getItem('buzznexus_session_id');
    if (!sid) {
      sid = uuidv4();
      localStorage.setItem('buzznexus_session_id', sid);
    }
    return sid;
  };

  // ── Initial room load ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: roomData } = await supabase
        .from('rooms').select('*').eq('code', code).maybeSingle();

      if (!roomData) {
        setRoomNotFound(true);
        return;
      }

      setRoom(roomData as Room);
      roomRef.current = roomData as Room;

      // Check existing session
      const sessionId = getSessionId();
      const { data: existing } = await supabase
        .from('participants').select('*')
        .eq('room_id', roomData.id).eq('session_id', sessionId).maybeSingle();

      if (existing) {
        setParticipant(existing as Participant);
        participantRef.current = existing as Participant;
        // Load current question if active
        if (
          roomData.current_question_id &&
          (roomData.game_state === GAME_STATES.QUESTION_RESULTS ||
            (roomData.game_state === GAME_STATES.BUZZ_LOCKED &&
              roomData.locked_participant_id === existing.id))
        ) {
          await loadQuestionForState(roomData as Room, roomData.current_question_id);
          await fetchMyResponse(roomData.id, roomData.current_question_id, existing.id);
        }
      }
    };
    init();
  }, [code]);

  const loadQuestionForState = useCallback(async (roomState: Room, qId: string) => {
    const { data } = await supabase.from('questions').select('*').eq('id', qId).single();
    if (data) {
      const q = data as Question;
      setCurrentQuestion(
        shouldRevealAnswers(roomState.game_state)
          ? q
          : sanitizeQuestionForDisplay(q, roomState.game_state)
      );
    }
  }, []);

  const fetchMyResponse = useCallback(async (roomId: string, qId: string, pId: string) => {
    const { data } = await supabase
      .from('responses').select('*')
      .eq('question_id', qId).eq('participant_id', pId).maybeSingle();
    setMyResponse(data as Response | null);
  }, []);

  const showFeedback = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 2500);
  }, []);

  const handleRoomRealtime = useCallback(
    async (newRoom: Room, oldRoom: Room | null) => {
      setRoom(newRoom);
      roomRef.current = newRoom;

      const pid = participantRef.current?.id;
      if (!pid) return;

      if (newRoom.current_question_id !== oldRoom?.current_question_id) {
              setMyResponse(null);
              setAnswerInput('');
              setSelectedOption(null);
              setBuzzLoading(false);
              setSubmittingAnswer(false);
              setCurrentQuestion(null);
      }

      if (newRoom.game_state !== oldRoom?.game_state) {
        if (newRoom.game_state === GAME_STATES.QUESTION_ACTIVE) {
          playCyberSound('transition');
          showFeedback('NEW TARGET — PREPARE TO BUZZ!', 'info');
          setBuzzLoading(false);
          setCurrentQuestion(null);
        }
        if (newRoom.game_state === GAME_STATES.EVALUATION) {
          showFeedback('ANSWER LOCKED — AWAITING EVALUATION', 'info');
        }
        if (newRoom.game_state === GAME_STATES.QUESTION_RESULTS && newRoom.current_question_id) {
          await loadQuestionForState(newRoom, newRoom.current_question_id);
          await fetchMyResponse(newRoom.id, newRoom.current_question_id, pid);
        }
        if (newRoom.game_state === GAME_STATES.LEADERBOARD) {
          playCyberSound('transition');
        }
      }

      const iAmLocked = newRoom.locked_participant_id === pid;
      const wasLocked = oldRoom?.locked_participant_id === pid;

      if (
        (newRoom.game_state === GAME_STATES.BUZZ_LOCKED ||
          newRoom.game_state === GAME_STATES.ANSWERING) &&
        iAmLocked &&
        !wasLocked &&
        newRoom.current_question_id
      ) {
        playCyberSound('lock');
        showFeedback("⚡ YOU'RE LOCKED IN! ANSWER NOW!", 'success');
        await loadQuestionForState(newRoom, newRoom.current_question_id);
        setBuzzLoading(false);
      }

      if (
        newRoom.game_state === GAME_STATES.BUZZ_LOCKED &&
        !iAmLocked &&
        wasLocked
      ) {
        playCyberSound('wrong');
        setCurrentQuestion(null);
      }
    },
    [fetchMyResponse, loadQuestionForState, showFeedback]
  );

  const { setRoomSnapshot } = useRoomChannel({
    roomId: room?.id ?? null,
    channelPrefix: `student-${participant?.id ?? 'guest'}`,
    onRoomUpdate: handleRoomRealtime,
    enabled: Boolean(room && participant),
  });

  useEffect(() => {
    if (room) setRoomSnapshot(room);
  }, [room, setRoomSnapshot]);

  // Participant score + response grading (scoped channels)
  useEffect(() => {
    if (!room || !participant) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`student-extra-${room.id}-${participant.id}-v3`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `id=eq.${participant.id}` },
        (payload) => {
          const newP = payload.new as Participant;
          const oldScore = participantRef.current?.score || 0;
          setParticipant(newP);
          participantRef.current = newP;

          if (roomRef.current?.game_state !== GAME_STATES.QUESTION_RESULTS) return;

          if (newP.score > oldScore) {
            playCyberSound('correct');
            showFeedback(`+${newP.score - oldScore} POINTS AWARDED!`, 'success');
          } else if (newP.score < oldScore) {
            playCyberSound('wrong');
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 600);
            showFeedback('POINTS DEDUCTED', 'error');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'responses', filter: `participant_id=eq.${participant.id}` },
        (payload) => {
          if (roomRef.current?.game_state !== GAME_STATES.QUESTION_RESULTS) return;
          const r = payload.new as Response;
          setMyResponse(r);
          if (r.is_correct) playCyberSound('correct');
          else playCyberSound('wrong');
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
  }, [room?.id, participant?.id, showFeedback]);

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room || room.game_state !== GAME_STATES.QUESTION_ACTIVE || !room.question_start_time) {
      setTimeRemaining(0);
      return;
    }
    const timeLimitMs = (room.timer_override || 30) * 1000;
    const update = () => {
      const elapsed = Date.now() - new Date(room.question_start_time!).getTime();
      setTimeRemaining(Math.max(0, Math.ceil((timeLimitMs - elapsed) / 1000)));
    };
    update();
    timerRef.current = setInterval(update, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.game_state, room?.question_start_time, room?.current_question_id, currentQuestion]);

  // ── Join ──────────────────────────────────────────────────
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !room) return;
    setJoining(true);

    try {
      // Check participant count
      const { count } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if (count !== null && count >= room.participant_limit) {
        setRoomFull(true);
        setJoining(false);
        return;
      }

      const sessionId = getSessionId();

      // Get join order (count + 1)
      const joinOrder = (count || 0) + 1;

      const { data, error } = await supabase
        .from('participants')
        .insert({
          room_id: room.id,
          name: nameInput.trim(),
          player_number: joinOrder,
          join_order: joinOrder,
          session_id: sessionId,
          score: 0,
          streak_count: 0,
        })
        .select().single();

      if (error) {
        if (error.code === '23505') {
          // Duplicate session — re-fetch existing
          const { data: existing } = await supabase
            .from('participants').select('*')
            .eq('room_id', room.id).eq('session_id', sessionId).maybeSingle();
          if (existing) {
            setParticipant(existing as Participant);
            participantRef.current = existing as Participant;
          }
        } else {
          throw error;
        }
      } else if (data) {
        setParticipant(data as Participant);
        participantRef.current = data as Participant;
        playCyberSound('transition');
      }
    } catch (err) {
      console.error('Join error:', err);
      alert('Error joining arena. Please try again.');
    }
    setJoining(false);
  };

  // ── Buzz ──────────────────────────────────────────────────
  const handleBuzz = async () => {
    if (buzzLoading || !room || !participant || room.game_state !== GAME_STATES.QUESTION_ACTIVE) return;
    setBuzzLoading(true);
    playCyberSound('buzz');

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(100);

    try {
      const { data, error } = await supabase.rpc('handle_buzz', {
        p_room_id: room.id,
        p_question_id: room.current_question_id,
        p_participant_id: participant.id,
      });

      if (error) throw error;

      if (data && !data.success) {
        setBuzzLoading(false);
        showFeedback('Too slow! Question is locked.', 'error');
      }
      // If not first, keep loading until room state changes
      if (data && data.is_first === false) {
        // We buzzed but weren't first — will be notified via realtime
        setTimeout(() => setBuzzLoading(false), 2000);
      }
    } catch (err) {
      console.error('Buzz error:', err);
      setBuzzLoading(false);
    }
  };

  // ── Submit Answer ─────────────────────────────────────────
  const submitAnswer = async (answerValue: string) => {
    if (!currentQuestion || myResponse || !participant || !room || submittingAnswer) return;
    setSubmittingAnswer(true);

    const elapsed = Date.now() - new Date(room.question_start_time!).getTime();
    const trimmedAnswer = answerValue.trim();

    const pending: Response = {
      id: 'pending',
      participant_id: participant.id,
      question_id: currentQuestion.id,
      selected_answer: trimmedAnswer,
      is_correct: false,
      points_awarded: 0,
      response_time_ms: elapsed,
      answered_at: new Date().toISOString(),
    };
    setMyResponse(pending);

    const result = await submitStudentAnswer({
      roomId: room.id,
      questionId: currentQuestion.id,
      participantId: participant.id,
      answer: trimmedAnswer,
      responseTimeMs: elapsed,
    });

    if (!result.ok) {
      console.error('Submit answer error:', result.message, result.reason);
      setMyResponse(null);
      showFeedback(result.message || 'Failed to submit answer. Try again.', 'error');
    } else {
      setRoom((prev) => (prev ? { ...prev, game_state: GAME_STATES.EVALUATION } : prev));
      roomRef.current = roomRef.current
        ? { ...roomRef.current, game_state: GAME_STATES.EVALUATION }
        : null;
      showFeedback('ANSWER SUBMITTED — AWAITING EVALUATION', 'info');
    }
    setSubmittingAnswer(false);
  };

  // ── Derived state ─────────────────────────────────────────
  const amILocked = room?.locked_participant_id === participant?.id;
  const pNum = participant ? (participant.join_order || participant.player_number) : 0;

  // ── Render guards ─────────────────────────────────────────
  if (roomNotFound) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 text-white bg-black">
        <NeonBackground />
        <div className="relative z-10 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 animate-pulse" />
          <h1 className="font-orbitron font-black text-4xl text-red-400 mb-2">ROOM NOT FOUND</h1>
          <p className="text-neutral-400 font-mono mb-6">Check the room code and try again.</p>
          <CyberButton variant="outline" onClick={() => router.push('/join')}>TRY AGAIN</CyberButton>
        </div>
      </div>
    );
  }

  if (roomFull) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 text-white bg-black">
        <NeonBackground />
        <div className="relative z-10 text-center">
          <div className="text-8xl mb-6 animate-bounce">🚫</div>
          <h1 className="font-orbitron font-black text-6xl text-red-500 mb-4 tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]">
            ROOM FULL
          </h1>
          <p className="text-red-400/80 font-mono tracking-widest">Participant capacity reached</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#050308] text-white flex items-center justify-center font-mono text-xs text-[#8B5CF6] animate-pulse tracking-widest">
        LOCATING ARENA...
      </div>
    );
  }

  // Join form
  if (!participant) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 text-white">
        <NeonBackground />
        <div className="absolute top-5 left-5 right-5 z-20 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/room/join')}
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
        <div className="relative z-10 w-full max-w-sm">
          <GlassCard glowColor="purple" className="p-8">
            <div className="text-center mb-8">
              <h2 className="font-orbitron font-bold text-2xl text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] uppercase tracking-widest">
                ENTER ARENA
              </h2>
              <p className="text-center text-xs text-neutral-400 font-mono mt-2 uppercase tracking-widest">
                Sector: <span className="text-[#FF4DCA]">{code}</span>
              </p>
            </div>
            <form onSubmit={handleJoin} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest block">
                  Contender Alias
                </label>
                <input
                  type="text" required maxLength={20}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your battle name..."
                  className="w-full bg-neutral-900/50 border border-neutral-800 rounded-lg py-4 px-4 text-white focus:border-[#FF4DCA] focus:outline-none font-bold text-center text-2xl tracking-wider"
                  autoFocus
                />
              </div>
              <CyberButton variant="pink" fullWidth type="submit" disabled={joining}>
                {joining ? 'LINKING...' : 'ESTABLISH LINK'}
              </CyberButton>
            </form>
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col text-white font-sans overflow-hidden">
      <NeonBackground />

      {/* Floating Feedback */}
      <AnimatePresence>
        {feedbackMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.9 }}
            className="fixed top-24 left-0 w-full flex justify-center z-50 pointer-events-none px-4"
          >
            <div className={`px-6 py-3 rounded-xl font-orbitron font-black text-xl tracking-widest uppercase shadow-2xl border ${
              feedbackMessage.type === 'success' ? 'bg-emerald-950/90 border-emerald-500 text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.4)]' :
              feedbackMessage.type === 'error' ? 'bg-red-950/90 border-red-500 text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.4)]' :
              'bg-black/90 border-[#FF4DCA] text-[#FF4DCA] shadow-[0_0_30px_rgba(255,77,202,0.4)]'
            }`}>
              {feedbackMessage.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-[#FF4DCA]/20 bg-neutral-950/80 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/room/join')}
            className="w-9 h-9 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#FF4DCA]/60 text-neutral-400 hover:text-[#FF4DCA] flex items-center justify-center transition-all"
            title="Back to join"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
          <motion.span
            animate={isShaking ? { x: [-6, 6, -4, 4, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="font-orbitron font-bold text-white text-lg tracking-wider"
          >
            {participant.name}
          </motion.span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-pulse" />
            <span className="text-[11px] text-[#8B5CF6] font-mono font-bold tracking-widest uppercase">
              CONTENDER #{pNum.toString().padStart(2, '0')}
            </span>
          </div>
          </div>
        </div>
        <div className="text-right">
          <motion.div
            key={participant.score}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className={`font-mono text-3xl font-bold ${isShaking ? 'text-red-400' : 'text-[#FF4DCA]'}`}
          >
            {participant.score}
          </motion.div>
          <div className="text-[10px] text-neutral-500 font-mono tracking-widest uppercase mt-0.5">PTS</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-5 relative z-10 w-full max-w-lg mx-auto">
        <AnimatePresence mode="wait">

          {/* WAITING */}
          {(room.game_state === GAME_STATES.WAITING || room.game_state === GAME_STATES.LOBBY) && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center w-full">
              <GlassCard glowColor="purple" className="py-14">
                <div className="w-14 h-14 mx-auto rounded-full border-2 border-t-[#8B5CF6] border-neutral-800 animate-spin mb-6" />
                <h2 className="font-orbitron font-bold text-2xl text-white mb-2">STANDBY</h2>
                <p className="text-neutral-500 text-xs font-mono uppercase tracking-widest">Awaiting mentor to start battle</p>
                <div className="mt-8 flex items-center justify-center gap-2">
                  {participant.streak_count > 0 && (
                    <span className="px-3 py-1 rounded-full bg-orange-900/30 border border-orange-500/30 text-orange-400 font-mono text-xs">
                      🔥 {participant.streak_count}x streak
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full bg-[#FF4DCA]/10 border border-[#FF4DCA]/30 text-[#FF4DCA] font-mono text-xs font-bold">
                    #{pNum.toString().padStart(2, '0')} connected
                  </span>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* QUESTION ACTIVE — Show BUZZ button */}
          {room.game_state === GAME_STATES.QUESTION_ACTIVE && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="w-full flex flex-col items-center gap-8"
            >
              {/* Timer */}
              <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center font-orbitron font-black text-3xl transition-all ${
                timeRemaining <= 5
                  ? 'border-red-500 text-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                  : 'border-[#FF4DCA] text-white'
              }`}>
                {timeRemaining}
              </div>

              <div className="text-[#8B5CF6] font-mono text-sm tracking-widest uppercase text-center">
                Watch the projector — prepare to buzz!
              </div>

              {/* BUZZ BUTTON */}
              <motion.button
                onClick={handleBuzz}
                disabled={buzzLoading}
                whileHover={!buzzLoading ? { scale: 1.05 } : {}}
                whileTap={!buzzLoading ? { scale: 0.92 } : {}}
                className={`relative w-72 h-72 rounded-full flex items-center justify-center overflow-hidden transition-all duration-100
                  ${buzzLoading
                    ? 'bg-neutral-800 shadow-none cursor-wait'
                    : 'bg-gradient-to-b from-[#FF4DCA] to-pink-700 shadow-[0_0_60px_#FF4DCA,0_0_120px_rgba(255,77,202,0.4),inset_0_5px_20px_rgba(255,255,255,0.4)] cursor-pointer active:scale-95'
                  }`}
              >
                {/* Inner glow */}
                {!buzzLoading && (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(255,255,255,0.3)_0%,transparent_60%)]" />
                )}
                {/* Ping ring */}
                {!buzzLoading && (
                  <div className="absolute inset-0 border-[6px] border-white/20 rounded-full animate-ping" style={{ animationDuration: '1.5s' }} />
                )}
                <span className={`font-orbitron font-black text-7xl drop-shadow-[0_3px_3px_rgba(0,0,0,0.6)] z-10 transition-all ${
                  buzzLoading ? 'text-neutral-500 text-5xl' : 'text-white'
                }`}>
                  {buzzLoading ? '...' : 'BUZZ'}
                </span>
              </motion.button>

              {buzzLoading && (
                <p className="text-neutral-400 font-mono text-xs animate-pulse">Buzz registered — waiting...</p>
              )}
            </motion.div>
          )}

          {/* BUZZ LOCKED — locked out state */}
          {(room.game_state === GAME_STATES.BUZZ_LOCKED ||
            room.game_state === GAME_STATES.ANSWERING ||
            room.game_state === GAME_STATES.EVALUATION) &&
            !amILocked && (
            <motion.div
              key="locked-out"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <GlassCard glowColor="none" className="text-center py-16 border-red-500/20">
                <motion.div
                  animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-20 h-20 mx-auto rounded-full bg-red-900/30 border-2 border-red-500 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                >
                  <XCircle className="w-10 h-10 text-red-400" />
                </motion.div>
                <h2 className="font-orbitron font-bold text-3xl text-red-400 mb-3 uppercase">LOCKED OUT</h2>
                <p className="text-red-500/70 text-sm font-mono uppercase tracking-widest">Someone else is answering...</p>
                <p className="text-neutral-600 text-xs font-mono mt-4">Stay ready — they might get it wrong!</p>
              </GlassCard>
            </motion.div>
          )}

          {/* BUZZ LOCKED — MY TURN */}
          {(room.game_state === GAME_STATES.BUZZ_LOCKED ||
            room.game_state === GAME_STATES.ANSWERING ||
            room.game_state === GAME_STATES.EVALUATION) &&
            amILocked &&
            currentQuestion && (
            <motion.div
              key="my-turn"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <GlassCard glowColor="pink" className="border-[#FF4DCA]/60 shadow-[0_0_40px_rgba(255,77,202,0.2)]">
                {/* LOCKED IN badge */}
                <div className="text-center mb-5">
                  <motion.div
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4DCA]/20 text-[#FF4DCA] border border-[#FF4DCA]/50 rounded-full font-orbitron text-sm font-bold uppercase tracking-widest"
                  >
                    <Zap className="w-4 h-4" />
                    YOUR TURN — ANSWER NOW!
                  </motion.div>
                </div>

                {/* Question */}
                <h3 className="font-orbitron font-bold text-xl text-white mb-6 leading-relaxed text-center">
                  {currentQuestion.question_text}
                </h3>

                {/* Answer area — hidden after submit or during evaluation */}
                {!myResponse &&
                room.game_state !== GAME_STATES.EVALUATION ? (
                  <div className="space-y-3 mt-6">
                    {currentQuestion.question_type === 'mcq' && currentQuestion.options.length > 0 ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                          {currentQuestion.options.map((opt, i) => {
                            const isSelected = selectedOption === opt;
                            return (
                              <motion.button
                                key={i}
                                type="button"
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                onClick={() => setSelectedOption(opt)}
                                disabled={submittingAnswer}
                                className={`w-full p-4 rounded-xl text-left font-mono text-base transition-all flex items-center gap-4 disabled:opacity-50 ${
                                  isSelected
                                    ? 'bg-violet-950/50 border-2 border-violet-400/70 text-white shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                                    : 'bg-[#050308]/60 border border-neutral-700 text-neutral-200 hover:border-neutral-500'
                                }`}
                              >
                                <span
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                                    isSelected ? 'bg-violet-500 text-black' : 'bg-neutral-900 text-neutral-400'
                                  }`}
                                >
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </motion.button>
                            );
                          })}
                        </div>
                        <CyberButton
                          variant="pink"
                          fullWidth
                          disabled={!selectedOption || submittingAnswer}
                          onClick={() => selectedOption && submitAnswer(selectedOption)}
                        >
                          {submittingAnswer ? 'SUBMITTING...' : 'LOCK IN ANSWER'}
                        </CyberButton>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => { e.preventDefault(); submitAnswer(answerInput); }}
                        className="space-y-4"
                      >
                        <input
                          type="text"
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          placeholder="Type your answer..."
                          className="w-full bg-[#050308]/60 border border-neutral-700 rounded-xl py-4 px-5 text-white focus:border-[#FF4DCA] focus:outline-none font-mono text-lg"
                          required autoFocus
                        />
                        <CyberButton variant="pink" fullWidth type="submit" disabled={submittingAnswer}>
                          {submittingAnswer ? 'SUBMITTING...' : 'SUBMIT ANSWER'}
                        </CyberButton>
                      </form>
                    )}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 text-center border border-dashed border-[#8B5CF6]/40 rounded-xl bg-[#8B5CF6]/5 mt-6"
                  >
                    <CheckCircle className="w-14 h-14 text-[#8B5CF6] mx-auto mb-4" />
                    <h4 className="font-orbitron font-bold text-white text-lg">
                      {room.game_state === GAME_STATES.EVALUATION
                        ? 'AWAITING EVALUATION'
                        : 'ANSWER SUBMITTED'}
                    </h4>
                    {myResponse && (
                      <p className="text-xs font-mono text-neutral-400 mt-2 uppercase tracking-widest">
                        You answered: <span className="text-white">{myResponse.selected_answer}</span>
                      </p>
                    )}
                    <p className="text-xs font-mono text-neutral-500 mt-1">
                      Mentor is judging your response...
                    </p>
                  </motion.div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* QUESTION RESULTS */}
          {room.game_state === GAME_STATES.QUESTION_RESULTS && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {myResponse ? (
                myResponse.is_correct ? (
                  <GlassCard glowColor="none" className="text-center py-14 bg-emerald-950/20 border-emerald-500/40">
                    <div className="absolute inset-0 bg-emerald-500/5 rounded-xl" />
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                    >
                      <CheckCircle className="w-24 h-24 text-emerald-400 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(52,211,153,0.6)]" />
                    </motion.div>
                    <h2 className="font-orbitron font-black text-5xl text-emerald-400 mb-4 drop-shadow-[0_0_15px_rgba(52,211,153,0.4)]">
                      CORRECT!
                    </h2>
                    <p className="text-emerald-500 font-mono text-xl font-bold">
                      +{myResponse.points_awarded} POINTS
                    </p>
                    <p className="text-emerald-600/70 font-mono text-sm mt-2">
                      Total: {participant.score} pts
                    </p>
                  </GlassCard>
                ) : (
                  <GlassCard glowColor="none" className="text-center py-14 bg-red-950/20 border-red-500/30">
                    <div className="absolute inset-0 bg-red-500/5 rounded-xl" />
                    <XCircle className="w-24 h-24 text-red-500 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]" />
                    <h2 className="font-orbitron font-black text-5xl text-red-500 mb-4">WRONG!</h2>
                    {(myResponse.points_awarded || 0) < 0 && (
                      <p className="text-red-400 font-mono text-xl font-bold">
                        {myResponse.points_awarded} POINTS
                      </p>
                    )}
                    <p className="text-red-600/70 font-mono text-sm mt-2">
                      Total: {participant.score} pts
                    </p>
                  </GlassCard>
                )
              ) : (
                <GlassCard glowColor="purple" className="text-center py-14">
                  <div className="w-12 h-12 mx-auto rounded-full border-2 border-t-[#8B5CF6] border-neutral-800 animate-spin mb-5" />
                  <h2 className="font-orbitron font-bold text-2xl text-neutral-400 mb-2">ROUND COMPLETE</h2>
                  <p className="text-neutral-500 font-mono text-xs uppercase tracking-widest">Prepare for next target...</p>
                </GlassCard>
              )}
            </motion.div>
          )}

          {/* LEADERBOARD */}
          {room.game_state === GAME_STATES.LEADERBOARD && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full text-center space-y-8"
            >
              <CredentialBadge
                studentName={participant.name}
                score={participant.score}
                role="Arena Contender"
                arenaCode={code}
                tier={participant.score >= 2000 ? 'elite' : participant.score >= 1000 ? 'gold' : 'silver'}
              />
              {participant.streak_count > 0 && (
                <p className="text-orange-400 font-mono">🔥 Best streak: {participant.streak_count}x</p>
              )}
              <CyberButton variant="purple" onClick={() => router.push('/')}>
                RETURN TO BASE
              </CyberButton>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
