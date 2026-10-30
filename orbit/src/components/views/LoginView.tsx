import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExclamationCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/solid";
import { GoogleLogin } from "@react-oauth/google";
import { BRAND_CONFIG } from "@/src/config/brand";
import { Logo } from "../common/Logo";
import {
  loginWithGoogleIdToken,
  loginWithLocalEmail,
  type GoogleAuthResponse,
} from "@/src/lib/api";

interface LoginViewProps {
  onLogin: (auth: GoogleAuthResponse) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const googleClientIdPresent = useMemo(() => {
    const v = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
    return Boolean(v.trim());
  }, []);

  const showLocalEmailLogin = useMemo(() => {
    if (import.meta.env.DEV) return true;
    const v = (import.meta.env.VITE_ALLOW_LOCAL_EMAIL_LOGIN as string | undefined) ?? "";
    const enabled = v.trim().toLowerCase() === "1" || v.trim().toLowerCase() === "true";
    return enabled && window.location.hash.trim().toLowerCase() === "#admin";
  }, []);

  const [localEmail, setLocalEmail] = useState("");
  const [localLoading, setLocalLoading] = useState(false);

  async function handleLocalEmailSubmit(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    const trimmed = localEmail.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setError("Introduce un correo electrónico válido.");
      return;
    }
    setLocalLoading(true);
    setError(null);
    try {
      const auth = await loginWithLocalEmail(trimmed);
      localStorage.setItem("orbit_jwt", auth.token);
      localStorage.setItem("orbit_user", JSON.stringify(auth.user));
      onLogin(auth);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar sesión con ese correo."
      );
    } finally {
      setLocalLoading(false);
    }
  }

  async function handleGoogleCredential(credential: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const auth = await loginWithGoogleIdToken(credential);
      localStorage.setItem("orbit_jwt", auth.token);
      localStorage.setItem("orbit_user", JSON.stringify(auth.user));
      onLogin(auth);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autenticar con el servidor.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-10 text-white sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(124,58,237,0.2),transparent_32%),radial-gradient(circle_at_88%_82%,rgba(6,182,212,0.13),transparent_34%),linear-gradient(145deg,#070b14_0%,#0b1120_58%,#080b12_100%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-[-14%] left-[-8%] h-[38rem] w-[38rem] rounded-full bg-violet-600/15 blur-[140px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          x: [0, -60, 0],
          y: [0, 40, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-[-20%] right-[-8%] h-[34rem] w-[34rem] rounded-full bg-cyan-500/10 blur-[140px]"
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_32px_100px_rgba(0,0,0,.45)] backdrop-blur-xl lg:grid-cols-[1.08fr_.92fr]"
      >
        <div className="relative hidden min-h-[620px] overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 top-20 h-80 w-80 rounded-full border border-violet-400/20" />
          <div className="absolute -right-20 top-32 h-56 w-56 rounded-full border border-cyan-300/15" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/20">
              <Logo variant="login" className="h-7 w-7" />
            </div>
            <span className="font-display text-xl font-semibold tracking-tight">{BRAND_CONFIG.name}</span>
          </div>
          <div className="relative max-w-md">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">Operaciones académicas</p>
            <h1 className="font-display text-5xl font-semibold leading-[1.06] tracking-[-0.04em] text-white">
              Todo tu ecosistema académico, en una sola órbita.
            </h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-slate-400">
              Gestiona personas, carga académica y vacantes desde un espacio seguro y centralizado.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheckIcon className="h-4 w-4 text-emerald-400" />
            Acceso protegido para colaboradores autorizados
          </div>
        </div>

        <div className="flex min-h-[560px] flex-col justify-center bg-white/[0.035] p-7 sm:p-12 lg:min-h-[620px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500 text-white">
              <Logo variant="login" className="h-7 w-7" />
            </div>
            <span className="font-display text-xl font-semibold">{BRAND_CONFIG.name}</span>
          </div>
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8">
              <p className="mb-2 text-sm font-medium text-violet-300">Bienvenido de nuevo</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white">Inicia sesión</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Usa tu cuenta institucional para continuar.</p>
            </div>
            <div className="space-y-5">
            {!googleClientIdPresent && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs font-medium text-amber-200">
                <ExclamationCircleIcon className="h-3.5 w-3.5" />
                <span>
                  Falta configurar <code>VITE_GOOGLE_CLIENT_ID</code> en el frontend.
                </span>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs font-medium text-rose-200"
                >
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex min-h-11 items-center justify-center overflow-hidden rounded-full bg-white">
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-600" />
              ) : (
                <div
                  className={
                    googleClientIdPresent ? "" : "pointer-events-none opacity-50"
                  }
                >
                  <GoogleLogin
                    onSuccess={(cred) => {
                      const token =
                        typeof cred.credential === "string" ? cred.credential : "";
                      if (!token) {
                        setError("Google no devolvió el token de inicio de sesión.");
                        return;
                      }
                      void handleGoogleCredential(token);
                    }}
                    onError={() => {
                      setError(
                        "No se pudo iniciar sesión con Google. Intenta de nuevo."
                      );
                    }}
                    useOneTap={false}
                    theme="filled_blue"
                    text="signin_with"
                    shape="pill"
                    size="large"
                    width="320"
                    ux_mode="popup"
                  />
                </div>
              )}
            </div>

            {showLocalEmailLogin && (
              <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Desarrollo local
                </p>
                <form
                  onSubmit={(e) => void handleLocalEmailSubmit(e)}
                  className="space-y-3"
                >
                  <input
                    type="email"
                    autoComplete="username"
                    placeholder="correo@dominio.com"
                    value={localEmail}
                    onChange={(e) => setLocalEmail(e.target.value)}
                    disabled={localLoading || isLoading}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/10"
                  />
                  <button
                    type="submit"
                    disabled={localLoading || isLoading || !localEmail.trim()}
                    className="w-full rounded-xl bg-violet-600 py-3.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {localLoading ? "Entrando…" : "Entrar con correo (local)"}
                  </button>
                </form>
              </div>
            )}
            <p className="mt-8 text-center text-[11px] text-slate-600">© 2026 Corporación Unificada Nacional</p>
          </div>
        </div>
        </div>
      </motion.div>
    </div>
  );
};
