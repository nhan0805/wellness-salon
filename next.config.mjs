/** @type {import('next').NextConfig} */
const nextConfig = {
  // vinext's Cloudflare Build Output path owns the Worker artifact. The
  // standalone Node server remains enabled for the PostgreSQL/Docker path.
  output: process.env.CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT === 'true' ? undefined : 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true
};

export default nextConfig;
