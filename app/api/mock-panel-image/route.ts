export async function GET(request: Request) {
  const seedValue = new URL(request.url).searchParams.get("seed") ?? "1";
  const seed = Number.parseInt(seedValue, 10) || 1;
  const hue = Math.abs(seed) % 360;
  const accentHue = (hue + 62) % 360;
  const offset = 80 + (Math.abs(seed) % 220);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576" role="img" aria-label="Mock storyboard image">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 24% 15%)"/>
      <stop offset="1" stop-color="hsl(${accentHue} 36% 30%)"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .09 0"/>
    </filter>
  </defs>
  <rect width="1024" height="576" fill="url(#sky)"/>
  <circle cx="${offset}" cy="170" r="115" fill="hsl(${accentHue} 72% 66%)" opacity=".72"/>
  <path d="M0 420 L220 270 L410 390 L610 220 L1024 420 V576 H0 Z" fill="hsl(${hue} 28% 9%)" opacity=".88"/>
  <path d="M0 470 L260 345 L510 455 L790 300 L1024 390 V576 H0 Z" fill="hsl(${accentHue} 30% 13%)"/>
  <rect x="62" y="50" width="900" height="476" fill="none" stroke="hsl(${accentHue} 80% 82%)" stroke-width="3" opacity=".7"/>
  <g fill="hsl(${accentHue} 92% 78%)">
    <rect x="62" y="50" width="72" height="7"/>
    <rect x="62" y="50" width="7" height="72"/>
    <rect x="890" y="519" width="72" height="7"/>
    <rect x="955" y="454" width="7" height="72"/>
  </g>
  <text x="84" y="500" fill="white" font-family="monospace" font-size="22" letter-spacing="4">FRAMEWRIGHT MOCK RENDER</text>
  <rect width="1024" height="576" filter="url(#grain)" opacity=".75"/>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
