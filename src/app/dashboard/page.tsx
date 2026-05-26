'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Plus, Users, LogOut, ArrowRight, Radio, Trash2,
  Monitor, Clock, CheckSquare, Square, ArrowLeft, HelpCircle
} from 'lucide-react';
import NeonBackground from '@/components/NeonBackground';
import GlassCard from '@/components/ui/GlassCard';
import CyberButton from '@/components/ui/CyberButton';
import QuizGenerator from '@/components/QuizGenerator';
import { deleteMentorRoom } from '@/lib/mentorDelete';
import { ensureMentorProfile } from '@/lib/ensureProfile';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<{ username?: string; full_name?: string } | null>(null);
  const [rooms, setRooms] = useState<Array<{
    id: string; code: string; game_state: string; participant_limit: number;
    created_at: string; status: string;
  }>>([]);

  const [limit, setLimit] = useState(50);
  const [negativeMarking, setNegativeMarking] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      setUser(session.user);

      await ensureMentorProfile({
        id: session.user.id,
        email: session.user.email,
        user_metadata: session.user.user_metadata,
      });

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(profileData);

      const { data: roomsData } = await supabase
        .from('rooms').select('*').eq('mentor_id', session.user.id)
        .order('created_at', { ascending: false });
      if (roomsData) setRooms(roomsData);

      setLoading(false);
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    setError('');

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const { data, error: insertError } = await supabase
        .from('rooms')
        .insert({
          code,
          mentor_id: user.id,
          participant_limit: limit,
          status: 'waiting',
          game_state: 'waiting',
          negative_marking_penalty: negativeMarking,
          marks_per_question: 500,
          negative_marking: negativeMarking > 0,
          fastest_bonus: true,
          streak_bonus: true,
          current_buzzer_index: 0,
          join_count: 0,
        })
        .select().single();

      if (insertError) {
        setError(insertError.message);
      } else if (data) {
        router.push(`/room/${code}`);
      }
    } catch {
      setError('Failed to create room. Please check your connection.');
    } finally {
      setCreating(false);
    }
  };

  const toggleRoomSelect = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const toggleSelectAllRooms = () => {
    if (selectedRoomIds.size === rooms.length) {
      setSelectedRoomIds(new Set());
    } else {
      setSelectedRoomIds(new Set(rooms.map((r) => r.id)));
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Terminate this arena? All participant data will be lost.')) return;
    setDeletingId(roomId);
    const { ok, error: deleteError } = await deleteMentorRoom(roomId);
    if (ok) {
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      setSelectedRoomIds((prev) => {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    } else {
      alert(deleteError || 'Failed to terminate arena.');
    }
    setDeletingId(null);
  };

  const handleBulkDeleteRooms = async () => {
    if (selectedRoomIds.size === 0) return;
    if (!confirm(`Delete ${selectedRoomIds.size} selected arena(s)? All data will be lost.`)) return;
    const ids = [...selectedRoomIds];
    setDeletingId('bulk');
    const failed: string[] = [];
    for (const id of ids) {
      const { ok, error: deleteError } = await deleteMentorRoom(id);
      if (!ok) failed.push(deleteError || id);
    }
    if (failed.length === 0) {
      setRooms((prev) => prev.filter((r) => !selectedRoomIds.has(r.id)));
      setSelectedRoomIds(new Set());
    } else {
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*')
        .eq('mentor_id', user?.id ?? '')
        .order('created_at', { ascending: false });
      if (roomsData) setRooms(roomsData);
      alert(
        failed.length === ids.length
          ? failed[0]
          : `Some arenas could not be deleted (${failed.length}/${ids.length}). List refreshed.`
      );
    }
    setDeletingId(null);
  };

  const gameStateLabel = (state: string) => {
    const map: Record<string, { label: string; color: string }> = {
      waiting: { label: 'WAITING', color: 'text-[#8B5CF6] border-[#8B5CF6]/30 bg-[#8B5CF6]/10' },
      question_active: { label: 'LIVE', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20' },
      buzz_locked: { label: 'BUZZING', color: 'text-yellow-400 border-yellow-500/30 bg-yellow-900/20' },
      question_results: { label: 'RESULTS', color: 'text-blue-400 border-blue-500/30 bg-blue-900/20' },
      leaderboard: { label: 'FINISHED', color: 'text-neutral-400 border-neutral-600 bg-neutral-900/40' },
    };
    return map[state] || { label: state.toUpperCase(), color: 'text-neutral-400 border-neutral-700 bg-neutral-900/30' };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050308]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full border-2 border-t-[#8B5CF6] border-neutral-800 animate-spin" />
          <div className="font-mono text-xs tracking-widest text-[#8B5CF6] animate-pulse">
            LOADING DASHBOARD...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col z-10 text-white font-sans pb-16">
      <NeonBackground />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between relative z-10 border-b border-neutral-800/50">
        <div
          className="flex items-center gap-2.5 cursor-pointer select-none"
          onClick={() => router.push('/')}
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-[#FF4DCA] to-[#8B5CF6] flex items-center justify-center font-bold text-black font-orbitron shadow-[0_0_12px_rgba(255,77,202,0.4)]">
            B
          </div>
          <h1 className="font-orbitron font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#FF4DCA] to-[#8B5CF6]">
            BUZZNEXUS
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right font-mono text-xs">
            <span className="text-neutral-500">OPERATOR: </span>
            <span className="text-[#FF4DCA] font-semibold">
              {profile?.username || user?.email?.split('@')[0]}
            </span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-950/60 border border-neutral-800 hover:border-neutral-600 text-xs font-mono transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> BACK
          </button>
          <button
            onClick={() => router.push('/help')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-950/60 border border-neutral-800 hover:border-[#8B5CF6]/60 hover:text-[#8B5CF6] text-xs font-mono transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5" /> HELP
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-950/60 border border-neutral-800 hover:border-red-500/50 hover:text-red-400 text-xs font-mono transition-all"
          >
            <LogOut className="w-3.5 h-3.5" /> DISCONNECT
          </button>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 mt-8">

        {/* Left: Create Room + Active Arenas */}
        <div className="lg:col-span-7 space-y-8">

          {/* Create Room */}
          <GlassCard glowColor="purple" hoverEffect subtitle="spawn realtime battle channel" title="INITIALIZE ARENA">
            <form onSubmit={handleCreateRoom} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/50 text-red-300 text-xs font-mono">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#8B5CF6] flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Participant Limit
                  </label>
                  <input
                    type="number" min="2" max="200" required
                    className="w-full bg-[#050308]/60 border border-neutral-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6] transition-colors"
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                  />
                  <p className="text-[10px] text-neutral-600 font-mono">2–200 participants</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-red-400 flex items-center gap-1.5">
                    Negative Penalty (pts)
                  </label>
                  <input
                    type="number" min="0" max="5000"
                    className="w-full bg-[#050308]/60 border border-neutral-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-red-700 transition-colors"
                    value={negativeMarking}
                    onChange={(e) => setNegativeMarking(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-[10px] text-neutral-600 font-mono">0 = no penalty</p>
                </div>
              </div>

              <CyberButton variant="pink" fullWidth type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-t-white border-black/30 animate-spin" />
                    SPAWNING ARENA...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    CREATE BATTLE ARENA
                  </>
                )}
              </CyberButton>
            </form>
          </GlassCard>

          {/* Active Arenas */}
          <GlassCard glowColor="none" title="YOUR ARENAS" subtitle={`${rooms.length} active channels`}>
            <div className="flex items-center gap-3 mb-4 flex-wrap justify-end -mt-1">
              {rooms.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllRooms}
                  className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 hover:text-[#FF4DCA] transition-colors"
                >
                  {selectedRoomIds.size === rooms.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[#FF4DCA]" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selectedRoomIds.size === rooms.length ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
              )}
            </div>

            {selectedRoomIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDeleteRooms}
                disabled={deletingId === 'bulk'}
                className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 text-xs font-mono font-bold hover:bg-red-950/50 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                DELETE {selectedRoomIds.size} SELECTED ARENA{selectedRoomIds.size > 1 ? 'S' : ''}
              </button>
            )}

            {rooms.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-neutral-800 rounded-xl">
                <Radio className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
                <p className="text-neutral-500 text-xs font-mono">No arenas created yet</p>
                <p className="text-neutral-600 text-[10px] font-mono mt-1">Create one above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rooms.map((room) => {
                  const stateInfo = gameStateLabel(room.game_state);
                  return (
                    <div
                      key={room.id}
                      className={`list-row-card p-4 rounded-xl group ${
                        selectedRoomIds.has(room.id) ? 'list-row-card-selected' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedRoomIds.has(room.id)}
                              onChange={() => toggleRoomSelect(room.id)}
                              className="sr-only"
                            />
                            {selectedRoomIds.has(room.id) ? (
                              <CheckSquare className="w-5 h-5 text-[#FF4DCA]" />
                            ) : (
                              <Square className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400" />
                            )}
                          </label>
                          <div className="text-center">
                            <div className="font-orbitron font-black text-2xl text-white tracking-widest">{room.code}</div>
                            <div className="text-[10px] text-neutral-600 font-mono">room code</div>
                          </div>
                          <div className="space-y-1.5">
                            <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${stateInfo.color}`}>
                              {stateInfo.label}
                            </span>
                            <div className="flex items-center gap-3 text-[10px] text-neutral-500 font-mono">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" /> {room.participant_limit} max
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(room.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => window.open(`/room/${room.code}/projector`, '_blank')}
                            title="Open Projector"
                            className="p-2 rounded-lg bg-indigo-900/30 hover:bg-indigo-900/60 text-indigo-400 transition-colors"
                          >
                            <Monitor className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/room/${room.code}`)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF4DCA]/10 border border-[#FF4DCA]/30 hover:bg-[#FF4DCA]/20 text-[#FF4DCA] text-xs font-mono font-bold transition-all"
                          >
                            ENTER <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            disabled={deletingId === room.id}
                            title="Delete Arena"
                            className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right: Quiz Generator */}
        <div className="lg:col-span-5">
          <GlassCard glowColor="pink" hoverEffect title="QUIZ GENERATOR" subtitle="AI-powered from your documents">
            <QuizGenerator mentorId={user?.id || ''} />
          </GlassCard>
        </div>

      </main>
    </div>
  );
}
