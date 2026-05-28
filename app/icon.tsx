import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512, height: 512,
          background: "linear-gradient(135deg, #07111F 0%, #0d1f3c 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 112,
        }}
      >
        {/* Outer glow ring */}
        <div style={{
          width: 380, height: 380,
          borderRadius: "50%",
          border: "3px solid rgba(0,229,168,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Inner circle */}
          <div style={{
            width: 300, height: 300,
            borderRadius: "50%",
            background: "rgba(0,229,168,0.08)",
            border: "2px solid rgba(0,229,168,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column",
          }}>
            {/* QP text */}
            <div style={{
              fontFamily: "sans-serif",
              fontSize: 120,
              fontWeight: 900,
              color: "#00E5A8",
              letterSpacing: -4,
              lineHeight: 1,
            }}>
              QP
            </div>
            <div style={{
              fontFamily: "sans-serif",
              fontSize: 32,
              fontWeight: 700,
              color: "rgba(0,229,168,0.6)",
              marginTop: 4,
              letterSpacing: 6,
            }}>
              QUANT
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
