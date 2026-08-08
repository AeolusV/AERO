import { useId, type CSSProperties } from "react";

export type BrandPalette = "air" | "mint" | "sunset" | "graphite";
export type BrandSurface = "soft" | "clear";

const palettes: Record<BrandPalette, { primary: string; secondary: string; glow: string; surface: string }> = {
  air: { primary: "#536DFE", secondary: "#8FA6FF", glow: "rgba(83, 109, 254, .24)", surface: "#F2F5FF" },
  mint: { primary: "#14946D", secondary: "#6DD4B1", glow: "rgba(20, 148, 109, .22)", surface: "#EFFAF6" },
  sunset: { primary: "#E26755", secondary: "#F2B36F", glow: "rgba(226, 103, 85, .22)", surface: "#FFF5F0" },
  graphite: { primary: "#343B46", secondary: "#788391", glow: "rgba(52, 59, 70, .18)", surface: "#F3F4F6" },
};

export function BrandMark({
  palette = "air",
  surface = "soft",
  size = 36,
  className = "",
}: {
  palette?: BrandPalette;
  surface?: BrandSurface;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const colors = palettes[palette];

  return (
    <svg
      className={`aero-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      role="img"
      aria-label="Aero"
      style={{ "--brand-glow": colors.glow } as CSSProperties}
    >
      <defs>
        <linearGradient id={`${id}-surface`} x1="6" y1="4" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor={colors.surface} />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="11" y1="9" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor={colors.secondary} />
          <stop offset=".58" stopColor={colors.primary} />
          <stop offset="1" stopColor={colors.primary} />
        </linearGradient>
      </defs>
      {surface === "soft" && (
        <rect x="2.25" y="2.25" width="31.5" height="31.5" rx="10.5" fill={`url(#${id}-surface)`} stroke="rgba(71, 82, 98, .07)" />
      )}
      <path
        d="M26.35 17.9A8.35 8.35 0 1 1 18 9.55A8.35 8.35 0 0 1 26.35 17.9V24.95"
        stroke={`url(#${id}-ribbon)`}
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
