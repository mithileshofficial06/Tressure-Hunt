import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/**
 * Pin the workspace root to this folder.
 *
 * There is an unrelated package-lock.json further up in Desktop/Projects, and
 * Next walks upwards looking for one — so it picked that directory as the root
 * and warned on every start. Left alone it also widens output file tracing to
 * the whole Projects folder on build.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },

  /**
   * Strict Mode off — for the Mystery Room's WebGL canvas specifically.
   *
   * Strict Mode is a DEV-ONLY behaviour that mounts every component, runs its
   * effects, tears them down, and mounts again, to surface effects that are not
   * cleanup-safe. react-three-fiber's `<Canvas>` does not survive that: the
   * first mount creates a WebGL context, the simulated unmount disposes it, and
   * the remount gets a canvas whose context is gone. The result is a room that
   * renders nothing — HUD and console present, scene empty — while
   * `canvas.getContext("webgl2")` returns null.
   *
   * It only ever affected `npm run dev`; production builds do not run the
   * double-mount and the room always rendered correctly there. But "works when
   * deployed, broken on the machine you develop on" is a trap, and the round
   * cannot be rehearsed locally with it on.
   *
   * The cost is losing a dev-time warning for unsafe effects in the rest of the
   * app. Accepted deliberately: this codebase's effects are timers and fetches
   * that already clean up (see Dashboard's clock and RoundFooter's key handler),
   * and a puzzle nobody can playtest locally is the worse failure.
   */
  reactStrictMode: false,
};

export default nextConfig;
