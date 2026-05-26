'use client';

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Room } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type RoomChangeHandler = (room: Room, previous: Room | null) => void;

type UseRoomChannelOptions = {
  roomId: string | null;
  channelPrefix: string;
  onRoomUpdate: RoomChangeHandler;
  enabled?: boolean;
  /** Refetch room row on subscribe + tab focus (recovers missed events) */
  resyncOnFocus?: boolean;
};

export function useRoomChannel({
  roomId,
  channelPrefix,
  onRoomUpdate,
  enabled = true,
  resyncOnFocus = true,
}: UseRoomChannelOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<Room | null>(null);
  const handlerRef = useRef(onRoomUpdate);

  useEffect(() => {
    handlerRef.current = onRoomUpdate;
  }, [onRoomUpdate]);

  const fetchRoom = useCallback(async (id: string) => {
    const { data } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    const previous = roomRef.current;
    const next = data as Room;
    roomRef.current = next;
    handlerRef.current(next, previous);
    return next;
  }, []);

  const setRoomSnapshot = useCallback((room: Room | null) => {
    roomRef.current = room;
  }, []);

  useEffect(() => {
    if (!enabled || !roomId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`${channelPrefix}-${roomId}-v4`, {
        config: { broadcast: { self: true } },
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const previous = roomRef.current;
          const next = payload.new as Room;
          roomRef.current = next;
          handlerRef.current(next, previous);
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await fetchRoom(roomId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          window.setTimeout(() => fetchRoom(roomId), 750);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, roomId, channelPrefix, fetchRoom]);

  useEffect(() => {
    if (!resyncOnFocus || !roomId || !enabled) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchRoom(roomId);
      }
    };
    const onOnline = () => fetchRoom(roomId);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchRoom(roomId);
    }, 10000);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
    };
  }, [resyncOnFocus, roomId, enabled, fetchRoom]);

  return { roomRef, fetchRoom, setRoomSnapshot };
}
