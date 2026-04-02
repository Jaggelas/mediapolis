import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  typedRoutes: true,
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default nextConfig;
