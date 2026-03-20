import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (payload: { token: string; user: AuthUser }) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: ({ token, user }) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'wangwang_auth' }
  )
);

