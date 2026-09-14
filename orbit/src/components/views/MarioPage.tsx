import { useCallback, useEffect, useRef, useState } from "react";
import "./MarioPage.css";

type MarioPageProps = { onExit: () => void };

export default function MarioPage({ onExit }: MarioPageProps) {
  const containerRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault();
        onExit();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow && event.data === "orbit-mario-exit") onExit();
    };
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [onExit]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  }, []);

  return (
    <section ref={containerRef} className="mario-page" aria-label="Mario Easter Egg">
      <header className="mario-toolbar">
        <span className="mario-title">MARIO.JS</span>
        <div className="mario-actions">
          <button type="button" onClick={() => void toggleFullscreen()}>{isFullscreen ? "WINDOWED" : "FULLSCREEN"}</button>
          <button type="button" onClick={onExit}>ESC / EXIT</button>
        </div>
      </header>
      <div className="mario-stage">
        {!ready && <div className="mario-loader">LOADING WORLD 1-1...</div>}
        <iframe
          ref={iframeRef}
          className={ready ? "mario-frame mario-frame--ready" : "mario-frame"}
          src="/easter-eggs/mario/index.html"
          title="Mario.js"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => setReady(true)}
        />
      </div>
      <footer className="mario-help">ARROWS = MOVE &nbsp;·&nbsp; X = JUMP &nbsp;·&nbsp; Z = RUN / FIRE</footer>
    </section>
  );
}
