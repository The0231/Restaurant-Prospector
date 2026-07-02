/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // The base FSA dataset is served from Supabase Storage in production (see
  // src/lib/base-dataset.ts + the weekly refresh workflow), so the serverless
  // routes no longer need the 36 MB file bundled into them.
};

export default nextConfig;
