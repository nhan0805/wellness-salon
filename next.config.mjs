/** @type {import('next').NextConfig} */
const nextConfig = {
  // vinext's Cloudflare Build Output path owns the Worker artifact.
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true
};

export default nextConfig;
