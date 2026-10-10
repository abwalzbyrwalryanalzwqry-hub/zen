export function ZenLogo({ size = 120, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-3xl ${glow ? "anim-pulse-glow" : ""}`}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary via-primary-glow to-primary opacity-90" />
      <div className="absolute inset-[2px] rounded-[calc(1.5rem-2px)] bg-background/40 backdrop-blur-xl border border-gold/30" />
      <svg
        viewBox="0 0 100 100"
        className="relative z-10"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        <defs>
          <linearGradient id="zg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.14 85)" />
            <stop offset="100%" stopColor="oklch(0.75 0.13 85)" />
          </linearGradient>
        </defs>
        <text
          x="50"
          y="66"
          textAnchor="middle"
          fontFamily="'Zen Text', serif"
          fontWeight="900"
          fontSize="52"
          fill="url(#zg)"
          letterSpacing="-2"
        >
          Zen
        </text>
      </svg>
    </div>
  );
}
