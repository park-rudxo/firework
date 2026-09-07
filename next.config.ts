import type { NextConfig } from "next";

/**
 * 이 서비스는 남이 올린 저장소의 README와 스크린샷을 그대로 화면에 얹는다.
 * 즉 페이지에 실리는 상당 부분이 우리가 쓰지 않은 콘텐츠다. CSP는 그래서
 * 부가 설정이 아니라 신고 기능과 같은 층위의 방어선이다.
 */
const csp = [
  "default-src 'self'",
  // Next는 인라인 부트스트랩 스크립트를 넣는다. 개발 모드는 eval도 쓴다.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // GitHub 아바타·뱃지·README 안의 이미지가 어디서 올지 미리 알 수 없다.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // README에 박힌 <iframe>·<object>는 새니타이즈에서 걸리지만 이중으로 막는다.
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // 사용자가 아이콘·스크린샷 URL을 직접 넣을 수 있으므로 호스트를 좁혀둔다.
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "user-images.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
