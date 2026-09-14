import { useCallback, useEffect, useRef, useState } from "react";
import "./DoomPage.css";

type DoomPageProps = {
  onExit: () => void;
};

export default function DoomPage({ onExit }: DoomPageProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [minimumIntroElapsed, setMinimumIntroElapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumIntroElapsed(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement) return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== containerRef.current?.querySelector("iframe")?.contentWindow) return;
      if (event.data === "orbit-doom-exit") onExit();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onExit]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current?.requestFullscreen();
    }
  }, []);

  const showGame = iframeReady && minimumIntroElapsed;

  return (
    <section ref={containerRef} className="doom-page" aria-label="DOOM Easter Egg">
      <header className="doom-toolbar">
        <span className="doom-title">DOOM</span>
        <div className="doom-actions">
          <button type="button" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? "WINDOWED" : "FULLSCREEN"}
          </button>
          <button type="button" onClick={onExit}>ESC / EXIT</button>
        </div>
      </header>

      <div className="doom-stage">
        <iframe
          className={showGame ? "doom-frame doom-frame--ready" : "doom-frame"}
          src="/easter-eggs/doom/index.html"
          title="DOOM WebAssembly"
          sandbox="allow-scripts allow-pointer-lock"
          allow="fullscreen"
          referrerPolicy="no-referrer"
          onLoad={() => setIframeReady(true)}
        />
        {!showGame && (
          <div className="doom-loader" role="status" aria-live="polite">
            <p>&gt; SECRET COMMAND DETECTED</p>
            <p>&gt; INITIALIZING LEGACY SYSTEM...</p>
            <p>&gt; LOADING DOOM.WASM</p>
            <div className="doom-progress"><span /></div>
            <p>&gt; DOOM MODE ENABLED</p>
          </div>
        )}
      </div>

      <footer className="doom-help">
        ARROWS = MOVE / TURN &nbsp;·&nbsp; SPACE = USE / OPEN &nbsp;·&nbsp; CTRL = FIRE &nbsp;·&nbsp; ALT = STRAFE
      </footer>
    </section>
  );
}
