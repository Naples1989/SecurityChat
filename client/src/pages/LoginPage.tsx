import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import api from '../api/axios';

const LoginPage = () => {
  const [phone, setPhone] = useState('');
  const [passcode, setPasscode] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedPasscode = localStorage.getItem('app_passcode');
    if (savedPasscode) {
      setIsLocked(true);
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPasscode = localStorage.getItem('app_passcode');
    if (passcode === savedPasscode) {
      setIsLocked(false);
      setPasscode('');
    } else {
      setError('Codice errato');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response: any = await api.post('/auth/login', { 
        phone, 
        twoFactorPassword: requires2FA ? twoFAPassword : undefined 
      });

      if (response.data.requires2FA) {
        setRequires2FA(true);
        setError('');
        return;
      }

      localStorage.setItem('token', response.data.token);
      window.location.href = '/'; // Reload to update auth context
    } catch (err: any) {
      setError(err.response?.data?.message || 'Errore durante il login');
    }
  };

  if (isLocked) {
    // ... (keep existing unlock UI)
    return (
      <div className="min-h-screen flex items-center justify-center bg-telegram-blue px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <Lock className="w-16 h-16 mx-auto mb-4 text-telegram-blue" />
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Inserisci il codice</h1>
          <form onSubmit={handleUnlock} className="space-y-6">
            <input
              type="password"
              maxLength={4}
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="block w-full text-center text-3xl tracking-[1em] px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-telegram-blue focus:border-telegram-blue outline-none"
              placeholder="****"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-telegram-blue text-white py-3 rounded-xl font-semibold hover:bg-telegram-darkBlue transition-colors"
            >
              SBLOCCA
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">
            {requires2FA ? 'Verifica in due passaggi' : 'Accedi a SecurityChat'}
          </h1>
          <p className="text-gray-500 mt-2">
            {requires2FA ? 'Inserisci la tua password aggiuntiva' : 'Inserisci il tuo numero di telefono'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!requires2FA ? (
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Numero di telefono
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-telegram-blue focus:border-telegram-blue outline-none transition-all"
                placeholder="+39 123 456 7890"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="twoFA" className="block text-sm font-medium text-gray-700">
                Password 2FA
              </label>
              <input
                id="twoFA"
                type="password"
                required
                value={twoFAPassword}
                onChange={(e) => setTwoFAPassword(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-telegram-blue focus:border-telegram-blue outline-none transition-all"
                placeholder="Password"
                autoFocus
              />
            </div>
          )}

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full bg-telegram-blue text-white py-3 rounded-xl font-semibold hover:bg-telegram-darkBlue transition-colors"
          >
            {requires2FA ? 'ACCEDI' : 'AVANTI'}
          </button>
          
          {requires2FA && (
            <button 
              type="button" 
              onClick={() => setRequires2FA(false)}
              className="w-full text-sm text-slate-500 hover:underline"
            >
              Usa un altro numero
            </button>
          )}
        </form>
        
        {!requires2FA && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Non hai un account?{' '}
              <Link to="/register" className="text-telegram-blue font-semibold hover:underline">
                Registrati
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
