import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExclamationCircleIcon } from "@heroicons/react/24/solid";
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
    return v.trim().toLowerCase() === "1" || v.trim().toLowerCase() === "true";
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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6"
      style={{
        backgroundColor: "#F8FAFC",
        backgroundImage:
          "linear-gradient(rgba(248, 250, 252, 0.85), rgba(248, 250, 252, 0.85)), url('https://i.ibb.co/v46n1LRw/Fondo-4x.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
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
        className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-violet-200/20 blur-[120px]"
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
        className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-cyan-200/20 blur-[120px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/2 left-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-200/10 blur-[150px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-10 text-center">
          <motion.div
            whileHover={{ rotate: 12 }}
            className="group relative mb-8 inline-flex h-32 w-32 items-center justify-center overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-violet-600 shadow-2xl shadow-violet-500/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 opacity-0 transition-opacity group-hover:opacity-100" />
            <Logo
              variant="login"
              className="relative z-10 h-20 w-20 text-violet-600"
            />
          </motion.div>
          <h1 className="mb-3 font-display text-5xl font-bold tracking-tighter text-slate-900">
            {BRAND_CONFIG.name}
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Plataforma de Operaciones Académicas
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/75 p-10 shadow-2xl shadow-slate-200/60 backdrop-blur-2xl">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />

          <div className="relative z-10 space-y-6">
            {!googleClientIdPresent && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-medium text-amber-700">
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
                  className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-600"
                >
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-center">
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
              <div className="space-y-3 border-t border-slate-200/80 pt-6 mt-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
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
                    className="w-full rounded-2xl border border-white/70 bg-white/50 px-5 py-3.5 text-sm text-slate-900 shadow-inner backdrop-blur-md transition-all focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                  />
                  <button
                    type="submit"
                    disabled={localLoading || isLoading || !localEmail.trim()}
                    className="w-full rounded-xl bg-slate-800 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {localLoading ? "Entrando…" : "Entrar con correo (local)"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          © 2026 Corporación Unificada Nacional
        </p>
      </motion.div>
    </div>
  );
};
