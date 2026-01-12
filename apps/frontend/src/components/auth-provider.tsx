'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, createContext, useContext, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { queryKeys } from '@/hooks/use-api';

import type { AuthUser } from '@/lib/api';

interface AuthContextType {
  user: AuthUser | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  setupRequired: boolean | undefined;
  error: Error | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (token: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  // Check setup status on mount
  const { data: setupStatus } = useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: () => api.getSetupStatus(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  // Get current user info
  const {
    data: userData,
    error,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
    staleTime: 60000,
    retry: false,
    enabled: !setupStatus?.setupRequired, // Only fetch user if setup is complete
  });

  // Update user state when userData changes
  useEffect(() => {
    if (setupStatus?.setupRequired) {
      setUser(null);
    } else if (userData) {
      // Only set user if we have valid data (username is required)
      if (userData.username) {
        setUser({
          username: userData.username,
          createdAt: userData.createdAt ?? new Date().toISOString(),
        });
      } else {
        setUser(null);
      }
    }
  }, [userData, setupStatus]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login({ username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      queryClient.refetchQueries();
    },
  });

  // Setup mutation
  const setupMutation = useMutation({
    mutationFn: ({
      token,
      username,
      password,
    }: {
      token: string;
      username: string;
      password: string;
    }) => api.setup({ setupToken: token, username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      queryClient.refetchQueries();
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      setUser(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const setup = async (token: string, username: string, password: string) => {
    await setupMutation.mutateAsync({ token, username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const contextValue: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user && !setupStatus?.setupRequired,
    setupRequired: setupStatus?.setupRequired,
    error: error as Error | null,
    login,
    setup,
    logout,
  };

  return <AuthContext value={contextValue}>{children}</AuthContext>;
}
