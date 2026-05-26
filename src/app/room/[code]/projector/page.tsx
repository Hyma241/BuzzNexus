'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Room, Participant, Question, Buzz, Response } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Radio, Users, Zap, ShieldCheck, CheckCircle, XCircle, Timer, Trophy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { playCyberSound } from '@/lib/sounds';
import { GAME_STATES, shouldRevealAnswers } from '@/lib/gameState';
import { sanitizeQuestionForDisplay } from '@/lib/questions';
import { useRoomChannel } from '@/lib/realtime/useRoomChannel';
import PdfProjectorMode from '@/components/PdfProjectorMode';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default function ProjectorMode({ params }: PageProps) {
  const { code } = React.use(params);
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [buzzes, setBuzzes] = useState<Buzz[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [buzzFlash, setBuzzFlash] = useState(false);
  const [correctFlash, setCorrectFlash] = useState(false);
  const [wrongFlash, setWrongFlash] = useState(false);

  // PDF Projector state
  const [pdfModeActive, setPdfModeActive] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfTitle, setPdfTitle] = useState('');

  const roomRef = useRef<Room | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const fetchQuestion = useCallback(async (qId: string, gameState: string) => {
    const { data } = await supabase.from('questions').select('*').eq('id', qId).single();
    if (!data) return;
    const q = data as Question;
    setCurrentQuestion(
      shouldRevealAnswers(gameState) ? q : sanitizeQuestionForDisplay(q, gameState)
    );
  }, []);

  const fetchParticipants = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('participants').select('*').eq('room_id', roomId)
      .order('score', { ascending: false });
    if (data) setParticipants(data as Participant[]);
  }, []);

  const fetchBuzzes = useCallback(async (roomId: string, questionId: string) => {
    const { data } = await supabase
      .from('buzzes').select('*, participants(*)').eq('room_id', roomId)
      .eq('question_id', questionId).order('buzz_time', { ascending: true });
    if (data) setBuzzes(data as Buzz[]);
  }, []);

  const fetchResponses = useCallback(async (questionId: string) => {
    const { data } = await supabase.from('responses').select('*').eq('question_id', questionId);
    if (data) setResponses(data as Response[]);
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const { data: roomData } = await supabase
        .from('rooms').select('*').eq('code', code).maybeSingle();

      if (roomData) {
        setRoom(roomData as Room);
        roomRef.current = roomData as Room;
        await fetchParticipants(roomData.id);
        if (roomData.current_question_id) {
          await Promise.all([
            fetchQuestion(roomData.current_question_id, roomData.game_state),
            fetchBuzzes(roomData.id, roomData.current_question_id),
            fetchResponses(roomData.current_question_id),
          ]);
        }
      }
      setLoading(false);
    };
    init();
  }, [code, fetchQuestion, fetchParticipants, fetchBuzzes, fetchResponses]);

  const handleRoomRealtime = useCallback(
    async (newRoom: Room, oldRoom: Room | null) => {
      setRoom(newRoom);
      roomRef.current = newRoom;

      if (newRoom.current_question_id !== oldRoom?.current_question_id) {
        setBuzzes([]);
        setResponses([]);
        if (newRoom.current_question_id) {
          await fetchQuestion(newRoom.current_question_id, newRoom.game_state);
        } else {
          setCurrentQuestion(null);
        }
      } else if (newRoom.game_state !== oldRoom?.game_state && newRoom.current_question_id) {
        await fetchQuestion(newRoom.current_question_id, newRoom.game_state);
      }

      if (newRoom.game_state !== oldRoom?.game_state) {
        if (newRoom.game_state === GAME_STATES.QUESTION_ACTIVE) playCyberSound('transition');
        if (newRoom.game_state === GAME_STATES.QUESTION_RESULTS) playCyberSound('correct');
        if (newRoom.game_state === GAME_STATES.LEADERBOARD) {
          playCyberSound('transition');
          await fetchParticipants(newRoom.id);
        }
      }

      if (
        newRoom.locked_participant_id &&
        newRoom.locked_participant_id !== oldRoom?.locked_participant_id
      ) {
        playCyberSound('lock');
        setBuzzFlash(true);
        setTimeout(() => setBuzzFlash(false), 600);
      }
    },
    [fetchQuestion, fetchParticipants]
  );

  const { setRoomSnapshot } = useRoomChannel({
    roomId: room?.id ?? null,
    channelPrefix: 'projector',
    onRoomUpdate: handleRoomRealtime,
    enabled: Boolean(room),
  });

  useEffect(() => {
    if (room) setRoomSnapshot(room);
  }, [room, setRoomSnapshot]);

  // Sync PDF state from room record on every room update
  useEffect(() => {
    if (!room) return;
    const r = room as Room & {
      pdf_mode_active?: boolean;
      pdf_pages?: string[];
      pdf_current_page?: number;
      pdf_total_pages?: number;
      pdf_title?: string;
    };
    setPdfModeActive(!!r.pdf_mode_active);
    if (r.pdf_mode_active) {
      setPdfPages(r.pdf_pages || []);
      setPdfCurrentPage(r.pdf_current_page || 1);
      setPdfTotalPages(r.pdf_total_pages || 0);
      setPdfTitle(r.pdf_title || '');
    }
  }, [room]);

  useEffect(() => {
    if (!room) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`projector-extra-${room.id}-v3`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${room.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' && roomRef.current?.game_state === GAME_STATES.QUESTION_RESULTS) {
            const newP = payload.new as Participant;
            const oldP = participantsRef.current.find((p) => p.id === newP.id);
            if (oldP && newP.score > oldP.score) {
              setCorrectFlash(true);
              setTimeout(() => setCorrectFlash(false), 1200);
              playCyberSound('correct');
            } else if (oldP && newP.score < oldP.score) {
              setWrongFlash(true);
              setTimeout(() => setWrongFlash(false), 1200);
              playCyberSound('wrong');
            }
          }
          fetchParticipants(room.id);
        }
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
        async () => {
          if (roomRef.current?.current_question_id) {
            await fetchResponses(roomRef.current.current_question_id);
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
  }, [room?.id, fetchParticipants, fetchBuzzes, fetchResponses]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room || room.game_state !== GAME_STATES.QUESTION_ACTIVE || !room.question_start_time) {
      setTimeRemaining(0);
      return;
    }
    const timeLimitMs = (room.timer_override || currentQuestion?.time_limit || 30) * 1000;
    const update = () => {
      const elapsed = Date.now() - new Date(room.question_start_time!).getTime();
      setTimeRemaining(Math.max(0, Math.ceil((timeLimitMs - elapsed) / 1000)));
    };
    update();
    timerRef.current = setInterval(update, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.game_state, room?.question_start_time, room?.current_question_id, currentQuestion]);

  const lockedParticipant = participants.find(p => p.id === room?.locked_participant_id);
  const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/room/${code}/join`;

  if (loading || !room) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-[#8B5CF6] font-mono text-xl animate-pulse">
        CONNECTING TO ARENA...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden font-sans select-none relative">
      {/* PDF Projector Mode — full takeover */}
      {pdfModeActive && pdfPages.length > 0 && room && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <PdfProjectorMode
            roomCode={code}
            roomId={room.id}
            isMentor={false}
            initialPages={pdfPages}
            initialCurrentPage={pdfCurrentPage}
            initialTotalPages={pdfTotalPages}
            pdfTitle={pdfTitle}
          />
        </div>
      )}
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.12)_0%,rgba(0,0,0,1)_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)]" />

      {/* Flash Effects */}
      <AnimatePresence>
        {buzzFlash && (
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-yellow-400/20 z-50 pointer-events-none mix-blend-screen"
          />
        )}
        {correctFlash && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 bg-emerald-500/15 z-50 pointer-events-none"
          />
        )}
        {wrongFlash && (
          <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 bg-red-500/15 z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* TOP HUD */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-10 py-5 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-10 h-10 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-[#FF4DCA]/60 text-neutral-400 hover:text-[#FF4DCA] flex items-center justify-center transition-all"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ShieldCheck className="w-9 h-9 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          <div className="font-orbitron font-black text-2xl tracking-[0.2em] text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]">
            BUZZNEXUS ARENA
          </div>
        </div>

        <div className="flex items-center gap-6">
          {room.game_state !== 'waiting' && room.game_state !== 'leaderboard' && (
            <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-700 px-5 py-2.5 rounded-full">
              <Radio className="w-5 h-5 text-[#FF4DCA] animate-pulse" />
              <span className="font-mono text-lg font-bold text-white">LIVE</span>
            </div>
          )}
          <div className="flex items-center gap-3 bg-neutral-900/80 border border-neutral-700 px-5 py-2.5 rounded-full shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            <Users className="w-5 h-5 text-[#8B5CF6]" />
            <span className="font-mono text-lg font-bold">{participants.length} / {room.participant_limit}</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-20 flex flex-col items-center justify-center min-h-screen pt-20 pb-12 px-12">

        {/* ── WAITING STATE ── */}
        <AnimatePresence mode="wait">
          {(room.game_state === GAME_STATES.WAITING || room.game_state === GAME_STATES.LOBBY) && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="flex flex-col items-center justify-center space-y-14 w-full"
            >
              <h1 className="font-orbitron text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6] drop-shadow-[0_0_30px_rgba(255,77,202,0.5)] text-center animate-pulse leading-tight">
                JOIN THE ARENA
              </h1>
              <div className="flex gap-20 items-center">
                <motion.div
                  animate={{ boxShadow: ['0 0 30px rgba(255,255,255,0.1)', '0 0 60px rgba(255,255,255,0.3)', '0 0 30px rgba(255,255,255,0.1)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="p-6 bg-white rounded-2xl"
                >
                  <QRCodeSVG value={inviteUrl} size={280} />
                </motion.div>
                <div className="space-y-5">
                  <div className="text-2xl font-mono text-neutral-400 uppercase tracking-widest">Access Code</div>
                  <div className="font-black font-orbitron text-[100px] leading-none text-white tracking-[0.15em] drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                    {code}
                  </div>
                  <div className="text-lg font-mono text-[#8B5CF6]">
                    {participants.length} contender{participants.length !== 1 ? 's' : ''} connected
                  </div>
                </div>
              </div>

              {/* Live joining participants */}
              {participants.length > 0 && (
                <div className="flex flex-wrap gap-3 justify-center max-w-4xl">
                  {participants.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-700 font-mono text-sm text-white"
                    >
                      <span className="text-[#FF4DCA] font-bold">#{(p.join_order || p.player_number).toString().padStart(2, '0')}</span> {p.name}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── QUESTION ACTIVE / BUZZ LOCKED / RESULTS ── */}
          {(room.game_state === GAME_STATES.QUESTION_ACTIVE ||
            room.game_state === GAME_STATES.BUZZ_LOCKED ||
            room.game_state === GAME_STATES.ANSWERING ||
            room.game_state === GAME_STATES.EVALUATION ||
            room.game_state === GAME_STATES.QUESTION_RESULTS) &&
            currentQuestion && (
            <motion.div
              key={`question-${currentQuestion.id}-${room.game_state}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.35 }}
              className="w-full flex gap-10 items-start max-w-[1600px]"
            >
              {/* Left: Question */}
              <div className="flex-1 flex flex-col justify-center space-y-8">
                {/* Header */}
                <div className="flex items-center gap-5">
                  <div className="text-2xl font-mono text-[#8B5CF6] uppercase tracking-widest flex items-center gap-3">
                    <Radio className="w-7 h-7 animate-pulse" />
                    TARGET ACQUIRED
                  </div>
                  {room.game_state === GAME_STATES.QUESTION_ACTIVE && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border font-mono font-bold text-xl ${
                      timeRemaining <= 5
                        ? 'bg-red-900/30 border-red-500/60 text-red-400 animate-pulse'
                        : 'bg-neutral-900/60 border-neutral-700 text-white'
                    }`}>
                      <Timer className="w-5 h-5" />
                      {timeRemaining}s
                    </div>
                  )}
                  {(room.game_state === GAME_STATES.BUZZ_LOCKED ||
                    room.game_state === GAME_STATES.ANSWERING ||
                    room.game_state === GAME_STATES.EVALUATION) &&
                    lockedParticipant && (
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-900/30 border border-yellow-500/60 text-yellow-400 font-mono font-bold text-xl"
                    >
                      <Zap className="w-5 h-5" />
                      {lockedParticipant.name} ANSWERING
                    </motion.div>
                  )}
                </div>

                {/* Question Text */}
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ duration: 0.4 }}
                    className="font-orbitron font-bold text-5xl xl:text-6xl text-white leading-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                  >
                    {currentQuestion.question_text}
                  </motion.h2>
                </AnimatePresence>

                {/* MCQ Options */}
                {currentQuestion.question_type === 'mcq' && currentQuestion.options.length > 0 && (
                  shouldRevealAnswers(room.game_state) ? (
                    <div className="grid grid-cols-2 gap-4">
                      {currentQuestion.options.map((opt, i) => {
                        const isCorrect = opt === currentQuestion.correct_answer;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`p-5 rounded-xl border-2 flex items-center gap-3 font-mono text-xl ${
                              isCorrect
                                ? 'border-emerald-400 bg-emerald-900/40 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                                : 'border-neutral-700 bg-neutral-900/40 text-neutral-400'
                            }`}
                          >
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-800 font-bold text-base">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && (
                              <CheckCircle className="w-6 h-6 text-emerald-400" />
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {currentQuestion.options.map((opt, i) => (
                        <div key={i} className="p-5 rounded-xl border border-neutral-700 bg-neutral-900/30 flex items-center gap-3 font-mono text-xl text-neutral-300">
                          <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-800 font-bold text-base">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{opt}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Answer reveal for non-MCQ */}
                {shouldRevealAnswers(room.game_state) && currentQuestion.question_type !== 'mcq' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-7 rounded-xl bg-emerald-900/30 border-2 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.2)]"
                  >
                    <div className="text-emerald-500 font-mono text-xl mb-2 uppercase tracking-widest">CORRECT ANSWER:</div>
                    <div className="text-4xl font-bold text-emerald-300 font-orbitron">{currentQuestion.correct_answer}</div>
                  </motion.div>
                )}
              </div>

              {/* Right: Buzzer Order */}
              <div className="w-[420px] shrink-0 border-l border-neutral-800 pl-10 flex flex-col justify-start space-y-6 pt-4">
                <h3 className="text-2xl font-orbitron font-bold text-[#FF4DCA] flex items-center gap-3">
                  <Zap className="w-7 h-7" /> BUZZER ORDER
                </h3>

                <div className="space-y-3">
                  <AnimatePresence>
                    {buzzes.length === 0 ? (
                      <div className="text-center p-10 border border-dashed border-neutral-800 rounded-xl text-neutral-500 font-mono text-lg animate-pulse">
                        WAITING FOR BUZZ...
                      </div>
                    ) : (
                      buzzes.slice(0, 8).map((buzz, i) => {
                        const isActive =
                          room.locked_participant_id === buzz.participant_id &&
                          (room.game_state === GAME_STATES.BUZZ_LOCKED ||
                            room.game_state === GAME_STATES.ANSWERING ||
                            room.game_state === GAME_STATES.EVALUATION);
                        const resp = responses.find(r => r.participant_id === buzz.participant_id);
                        return (
                          <motion.div
                            key={buzz.id}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`p-5 rounded-xl flex items-center justify-between border-2 transition-all ${
                              isActive
                                ? 'bg-yellow-900/40 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]'
                                : resp?.is_correct
                                  ? 'bg-emerald-900/20 border-emerald-700/50'
                                  : resp && !resp.is_correct
                                    ? 'bg-red-900/20 border-red-700/50'
                                    : 'bg-neutral-900/60 border-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xl ${
                                isActive ? 'bg-yellow-400 text-black' :
                                i === 0 ? 'bg-neutral-300 text-black' : 'bg-neutral-800 text-neutral-400'
                              }`}>
                                {i + 1}
                              </div>
                              <div className={`font-mono text-xl ${
                                isActive ? 'text-yellow-400 font-bold' :
                                resp?.is_correct ? 'text-emerald-400' :
                                resp && !resp.is_correct ? 'text-red-400' : 'text-neutral-300'
                              }`}>
                                {(buzz.participants as Participant | undefined)?.name || `P${i + 1}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {resp && shouldRevealAnswers(room.game_state) && (
                                resp.is_correct
                                  ? <CheckCircle className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                  : <XCircle className="w-7 h-7 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>

                {/* Mini leaderboard */}
                <div className="pt-4 border-t border-neutral-800">
                  <div className="text-sm font-mono text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" /> Top Scores
                  </div>
                  <div className="space-y-2">
                    {[...participants].sort((a, b) => b.score - a.score).slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 font-mono text-sm">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          i === 0 ? 'bg-yellow-500 text-black' : 'bg-neutral-800 text-neutral-400'
                        }`}>{i + 1}</span>
                        <span className="text-neutral-300 flex-1 truncate">{p.name}</span>
                        <span className="text-[#FF4DCA] font-bold">{p.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── LEADERBOARD STATE ── */}
          {room.game_state === GAME_STATES.LEADERBOARD && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col items-center"
            >
              <motion.h1
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="font-orbitron text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-[#FF4DCA] to-[#8B5CF6] mb-16 drop-shadow-[0_0_30px_rgba(255,77,202,0.6)]"
              >
                FINAL PODIUM
              </motion.h1>

              {/* Podium */}
              <div className="flex items-end justify-center gap-8">
                {(() => {
                  const sorted = [...participants].sort((a, b) => b.score - a.score).slice(0, 3);
                  // Reorder: 2nd, 1st, 3rd for visual podium
                  const podiumOrder = sorted.length >= 3
                    ? [sorted[1], sorted[0], sorted[2]]
                    : sorted.length === 2
                    ? [sorted[1], sorted[0]]
                    : sorted;
                  const heights = sorted.length >= 3 ? [240, 320, 180] : [240, 320];
                  const colors = [
                    'from-slate-300 to-slate-500',
                    'from-yellow-400 to-yellow-600',
                    'from-amber-600 to-amber-800',
                  ];
                  const ranks = sorted.length >= 3 ? [2, 1, 3] : [2, 1];

                  return podiumOrder.map((p, i) => {
                    if (!p) return null;
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ y: 400, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.3, type: 'spring', stiffness: 100 }}
                        className="flex flex-col items-center"
                      >
                        <div className="mb-3 text-center">
                          <div className="font-orbitron font-bold text-2xl text-white">{p.name}</div>
                          <div className="font-mono text-[#FF4DCA] text-xl font-bold mt-1">{p.score} pts</div>
                          {p.streak_count > 1 && (
                            <div className="text-orange-400 text-sm font-mono mt-1">🔥 {p.streak_count}x streak</div>
                          )}
                        </div>
                        <div
                          className={`w-36 rounded-t-xl bg-gradient-to-t ${colors[i]} shadow-[0_0_40px_rgba(255,255,255,0.15)] flex items-center justify-center relative`}
                          style={{ height: heights[i] }}
                        >
                          <span className="text-6xl font-black text-black/40 font-orbitron">{ranks[i]}</span>
                          {ranks[i] === 1 && (
                            <div className="absolute -top-8 text-4xl">👑</div>
                          )}
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>

              {/* Full list */}
              {participants.length > 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 }}
                  className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-4xl"
                >
                  {[...participants].sort((a, b) => b.score - a.score).slice(3).map((p, i) => (
                    <div key={p.id} className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400">
                          {i + 4}
                        </span>
                        <span className="font-mono text-white text-sm">{p.name}</span>
                      </div>
                      <span className="font-mono font-bold text-[#FF4DCA]">{p.score}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
