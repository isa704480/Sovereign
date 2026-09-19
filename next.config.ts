import type { NextConfig } from "next";

/**
 * Xavfsizlik sarlavhalari. CSP inline-script ga `unsafe-inline` beradi (Next.js
 * 16 hydration inline skriptga tayanadi). Boshqa sarlavhalar defense-in-depth:
 * clickjacking, MIME-sniff, referer leak, sniffer downgrade.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://apis.google.com https://www.gstatic.com https://accounts.google.com https://*.dodopayments.com",
      "script-src-elem 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://apis.google.com https://www.gstatic.com https://accounts.google.com https://*.dodopayments.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai https://api.perplexity.ai https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://apis.google.com https://dashboard.zenobank.io https://*.dodopayments.com",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://checkout.dodopayments.com https://test.checkout.dodopayments.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
