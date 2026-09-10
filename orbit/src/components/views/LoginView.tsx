import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { GoogleLogin } from "@react-oauth/google";
import { BRAND_CONFIG } from "@/src/config/brand";
import { Logo } from "../common/Logo";
import { cn } from "@/src/lib/utils";
import { ThemeToggle } from "../layout/ThemeToggle";
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

  const [showLocalEmailLogin, setShowLocalEmailLogin] = useState(
    () => import.meta.env.DEV || window.location.hash === "#admin"
  );

  React.useEffect(() => {
    const syncLocalEmailLoginVisibility = () => {
      setShowLocalEmailLogin(
        import.meta.env.DEV || window.location.hash === "#admin"
      );
    };

    window.addEventListener("hashchange", syncLocalEmailLoginVisibility);
    return () => {
      window.removeEventListener("hashchange", syncLocalEmailLoginVisibility);
    };
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
        backgroundColor: "var(--orbit-login-bg)",
        backgroundImage:
          "linear-gradient(var(--orbit-login-veil), var(--orbit-login-veil)), url('https://i.ibb.co/v46n1LRw/Fondo-4x.png')",
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
        className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-violet-200/20 dark:bg-violet-500/20 blur-[120px]"
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
        className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-cyan-200/20 dark:bg-cyan-500/18 blur-[120px]"
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
        className="absolute top-1/2 left-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-200/10 dark:bg-fuchsia-500/12 blur-[150px]"
      />

      <ThemeToggle className="absolute right-6 top-6 z-20 bg-white/70 dark:bg-orbit-surface/70 backdrop-blur" />

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
              className="relative z-10 h-20 w-20 text-violet-600 dark:text-violet-300"
            />
          </motion.div>
          <h1 className="mb-3 font-display text-5xl font-bold tracking-tighter text-slate-900 dark:text-orbit-text">
            {BRAND_CONFIG.name}
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-orbit-text-secondary">
            Plataforma de Operaciones Académicas
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/75 shadow-slate-200/60 dark:border-orbit-border dark:bg-orbit-surface/85 dark:shadow-black/50 p-10 shadow-2xl backdrop-blur-2xl">
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />

          <div className="relative z-10 space-y-6">
            {!googleClientIdPresent && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-100 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/12 p-3 text-xs font-medium text-amber-700 dark:text-amber-300">
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
                  className="flex items-center gap-2 rounded-xl border border-rose-100 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/12 p-3 text-xs font-medium text-rose-600 dark:text-rose-300"
                >
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-center">
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-600 dark:border-t-violet-400" />
              ) : (
                // Google paints its own opaque surface inside a cross-origin
                // iframe we cannot style, and its container adds 2px/10px of
                // padding around the pill. Clipping to the pill radius hides
                // that pale frame without altering Google's button.
                <div
                  className={cn(
                    "overflow-hidden rounded-full leading-none",
                    !googleClientIdPresent && "pointer-events-none opacity-50"
                  )}
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
              <div className="space-y-3 border-t border-slate-200/80 dark:border-orbit-border pt-6 mt-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-orbit-muted">
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
                    className="w-full rounded-2xl border border-white/70 bg-white/50 text-slate-900 dark:border-orbit-border dark:bg-orbit-input/80 dark:text-orbit-text px-5 py-3.5 text-sm shadow-inner backdrop-blur-md transition-all focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
                  />
                  <button
                    type="submit"
                    disabled={localLoading || isLoading || !localEmail.trim()}
                    className="w-full rounded-xl bg-slate-800 text-white hover:bg-slate-900 dark:bg-orbit-elevated dark:text-orbit-text dark:hover:bg-orbit-interactive py-3 text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-40"
                  >
                    {localLoading ? "Entrando…" : "Entrar con correo (local)"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-orbit-muted">
          © 2026 Corporación Unificada Nacional
        </p>
      </motion.div>
    </div>
  );
};
