import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Allow pdf2json and tesseract.js to run server-side without bundling issues
  serverExternalPackages: ['pdf2json', 'pdf-parse', 'tesseract.js', 'canvas', 'pdfkit'],

  // Suppress warnings from these packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent client-side bundling of these node modules
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('pdf2json', 'pdf-parse', 'tesseract.js', 'canvas');
      }
    }

    // Handle canvas module (used by some PDF libs)
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };

    return config;
  },
};

export default nextConfig;
