import { useEffect } from 'react';
import { create } from 'zustand';
import { avatarHandle, readStoredAvatar } from '../lib/profileAvatar';

type AvatarState = {
  byHandle: Record<string, string>;
  remember: (handle: string, uri: string) => void;
};

export const useProfileAvatarStore = create<AvatarState>((set) => ({
  byHandle: {},
  remember: (handle, uri) => {
    const key = avatarHandle(handle);
    set((state) => ({ byHandle: { ...state.byHandle, [key]: uri } }));
  },
}));

export function useOperatorAvatar(handle: string): string {
  const key = avatarHandle(handle);
  const uri = useProfileAvatarStore((state) => state.byHandle[key] ?? '');
  useEffect(() => {
    const stored = readStoredAvatar(handle);
    if (stored) useProfileAvatarStore.getState().remember(handle, stored);
  }, [handle]);
  return uri;
}
