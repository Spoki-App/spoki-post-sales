import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@google-cloud/cloud-sql-connector", "google-auth-library", "firebase-admin"],
  experimental: {},
  async redirects() {
    return [
      { source: "/team-reports", destination: "/admin/team-reports", permanent: true },
      { source: "/training-reports", destination: "/admin/training-reports", permanent: true },
    ];
  },
};

export default nextConfig;
