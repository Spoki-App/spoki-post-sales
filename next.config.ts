import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@google-cloud/cloud-sql-connector", "google-auth-library", "firebase-admin"],
  experimental: {},
};

export default nextConfig;
