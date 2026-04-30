import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@google-cloud/cloud-sql-connector", "google-auth-library", "firebase-admin"],
  experimental: {},
  async redirects() {
    return [
      { source: "/team-reports", destination: "/admin/team-reports", permanent: true },
      { source: "/training-reports", destination: "/admin/training-reports", permanent: true },
      { source: "/industries/clients", destination: "/industries", permanent: true },
      { source: "/industries/clients/:path*", destination: "/industries", permanent: true },
      { source: "/industries/library", destination: "/industries", permanent: true },
      { source: "/industries/library/:path*", destination: "/industries", permanent: true },
      { source: "/industries/qbr", destination: "/industries", permanent: true },
      { source: "/industries/qbr/:path*", destination: "/industries", permanent: true },
    ];
  },
};

export default nextConfig;
