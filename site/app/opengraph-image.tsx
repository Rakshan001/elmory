import { ImageResponse } from "next/og";
import { MARK_PATH, MARK_VIEWBOX } from "@/components/site/mark-path";

export const alt = "Elmory: memory for coding agents that checks the code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0a0a0a",
          color: "#ededed",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg viewBox={MARK_VIEWBOX} width={64} height={74} fill="#ededed">
            <path fillRule="evenodd" d={MARK_PATH} />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 600, letterSpacing: -2 }}>elmory</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 76, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>
            Memory that checks the code first.
          </span>
          <span style={{ fontSize: 30, color: "#a1a1a1" }}>Open-source memory for coding agents</span>
        </div>
      </div>
    ),
    size,
  );
}
