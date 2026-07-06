import React, { useState } from 'react';
import { motion } from 'motion/react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { isConfirmTextValid } from '@/src/lib/vacancyFormHelpers';

export interface ConfirmTextModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (confirmText: string) => void | Promise<void>;
}

export const ConfirmTextModal: React.FC<ConfirmTextModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  danger = true,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const [text, setText] = useState('');
  const valid = isConfirmTextValid(text);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={() => {
          if (!loading) onClose();
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative glass-panel p-6 max-w-md w-full shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-text-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2
            id="confirm-text-title"
            className="text-lg font-bold text-slate-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-800 disabled:opacity-40"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        <p className="text-xs text-slate-500 mb-2">
          Escriba <strong className="text-slate-800">CONFIRMAR</strong> para
          continuar:
        </p>
        <input
          type="text"
          className="glass-input py-2.5 text-sm w-full mb-5"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          disabled={loading}
          placeholder="CONFIRMAR"
        />
        <div className="flex gap-3">
          <button
            type="button"
            disabled={!valid || loading}
            onClick={() => void onConfirm(text.trim())}
            className={
              danger
                ? 'flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed'
                : 'flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40'
            }
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
          >
            Cancelar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
