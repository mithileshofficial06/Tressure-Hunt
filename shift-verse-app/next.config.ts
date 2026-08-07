import type { NextConfig } from "next";
import path from "node:path";

/**
 * `turbopack.root` pins the workspace root to this app.
 *
 * Without it Next walks up looking for a lockfile, finds one in
 * `OneDrive/Desktop/Projects/` — two levels above the hunt — and treats that as
 * the root. File tracing then resolves from the wrong directory, which is the
 * kind of thing that builds fine locally and ships a deployment missing its
 * assets.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
