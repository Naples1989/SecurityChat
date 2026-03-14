import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const RegisterPage = () => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ phone, name, username });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Errore durante la registrazione');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Registrati a SecurityChat</h1>
          <p className="text-gray-500 mt-2">Crea il tuo profilo sicuro</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-telegram-blue focus:border-telegram-blue outline-none transition-all"
              placeholder="Mario Rossi"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username (opzionale)
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:ring-telegram-blue focus:border-telegram-blue outline-none transition-all"
              placeholder="@mario"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full bg-telegram-blue text-white py-3 rounded-xl font-semibold hover:bg-telegram-darkBlue transition-colors"
          >
            REGISTRATI
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Hai già un account?{' '}
            <Link to="/login" className="text-telegram-blue font-semibold hover:underline">
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
