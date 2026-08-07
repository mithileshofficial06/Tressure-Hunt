"use client";

import { useEffect, useRef, useState } from "react";
// The game's own stylesheets. Imported statically rather than inside the effect
// so Next bundles them with this chunk — a dynamic import() of CSS resolves
// after first paint and the board renders unstyled for a frame.
import "../../../game_src/style.css";
import "../../../game_src/landing.css";
import { dashboardUrl } from "@/lib/links";

interface SubmitResult {
  solved?: boolean;
  roundComplete?: boolean;
  solvedLevels?: number[];
  totalLevels?: number;
  levelId?: number;
  error?: string;
  reason?: string;
}

/**
 * The Octavius Circuit game, mounted in React.
 *
 * The game itself is vanilla JS under `game_src/` — a canvas, a board model and
 * a solver, written against the DOM rather than React. It is imported rather
 * than rewritten: it works, and porting nine files to React would change
 * nothing a player can see.
 *
 * WHY ALL THIS MARKUP IS HERE. The game does not build its own UI. It looks up
 * twenty elements by id — the voltage HUD, both inventory panels, the four
 * action buttons, the win overlay — and wires listeners to them at init. It
 * came from a standalone page whose index.html supplied that scaffold; render
 * only `#board-container` and `initMain()` throws on the first missing element
 * and the player sees nothing but an error.
 *
 * THE IDS ARE LOAD-BEARING. Renaming one breaks the game silently, because the
 * lookups are strings.
 *
 * WHAT IS DELIBERATELY NOT HERE. The original's landing page — a full-screen
 * video with a PLAY button — and the decorative background/logo videos. The
 * dashboard is already the way in, so a second entry screen is one click to
 * nowhere, and the media it referenced (`animation.mp4`, `logo.mp4`,
 * `background.mp4`) was never part of the source repo.
 */
export default function CircuitGame({
  teamNumber,
  startIndex,
  initialSolved,
  totalLevels,
}: {
  teamNumber: number;
  startIndex: number;
  initialSolved: number[];
  totalLevels: number;
}) {
  const startedRef = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [solved, setSolved] = useState<number[]>(initialSolved);
  const [roundComplete, setRoundComplete] = useState(
    initialSolved.length >= totalLevels && totalLevels > 0
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // StrictMode mounts effects twice in development. Without this the game
    // initialises twice and every pointerdown is handled twice.
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const main = await import("../../../game_src/main.js");
        if (cancelled) return;

        (
          main as {
            initMain?: (o: {
              teamNumber: number;
              startIndex: number;
              onProgress: (r: SubmitResult) => void;
            }) => void;
          }
        ).initMain?.({
          teamNumber,
          startIndex,
          onProgress: (result) => {
            if (cancelled) return;
            // The server decides. A win the server rejects must not light up
            // the counter, or a team walks away believing a level counted.
            if (result?.error) {
              setSaveError(result.error);
              return;
            }
            setSaveError(
              result?.solved === false
                ? "That board didn't verify on the server. Tell a coordinator."
                : null
            );
            if (result?.solvedLevels) setSolved(result.solvedLevels);
            if (result?.roundComplete) setRoundComplete(true);
          },
        });
      } catch (err) {
        console.error("[octavius] failed to start", err);
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamNumber, startIndex]);

  return (
    <>
      {/* ── Status strip ───────────────────────────────────────────────── */}
      <div className="oc-strip">
        <a href={dashboardUrl()} className="oc-strip__back">
          ← Back to the hunt board
        </a>
        <span className="oc-strip__team">TEAM {teamNumber}</span>
        <span className="oc-strip__count">
          {solved.length} / {totalLevels} levels cleared
        </span>
      </div>

      {roundComplete && (
        <div className="oc-banner oc-banner--good">
          All five circuits complete — the round is marked done on your hunt board.{" "}
          <a href={dashboardUrl()}>Return to the board →</a>
        </div>
      )}

      {saveError && <div className="oc-banner oc-banner--bad">{saveError}</div>}

      {failed && (
        <div className="oc-banner oc-banner--bad">
          The circuit board could not be loaded. Refresh the page — if it keeps
          happening, tell a coordinator rather than burning time on it.
          <span className="oc-banner__detail">{failed}</span>
        </div>
      )}

      <div id="app-container">
        <canvas id="bg-canvas" />
        <div id="scanline-overlay" />
        <div id="vignette-overlay" />

        <div id="game-wrapper">
          <header id="hud-bar">
            <div id="hud-puzzle-name">
              <span className="hud-label-small">PUZZLE</span>
              <div id="level-display-text" className="level-title-text">
                Level 1
              </div>
            </div>

            <div id="hud-voltage-section">
              <div id="hud-actual">
                <span className="hud-label">ACTUAL VOLTAGE</span>
                <span id="actual-voltage-value" className="voltage-number">
                  0
                </span>
              </div>

              <div id="hud-bar-center">
                <div id="voltage-bar-track">
                  <div id="voltage-bar-seg-1" className="voltage-seg" />
                  <div id="voltage-bar-seg-2" className="voltage-seg" />
                  <div id="voltage-bar-seg-3" className="voltage-seg" />
                </div>
                <div id="voltage-status" className="status-hidden">
                  <span id="voltage-status-text" />
                </div>
                <div id="modifier-tracker" />
              </div>

              <div id="hud-target">
                <span id="target-voltage-value" className="voltage-number">
                  0
                </span>
                <span className="hud-label">TARGET VOLTAGE</span>
              </div>
            </div>
          </header>

          <main id="game-area">
            <aside id="inventory-left" className="inventory-panel">
              <div className="inventory-title">INVENTORY</div>
              <div id="inv-left-items" className="inventory-items" />
            </aside>

            <div id="board-container">
              <canvas id="board-canvas" />
              <div id="board-hit-layer" />
            </div>

            <aside id="inventory-right" className="inventory-panel">
              <div className="inventory-title">MODIFIERS</div>
              <div id="inv-right-items" className="inventory-items" />
            </aside>
          </main>

          <footer id="action-bar">
            <button className="action-btn" id="btn-rotate" data-action="rotate">
              <span className="btn-icon">↻</span>
              <span className="btn-label">ROTATE</span>
            </button>
            <button className="action-btn" id="btn-reset" data-action="reset">
              <span className="btn-icon">⟳</span>
              <span className="btn-label">RESET CIRCUIT</span>
            </button>
            <button className="action-btn action-btn--select" id="btn-select" data-action="select">
              <span className="btn-icon">●</span>
              <span className="btn-label">SELECT</span>
            </button>
            <button className="action-btn action-btn--remove" id="btn-remove" data-action="remove">
              <span className="btn-icon">✕</span>
              <span className="btn-label">REMOVE</span>
            </button>
          </footer>
        </div>

        <div id="win-overlay" className="hidden">
          <div id="win-card">
            <div id="win-particles" />
            <div className="win-spider-icon">🕷️</div>
            <h1 className="win-title">CIRCUIT COMPLETE!</h1>
            <p className="win-subtitle">
              Voltage Matched — <span id="win-voltage" />
            </p>
            <button id="btn-play-again" className="win-btn">
              PLAY AGAIN
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
