// web/app/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  jwt: string | null;
  user: User | null;
  setSession: (jwt: string | null, user: User | null) => void;
  clearSession: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [jwt, setJwt] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // To track initial session loading

  const setSession = (newJwt: string | null, newUser: User | null) => {
    setJwt(newJwt);
    setUser(newUser);
    setIsLoading(false); // Session is set, loading is complete
  };

  const clearSession = () => {
    setJwt(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ jwt, user, setSession, clearSession, isLoading, setIsLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
