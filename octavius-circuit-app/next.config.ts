import type { NextConfig } from "next";
import path from "node:path";

/**
 * `turbopack.root` pins the workspace root to this app.
 *
 * Without it Next walks up looking for a lockfile, finds one two directories
 * above the hunt, and traces files from there — which builds fine locally and
 * ships a deployment missing its assets.
 */
const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
