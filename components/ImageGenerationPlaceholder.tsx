export function ImageGenerationPlaceholder({ label = "Generating image…" }: { label?: string }) {
  return <div className="absolute inset-0 grid place-items-center bg-paper/95 p-4 text-center" data-testid="image-generation-placeholder">
    <div>
      <svg aria-hidden="true" viewBox="0 0 96 72" className="mx-auto h-16 w-24 text-ink" fill="none">
        <path d="M4 16V4h12M80 4h12v12M92 56v12H80M16 68H4V56" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
        <rect x="14" y="14" width="68" height="44" rx="2" fill="var(--acid)" fillOpacity=".3" stroke="currentColor" strokeOpacity=".15" />
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path className="image-generation-draw" pathLength="1" d="M14 49l18-19 18 20 12-12 20 20H14V14h68v44" />
          <circle className="image-generation-draw" pathLength="1" cx="64" cy="27" r="5" />
        </g>
        <path className="image-generation-scan" d="M8 36h80" stroke="var(--rust)" strokeWidth="2" />
      </svg>
      <p role="status" className="mt-3 text-sm font-bold text-ink">{label}</p>
    </div>
  </div>;
}
