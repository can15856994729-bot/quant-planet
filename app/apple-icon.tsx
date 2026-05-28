import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180, height: 180,
          background: "linear-gradient(135deg, #07111F 0%, #0d1f3c 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 40,
        }}
      >
        <div style={{
          width: 130, height: 130,
          borderRadius: "50%",
          background: "rgba(0,229,168,0.1)",
          border: "2px solid rgba(0,229,168,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column",
        }}>
          <div style={{
            fontFamily: "sans-serif", fontSize: 46, fontWeight: 900,
            color: "#00E5A8", letterSpacing: -2, lineHeight: 1,
          }}>QP</div>
          <div style={{
            fontFamily: "sans-serif", fontSize: 13, fontWeight: 700,
            color: "rgba(0,229,168,0.6)", marginTop: 2, letterSpacing: 3,
          }}>QUANT</div>
        </div>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
