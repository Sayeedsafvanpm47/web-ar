import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local dev machines here have 7GB of RAM, and the default worker count
  // (one per core) exhausts it during page generation, killing the build with
  // a V8 heap OOM that reads like a Windows crash code. Vercel's builders are
  // not constrained the same way, so only cap it outside CI.
  ...(process.env.CI ? {} : { experimental: { cpus: 2 } }),
  /* config options here */
};

export default nextConfig;
