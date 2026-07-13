import { createContext } from "react";

export type User = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isAdmin?: boolean;
};

export type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthCtx | null>(null);
