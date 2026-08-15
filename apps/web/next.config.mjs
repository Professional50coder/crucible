/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint in this package's dependency set; skip the build-time lint step
  // rather than failing `next build` on a missing config.
  eslint: { ignoreDuringBuilds: true },
  // WalletConnect's dependency tree reaches for optional native/react-native
  // modules that do not exist in a browser bundle. Stub them out.
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
