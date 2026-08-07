"use client";

import { useState } from "react";
import {
  GRID_COLOURS,
  isAnagram,
  lettersFor,
  normaliseAnswer,
  type GridCell,
} from "@/lib/hunt/grid";

/**
 * Contrast helpers for the grid cells.
 *
 * A single fixed ink colour cannot read against all eight swatches — purple
 * (#7209b7) and blue (#4361ee) are dark enough that black text falls to
 * ~2.1:1 and ~3.4:1, well under WCAG AA's 4.5:1 for body text, and these are
 * letters a team has to read off a projector under a clock. Rather than touch
 * the palette (the eight colours are load-bearing for the puzzle), each swatch
 * picks whichever of the two design-system ink tones actually reads better.
 *
 * THESE TWO CONSTANTS MUST TRACK globals.css. They were #0A0A0A / #F2EFE9 when
 * this came from SympoApp, then the dashboard's old dark theme, and now the
 * Concrete palette. Get them wrong and the maths silently optimises contrast
 * against colours that are not the ones on screen — which looks fine in review
 * and fails on the one purple cell nobody can read.
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

const INK = "#111111"; // --ink
const CARD = "#ffffff"; // --card
const INK_LUM = relativeLuminance(INK);
const CARD_LUM = relativeLuminance(CARD);

function textToneFor(hex: string) {
  const lum = relativeLuminance(hex);
  return contrastRatio(lum, INK_LUM) >= contrastRatio(lum, CARD_LUM)
    ? { colour: INK, halo: "rgba(255,255,255,0.55)" }
    : { colour: CARD, halo: "rgba(17,17,17,0.55)" };
}

// Computed once against the fixed eight-colour palette, not per render.
const CELL_TEXT_TONE = GRID_COLOURS.map(textToneFor);

const COLOUR_NAMES = [
  "Red", "Orange", "Gold", "Teal",
  "Blue", "Purple", "Pink", "Bone",
];

/**
 * Three equations give a number; that number mod 8 selects one of the eight
 * swatches. Picking a swatch isolates its eight scattered cells (the other 56
 * dim out) and shows their letters so the team can unscramble them.
 *
 * The grid is built on the server — `cells` arrives already shuffled. This
 * component never sees the eight source words, so there is nothing here for a
 * curious team to read out of devtools.
 *
 * IT ALSO DOES NOT KNOW ITS OWN ANSWER, AND MUST NOT LEARN IT. Upstream this
 * file used to `import { CODES }` and compare the player's typing against
 * `CODES.grid`. Bundlers do not tree-shake individual properties off an object
 * read by member expression, so that shipped every reveal code in the hunt into
 * the client chunk. It now reports what the player typed and stops there; the
 * server decides, and it is the only thing that can.
 */
export default function SixtyFourGrid({
  cells,
  equations,
  alreadySolved,
}: {
  cells: GridCell[];
  equations: string[];
  alreadySolved: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(alreadySolved);
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const letters = picked === null ? [] : lettersFor(cells, picked);
  const normalizedGuess = normaliseAnswer(guess);

  // Feedback only, and safe to compute here: "you have the right cells, wrong
  // order" is derived from the letters the grid already shows on screen, so it
  // tells the player nothing they cannot see. It is NOT a solve check —
  // isAnagram says nothing about ordering, and ordering is the puzzle.
  const rightLettersWrongOrder =
    picked !== null &&
    letters.length > 0 &&
    normalizedGuess.length > 0 &&
    isAnagram(guess, letters.join(""));

  async function submit() {
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
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      {/* ── LEFT: Equations → Colour → Anagram ── */}
      <div className="space-y-5">
        <section className="slab p-5">
          <div className="flex items-baseline gap-3">
            <span className="tag tag-accent">Step 1</span>
            <h3 className="display text-lg text-ink">Crack the equations</h3>
          </div>
          <hr className="rule-line-soft mt-4" />

          <ol className="mt-4 space-y-3">
            {equations.map((eq, i) => (
              <li key={eq} className="flex items-start gap-3">
                <span className="display flex h-7 w-7 shrink-0 items-center justify-center border-2 border-rule bg-paper-2 text-sm tabular text-ink">
                  {i + 1}
                </span>
                <span className="pt-1 text-sm leading-relaxed text-ink-2">{eq}</span>
              </li>
            ))}
          </ol>

          <hr className="rule-line-soft mt-4" />
          <p className="mt-3 font-mono text-xs text-ink-3">
            Add your three answers → total mod 8 = colour index.
          </p>
        </section>

        <section className="slab p-5">
          <div className="flex items-baseline gap-3">
            <span className="tag tag-accent">Step 2</span>
            <h3 className="display text-lg text-ink">Pick your colour</h3>
          </div>
          <hr className="rule-line-soft mt-4" />

          <div className="mt-4 grid grid-cols-4 gap-2">
            {GRID_COLOURS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setPicked(i);
                  setGuess("");
                  setWrong(false);
                }}
                aria-label={`Colour ${i}: ${COLOUR_NAMES[i]}`}
                aria-pressed={picked === i}
                className={`flex flex-col items-center gap-1.5 border-2 p-2 ${
                  picked === i ? "border-rule bg-accent-wash" : "border-transparent hover:bg-paper-2"
                }`}
              >
                <span
                  className="block h-10 w-full border-2 border-rule"
                  style={{ background: c }}
                />
                <span
                  className={`font-mono text-[0.6rem] font-bold uppercase tracking-wider ${
                    picked === i ? "text-accent-ink" : "text-ink-3"
                  }`}
                >
                  {i} {COLOUR_NAMES[i]}
                </span>
              </button>
            ))}
          </div>
        </section>

        {picked !== null && (
          <section className="slab slab-accent anim-pop p-5">
            <div className="flex items-baseline gap-3">
              <span className="tag tag-accent">Step 3</span>
              <h3 className="display text-lg text-ink">Unscramble</h3>
            </div>
            <hr className="rule-line-soft mt-4" />

            <p className="label mt-4">Letters from colour {picked}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {letters.map((l, i) => (
                <span
                  key={i}
                  className="display flex h-10 w-10 items-center justify-center border-2 border-rule text-lg"
                  style={{
                    background: GRID_COLOURS[picked],
                    color: CELL_TEXT_TONE[picked].colour,
                    textShadow: `0 0 3px ${CELL_TEXT_TONE[picked].halo}`,
                  }}
                >
                  {l}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-stretch gap-2">
              <input
                value={guess}
                onChange={(e) => {
                  setGuess(e.target.value);
                  setWrong(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                disabled={solved}
                placeholder="Type the word…"
                autoComplete="off"
                spellCheck={false}
                className="field min-w-0 flex-1 text-lg uppercase"
              />
              <button
                onClick={() => void submit()}
                disabled={busy || solved || normalizedGuess.length === 0}
                className="btn btn-accent"
              >
                {busy ? "Checking…" : "Submit"}
              </button>
            </div>

            {/* Priority order: solved, server error, wrong, then the hint. */}
            {solved ? (
              <p className="anim-pop mt-3 font-mono text-sm font-bold text-good">
                Correct — the round is marked complete on your board.
              </p>
            ) : error ? (
              <p className="mt-3 font-mono text-xs text-bad">{error}</p>
            ) : wrong ? (
              <p className="anim-pop mt-3 font-mono text-xs text-bad">
                Not the word. Check your colour index before your spelling.
              </p>
            ) : rightLettersWrongOrder ? (
              <p className="anim-pop mt-3 font-mono text-xs text-warn">
                Right letters — try a different order.
              </p>
            ) : null}
          </section>
        )}
      </div>

      {/* ── RIGHT: The 8×8 grid ── */}
      <section className="slab self-start p-4">
        <div className="flex items-baseline justify-between">
          <span className="label">8 × 8 grid</span>
          <span className="font-mono text-xs text-ink-3">64 cells</span>
        </div>
        <hr className="rule-line mt-2" />

        <div className="mt-3 grid grid-cols-8 gap-[2px] border-2 border-rule bg-rule p-[2px]">
          {cells.map((cell, i) => {
            const tone = CELL_TEXT_TONE[cell.colour];
            const isDimmed = picked !== null && cell.colour !== picked;

            return (
              <div
                key={i}
                className="grid-cell flex aspect-square items-center justify-center text-xs sm:text-sm"
                style={{
                  background: GRID_COLOURS[cell.colour],
                  color: tone.colour,
                  textShadow: `0 0 3px ${tone.halo}`,
                  /* Dimming is how "pick a colour" reads. Kept as opacity so
                     the eight puzzle colours are never actually altered. */
                  opacity: isDimmed ? 0.12 : 1,
                  transition: "opacity 0.2s linear",
                }}
              >
                {cell.letter}
              </div>
            );
          })}
        </div>

        <hr className="rule-line-soft mt-3" />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {GRID_COLOURS.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5"
              style={{ opacity: picked !== null && picked !== i ? 0.35 : 1 }}
            >
              <span
                className="inline-block h-3.5 w-3.5 border-2"
                style={{ background: c, borderColor: picked === i ? "#ff4a00" : "#111111" }}
              />
              <span className="font-mono text-[0.65rem] tabular text-ink-3">{i}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
