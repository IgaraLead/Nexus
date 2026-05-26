import { create } from 'zustand';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

type RealtimeState = {
  lastDisconnectedAt?: number;
  status: RealtimeStatus;
  setDisconnected: () => void;
  setStatus: (status: RealtimeStatus) => void;
};

export const useRealtimeStore = create<RealtimeState>(set => ({
  lastDisconnectedAt: undefined,
  status: 'idle',
  setDisconnected: () => set({ lastDisconnectedAt: Date.now(), status: 'disconnected' }),
  setStatus: status => set({ status }),
}));
