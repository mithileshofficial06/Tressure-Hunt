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
};

export default nextConfig;
