import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import { generateKeyPair } from '../utils/crypto';

interface User {
  id: string;
  phone: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  publicKey?: string;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  allowScreenshots?: boolean;
  twoFactorEnabled?: boolean;
  accountSelfDestructMonths?: number;
  lastSeen?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string) => Promise<void>;
  register: (data: { phone: string, name: string, username?: string, publicKey?: string }) => Promise<void>;
  logout: () => void;
  getPrivateKey: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await api.get('/auth/me');
          setUser(response.data);
        } catch (error) {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    fetchUser();
  }, []);

  const login = async (phone: string) => {
    const response = await api.post('/auth/login', { phone });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
    
    // In a real app, we'd handle private key more securely (e.g., prompt for password to decrypt stored key)
    // For now, we generate if not present, but usually we need the old one.
  };

  const register = async (data: { phone: string, name: string, username?: string }) => {
    const keys = await generateKeyPair();
    localStorage.setItem(`privateKey_${data.phone}`, keys.privateKey);
    
    const response = await api.post('/auth/register', { ...data, publicKey: keys.publicKey });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const getPrivateKey = () => {
    if (!user) return null;
    return localStorage.getItem(`privateKey_${user.phone}`);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, getPrivateKey }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
