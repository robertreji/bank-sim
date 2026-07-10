import type { NextConfig } from "next";
import os from "os";

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    if (iface) {
      for (const alias of iface) {
        if (alias.family === "IPv4" && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  return "localhost";
}

const localIp = getLocalIpAddress();

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    localIp,
    `${localIp}:3001`,
    "localhost:3001",
  ],
};

export default nextConfig;
