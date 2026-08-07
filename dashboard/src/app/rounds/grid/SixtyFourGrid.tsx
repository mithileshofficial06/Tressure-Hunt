"use client";

import { useState } from "react";
import {
  GRID_COLOURS,
  UNIVERSE_COUNT,
  isAnagram,
  lettersFor,
  normaliseAnswer,
  type GridCell,
} from "@/lib/hunt/grid";
import RoundFooter from "../RoundFooter";

/**
 * Contrast helpers for the grid cells.
 *
 * A single fixed ink colour cannot read against all eight swatches, and these
 * are letters a team has to read off a phone under a clock. Each swatch picks
 * whichever of the two design-system ink tones actually reads better against
 * it. Worst case across the eight is 5.07:1, comfortably over WCAG AA's 4.5:1.
 *
 * THESE CONSTANTS MUST TRACK globals.css. Get them wrong and the maths silently
 * optimises contrast against colours that are not the ones on screen.
 */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const INK = "#111111";
const CARD = "#ffffff";
const INK_LUM = relativeLuminance(INK);
const CARD_LUM = relativeLuminance(CARD);

function textToneFor(hex: string) {
  const lum = relativeLuminance(hex);
  return contrastRatio(lum, INK_LUM) >= contrastRatio(lum, CARD_LUM)
    ? { colour: INK, halo: "rgba(255,255,255,0.55)" }
    : { colour: CARD, halo: "rgba(17,17,17,0.55)" };
}

const CELL_TEXT_TONE = GRID_COLOURS.map(textToneFor);

interface UniverseCard {
  codename: string;
  designation: string;
  equations: Array<{ channel: "R" | "G" | "B"; text: string }>;
  // No `index` on purpose — see universeCard() in gridPuzzle.server.ts.
}

/** What the server hands back once the decode is proved. */
interface Revealed {
  index: number;
  colour: string;
}

const CHANNEL_COLOUR: Record<string, string> = {
  R: "#c1121f",
  G: "#0b7a45",
  B: "#3a56d4",
};

type Step = 1 | 2 | 3;

/**
 * The 64 Grid, in three steps.
 *
 *   1. IDENTIFY   — which universe is this team in? teamNumber mod 8.
 *   2. DECODE     — that universe's RGB cipher. Substitute n, enter all three
 *                   channels. Only an exact match reveals the colour.
 *   3. UNSCRAMBLE — the grid isolates that colour's eight cells; read the word.
 *
 * NOTHING IS PRINTED THAT THE TEAM IS MEANT TO WORK OUT. Step 1 states the rule
 * but never the substituted formula. Step 2 names `n` but never its value, and
 * the answer colour is not sent to this page until the decode is proved — so
 * there is nothing here to compare a guess against and the arithmetic has to
 * actually happen.
 *
 * The component never learns its own WORD. It reports what the player typed and
 * the server decides — see `gridPuzzle.server.ts`.
 */
export default function SixtyFourGrid({
  cells,
  teamNumber,
  alreadySolved,
  solvedUniverse,
}: {
  cells: GridCell[];
  teamNumber: number;
  alreadySolved: boolean;
  /** Set only for a team that has already cleared the round, so it can revisit. */
  solvedUniverse: Revealed | null;
}) {
  const [step, setStep] = useState<Step>(alreadySolved && solvedUniverse ? 3 : 1);
  const [card, setCard] = useState<UniverseCard | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(
    alreadySolved ? solvedUniverse : null
  );

  const [universeGuess, setUniverseGuess] = useState("");
  const [universeWrong, setUniverseWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  const [rgb, setRgb] = useState({ R: "", G: "", B: "" });
  const [colourWrong, setColourWrong] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const rgbComplete = rgb.R !== "" && rgb.G !== "" && rgb.B !== "";

  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(alreadySolved);
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const universeIndex = revealed?.index ?? null;
  const letters = universeIndex === null ? [] : lettersFor(cells, universeIndex);
  const normalizedGuess = normaliseAnswer(guess);

  // Feedback only, and safe here: "right letters, wrong order" is derived from
  // letters already on screen. It is NOT a solve check — isAnagram says nothing
  // about ordering, and ordering is the puzzle.
  const rightLettersWrongOrder =
    letters.length > 0 && normalizedGuess.length > 0 && isAnagram(guess, letters.join(""));

  async function submitUniverse() {
    if (checking || universeGuess.trim() === "") return;
    setChecking(true);
    setUniverseWrong(false);
    setError(null);
    try {
      const res = await fetch("/api/team/grid/universe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ universe: Number(universeGuess) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't check that.");
        return;
      }
      if (body.correct) {
        setCard(body.card);
        setStep(2);
      } else {
        setUniverseWrong(true);
      }
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setChecking(false);
    }
  }

  async function submitColour() {
    if (decoding || !rgbComplete) return;
    setDecoding(true);
    setColourWrong(false);
    setError(null);
    try {
      const res = await fetch("/api/team/grid/colour", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ r: Number(rgb.R), g: Number(rgb.G), b: Number(rgb.B) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't check that.");
        return;
      }
      if (body.correct) setRevealed({ index: body.index, colour: body.colour });
      else setColourWrong(true);
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setDecoding(false);
    }
  }

  async function submitWord() {
    if (busy || solved || normalizedGuess.length === 0) return;
    setBusy(true);
    setWrong(false);
    setError(null);
    try {
      const res = await fetch("/api/team/grid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: normalizedGuess }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't check that. Try again.");
        return;
      }
      if (body.correct) setSolved(true);
      else setWrong(true);
    } catch {
      setError("Couldn't reach the server — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepTrail step={step} />

      {/* ── STEP 1: identify your universe ──────────────────────────────── */}
      {step === 1 && (
        <section className="slab slab-accent anim-pop mx-auto max-w-xl p-6 sm:p-8">
          <span className="tag tag-accent">Step 01</span>
          <h2 className="display mt-4 text-2xl text-ink">Identify your universe</h2>
          <hr className="rule-line mt-4" />

          {/* The rule, in words. NOT the substituted formula — printing
              "index = 17 mod 8" on screen is printing the answer. */}
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Every team is an echo of one of eight universes. Your team number
            decides which — divide it by the number of universes and keep what is
            left over.
          </p>

          <label htmlFor="universe" className="label mt-6 block">
            Universe index (0–{UNIVERSE_COUNT - 1})
          </label>
          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <input
              id="universe"
              value={universeGuess}
              onChange={(e) => {
                setUniverseGuess(e.target.value.replace(/\D/g, "").slice(0, 1));
                setUniverseWrong(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitUniverse();
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="?"
              className="field display min-w-0 flex-1 py-4 text-center text-4xl tabular"
            />
            <button
              onClick={() => void submitUniverse()}
              disabled={checking || universeGuess === ""}
              className="btn btn-accent px-6"
            >
              {checking ? "Checking…" : "Confirm →"}
            </button>
          </div>

          {universeWrong && (
            <p className="anim-pop mt-3 font-mono text-xs text-bad">
              That is not your universe. Check your remainder, not the quotient.
            </p>
          )}
          {error && <p className="mt-3 font-mono text-xs text-bad">{error}</p>}
        </section>
      )}

      {/* ── STEP 2: the colour cipher ───────────────────────────────────── */}
      {step === 2 && card && (
        <section className="slab slab-accent anim-pop mx-auto max-w-xl p-6 sm:p-8">
          <span className="tag tag-accent">Step 02</span>

          <div className="mt-6 text-center">
            <h2 className="display text-5xl text-accent-ink sm:text-6xl">{card.codename}</h2>
            <p className="mt-3 font-mono text-sm tracking-[0.35em] text-ink-2">
              {card.designation.toUpperCase()}
            </p>
          </div>

          <hr className="rule-line mt-6" />
          <p className="label mt-4 text-center">Crack your colour code</p>

          <div className="mt-4 border-2 border-rule bg-paper-2 p-4">
            <p className="label">Colour cipher</p>
            <dl className="mt-3 grid gap-2.5">
              {card.equations.map((eq) => (
                <div key={eq.channel} className="flex items-baseline gap-3">
                  <dt
                    className="display w-6 shrink-0 text-lg"
                    style={{ color: CHANNEL_COLOUR[eq.channel] }}
                  >
                    {eq.channel}
                  </dt>
                  <dd className="m-0 font-mono text-xs text-ink sm:text-sm">= {eq.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {revealed ? (
            /* Decoded. The colour is shown — earned, not given — and the grid
               will isolate it, so there is no second hunt for a swatch they
               have already proved. */
            <div className="anim-pop mt-5">
              <p className="label text-center">Your universe colour</p>
              <div
                className="mt-2 flex h-28 items-center justify-center border-2 border-rule"
                style={{ background: revealed.colour }}
              >
                <span
                  className="display text-2xl"
                  style={{
                    color: CELL_TEXT_TONE[revealed.index].colour,
                    textShadow: `0 0 4px ${CELL_TEXT_TONE[revealed.index].halo}`,
                  }}
                >
                  {revealed.colour.toUpperCase()}
                </span>
              </div>
              <p className="mt-2 text-center font-mono text-xs text-good">
                Decoded — rgb({rgb.R}, {rgb.G}, {rgb.B})
              </p>

              <button onClick={() => setStep(3)} className="btn btn-accent mt-4 w-full py-3.5">
                Find your letters →
              </button>
            </div>
          ) : (
            <>
              {/* `n` is named but NOT valued. Substituting it is the step. */}
              <p className="mt-3 font-mono text-xs text-ink-3">
                Substitute <strong className="text-ink-2">n</strong> and work out all three
                channels.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {(["R", "G", "B"] as const).map((c) => (
                  <div key={c}>
                    <label
                      htmlFor={`ch-${c}`}
                      className="label block text-center"
                      style={{ color: CHANNEL_COLOUR[c] }}
                    >
                      {c}
                    </label>
                    <input
                      id={`ch-${c}`}
                      value={rgb[c]}
                      onChange={(e) => {
                        setRgb((prev) => ({
                          ...prev,
                          [c]: e.target.value.replace(/\D/g, "").slice(0, 3),
                        }));
                        setColourWrong(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitColour();
                      }}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0–255"
                      className="field mt-1 text-center text-lg tabular"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => void submitColour()}
                disabled={decoding || !rgbComplete}
                className="btn btn-accent mt-4 w-full py-3.5"
              >
                {decoding ? "Checking…" : "Decode colour →"}
              </button>

              {colourWrong && (
                <p className="anim-pop mt-3 font-mono text-xs text-bad">
                  That is not your colour. Check what you substituted for n.
                </p>
              )}
              {error && <p className="mt-3 font-mono text-xs text-bad">{error}</p>}

              <button onClick={() => setStep(1)} className="btn mt-2 w-full">
                ← Back
              </button>
            </>
          )}
        </section>
      )}

      {/* ── STEP 3: unscramble ──────────────────────────────────────────── */}
      {step === 3 && revealed && (
        <div className="anim-pop grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-5">
            <section className="slab slab-accent p-5">
              <div className="flex items-baseline gap-3">
                <span className="tag tag-accent">Step 03</span>
                <h3 className="display text-lg text-ink">Unscramble</h3>
              </div>
              <hr className="rule-line-soft mt-4" />

              <div className="mt-4 flex items-center gap-3">
                <span
                  className="block h-12 w-12 shrink-0 border-2 border-rule"
                  style={{ background: revealed.colour }}
                />
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-ink">
                    {revealed.colour.toUpperCase()}
                  </p>
                  {card && (
                    <p className="font-mono text-xs text-ink-3">
                      {card.codename} · {card.designation}
                    </p>
                  )}
                </div>
              </div>

              {/* The letters are NOT listed here. Finding the eight cells in
                  the grid is the step — collecting them up front would leave
                  only the anagram. */}
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                Eight of the sixty-four cells are this colour. Find them, and
                the letters spell one <strong>technical</strong> word.
              </p>

              <div className="mt-5 flex flex-wrap items-stretch gap-2">
                <input
                  value={guess}
                  onChange={(e) => {
                    setGuess(e.target.value);
                    setWrong(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitWord();
                  }}
                  disabled={solved}
                  placeholder="Type the word…"
                  autoComplete="off"
                  spellCheck={false}
                  className="field min-w-0 flex-1 text-lg uppercase"
                />
                <button
                  onClick={() => void submitWord()}
                  disabled={busy || solved || normalizedGuess.length === 0}
                  className="btn btn-accent"
                >
                  {busy ? "Checking…" : "Submit"}
                </button>
              </div>

              {solved ? (
                <p className="anim-pop mt-3 font-mono text-sm font-bold text-good">
                  Correct — round complete. It is marked on your hunt board.
                </p>
              ) : error ? (
                <p className="mt-3 font-mono text-xs text-bad">{error}</p>
              ) : wrong ? (
                <p className="anim-pop mt-3 font-mono text-xs text-bad">
                  Not the word. Every letter is used exactly once.
                </p>
              ) : rightLettersWrongOrder ? (
                <p className="anim-pop mt-3 font-mono text-xs text-warn">
                  Right letters — try a different order.
                </p>
              ) : null}

              {!solved && card && (
                <button onClick={() => setStep(2)} className="btn mt-4 w-full">
                  ← Back to the cipher
                </button>
              )}
            </section>
          </div>

          {/* ── The 8×8 grid, with their colour isolated ── */}
          <section className="slab self-start p-4">
            <div className="flex items-baseline justify-between">
              <span className="label">8 × 8 grid</span>
              <span className="font-mono text-xs text-ink-3">64 cells</span>
            </div>
            <hr className="rule-line mt-2" />

            {/* EVERY CELL RENDERS THE SAME. No dimming, no highlight, no
                isolation — spotting which eight carry the team's colour is the
                work, and the board would do it for them otherwise. */}
            <div className="mt-3 grid grid-cols-8 gap-[2px] border-2 border-rule bg-rule p-[2px]">
              {cells.map((cell, i) => {
                const tone = CELL_TEXT_TONE[cell.colour];
                return (
                  <div
                    key={i}
                    className="grid-cell flex aspect-square items-center justify-center text-xs sm:text-sm"
                    style={{
                      background: GRID_COLOURS[cell.colour],
                      color: tone.colour,
                      textShadow: `0 0 3px ${tone.halo}`,
                    }}
                  >
                    {cell.letter}
                  </div>
                );
              })}
            </div>

            <p className="mt-3 font-mono text-[0.7rem] text-ink-3">
              Match your swatch against the board and read those eight letters.
            </p>
          </section>
        </div>
      )}

      {/* Finish is gated on `solved`, which only the server can set. */}
      <RoundFooter slug="hunt-grid" title="64 Grid" solved={solved} />
    </>
  );
}

/** Where the team is in the three-step run. */
function StepTrail({ step }: { step: Step }) {
  const steps = ["Identify", "Decode", "Unscramble"] as const;
  return (
    <ol className="anim-rise mb-6 flex flex-wrap items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        const state = n === step ? "current" : n < step ? "done" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 border-2 border-rule px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-widest ${
                state === "current"
                  ? "bg-accent text-ink"
                  : state === "done"
                    ? "bg-good text-white"
                    : "bg-paper-2 text-ink-3"
              }`}
            >
              <span className="tabular">{String(n).padStart(2, "0")}</span>
              {label}
            </span>
            {i < steps.length - 1 && <span className="h-0.5 w-4 bg-rule-soft" />}
          </li>
        );
      })}
    </ol>
  );
}
