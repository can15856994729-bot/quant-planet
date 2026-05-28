import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface QpUser {
  id: string;
  nickname: string;
  phone: string;
  avatar: string;        // emoji or url
  joinedAt: string;
  riskLevel: "保守" | "稳健" | "积极";
}

interface AuthState {
  user: QpUser | null;
  isLoggedIn: boolean;
  login: (user: QpUser) => void;
  logout: () => void;
  updateUser: (patch: Partial<QpUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      login: (user) => set({ user, isLoggedIn: true }),
      logout: () => set({ user: null, isLoggedIn: false }),
      updateUser: (patch) =>
        set((state) =>
          state.user ? { user: { ...state.user, ...patch } } : {}
        ),
    }),
    { name: "qp-auth" }
  )
);
