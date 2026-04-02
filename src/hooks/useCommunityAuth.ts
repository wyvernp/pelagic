import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';

interface CommunityAuthState {
  user: string | null;
  loading: boolean;
  error: string | null;
  email: string;
  password: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  signUp: () => Promise<boolean>;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
  isSignedIn: boolean;
}

export function useCommunityAuth(): CommunityAuthState {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const checkAuth = useCallback(async () => {
    try {
      const storedEmail = await invoke<string | null>('get_secure_setting', { key: 'community_email' });
      setUser(storedEmail || null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const signUp = useCallback(async (): Promise<boolean> => {
    if (!email || !password) return false;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<{ access_token: string; refresh_token: string; user: { email: string | null } }>(
        'community_sign_up', { email, password }
      );
      await invoke('set_secure_setting', { key: 'community_access_token', value: result.access_token });
      await invoke('set_secure_setting', { key: 'community_refresh_token', value: result.refresh_token });
      await invoke('set_secure_setting', { key: 'community_email', value: email });
      setUser(email);
      setPassword('');
      return true;
    } catch (err) {
      setError(String(err));
      logger.error('Community sign up failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!email || !password) return false;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<{ access_token: string; refresh_token: string; user: { email: string | null } }>(
        'community_sign_in', { email, password }
      );
      await invoke('set_secure_setting', { key: 'community_access_token', value: result.access_token });
      await invoke('set_secure_setting', { key: 'community_refresh_token', value: result.refresh_token });
      await invoke('set_secure_setting', { key: 'community_email', value: email });
      setUser(email);
      setPassword('');
      return true;
    } catch (err) {
      setError(String(err));
      logger.error('Community sign in failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  const signOut = useCallback(async () => {
    await invoke('set_secure_setting', { key: 'community_access_token', value: '' });
    await invoke('set_secure_setting', { key: 'community_refresh_token', value: '' });
    await invoke('set_secure_setting', { key: 'community_email', value: '' });
    setUser(null);
    setEmail('');
    setError(null);
  }, []);

  return {
    user,
    loading,
    error,
    email,
    password,
    setEmail,
    setPassword,
    signUp,
    signIn,
    signOut,
    checkAuth,
    isSignedIn: !!user,
  };
}
