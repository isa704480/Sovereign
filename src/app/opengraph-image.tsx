import { ImageResponse } from "next/og";

// Ijtimoiy tarmoq ulashish rasmi (1200×630 PNG). Build vaqtida bir marta yaratiladi.
export const alt = "SOVEREIGN: Barcha AI. Bitta oyna.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0A0B14";
const ACCENT = "#7C6FF7";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: `radial-gradient(60% 70% at 85% 20%, rgba(124,111,247,0.35) 0%, rgba(124,111,247,0) 70%), radial-gradient(50% 60% at 10% 100%, rgba(32,212,232,0.12) 0%, rgba(32,212,232,0) 70%), ${BG}`,
          color: "#F0F2FF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* Belgi: aksent rangli romb */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${ACCENT} 0%, #5B50F0 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 60px rgba(124,111,247,0.55)",
            }}
          >
            <div style={{ width: 28, height: 28, background: BG, transform: "rotate(45deg)", borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 10 }}>SOVEREIGN</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Barcha AI.</div>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: ACCENT }}>
            Bitta oyna.
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 48, fontSize: 30, color: "#9BA3CC" }}>
          Claude · GPT · Gemini · DeepSeek · 1700+ models
        </div>
      </div>
    ),
    { ...size },
  );
}
