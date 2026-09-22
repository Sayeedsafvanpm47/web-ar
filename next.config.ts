import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This machine has 7GB of RAM and the default worker count (one per core)
  // exhausts it during page generation, crashing the build with a V8 OOM.
  // Vercel's builders are not memory-constrained in the same way, so raise or
  // remove this if builds get slow in CI.
  experimental: {
    cpus: 2,
  },
  /* config options here */
};

export default nextConfig;
