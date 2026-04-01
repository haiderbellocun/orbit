import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EnvelopeIcon, LockClosedIcon, ExclamationCircleIcon, CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import { BRAND_CONFIG } from '@/src/config/brand';
import { Logo } from '../common/Logo';

interface LoginViewProps {
  onLogin: (email: string, id: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEmailValid = email.toLowerCase().endsWith('@cun.edu.co');
  const isPasswordValid = password.length >= 5; // Assuming ID is at least 5 digits

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Por favor ingresa tu correo institucional.');
      return;
    }

    if (!isEmailValid) {
      setError('El acceso está restringido a correos @cun.edu.co');
      return;
    }

    if (!password) {
      setError('Por favor ingresa tu cédula como contraseña.');
      return;
    }

    setIsLoading(true);
    
    // Simulate network delay for a more "premium" feel
    setTimeout(() => {
      onLogin(email, password);
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, -30, 0]
        }}
        transition={{ 
          duration: 10, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-200/20 rounded-full blur-[120px]"
      ></motion.div>
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          x: [0, -60, 0],
          y: [0, 40, 0]
        }}
        transition={{ 
          duration: 12, 
          repeat: Infinity, 
          ease: "easeInOut",
          delay: 1
        }}
        className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-200/20 rounded-full blur-[120px]"
      ></motion.div>
      <motion.div 
        animate={{ 
          scale: [1, 1.5, 1],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ 
          duration: 15, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-fuchsia-200/10 rounded-full blur-[150px]"
      ></motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <motion.div 
            whileHover={{ rotate: 12 }}
            className="inline-flex items-center justify-center w-32 h-32 rounded-[32px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-violet-600 shadow-2xl shadow-violet-500/20 mb-8 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Logo variant="login" className="h-20 w-20 relative z-10 text-violet-600" />
          </motion.div>
          <h1 className="text-5xl font-bold tracking-tighter text-slate-900 mb-3 font-display">Orbit</h1>
          <p className="text-slate-500 font-medium tracking-wide uppercase text-[10px] letter-spacing-widest">
            Plataforma de Operaciones Académicas
          </p>
        </div>

        <div className="glass-panel p-10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500"></div>
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Correo Institucional</label>
                {email && (
                  <span className={`text-[9px] font-bold uppercase tracking-tighter ${isEmailValid ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isEmailValid ? 'Dominio Válido' : 'Solo @cun.edu.co'}
                  </span>
                )}
              </div>
              <div className="relative group">
                <EnvelopeIcon className={`absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 transition-colors duration-300 ${email ? (isEmailValid ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-400'}`} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@cun.edu.co"
                  className={`glass-input pl-12 ${email && !isEmailValid ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10' : ''}`}
                />
                {email && isEmailValid && (
                  <CheckCircleIcon className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Contraseña (Cédula)</label>
              <div className="relative group">
                <LockClosedIcon className={`absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 transition-colors duration-300 ${password ? 'text-violet-500' : 'text-slate-400'}`} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Número de identificación"
                  className="glass-input pl-12"
                />
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium"
                >
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={isLoading}
              className="glass-button-primary w-full py-4 text-sm font-bold tracking-widest uppercase flex items-center justify-center gap-3 group"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Acceder al Sistema</span>
                  <ArrowRightIcon className="h-4.5 w-4.5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-10 pt-8 border-t border-white/40 text-center relative z-10">
            <p className="text-xs text-slate-400 font-medium tracking-wide">
              ¿Problemas para acceder? <br />
              <a href="#" className="text-violet-600 font-bold hover:underline transition-all inline-flex items-center gap-1 mt-2">
                Contactar a Soporte Técnico
              </a>
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
          © 2026 Corporación Unificada Nacional
        </p>
      </motion.div>
    </div>
  );
};
