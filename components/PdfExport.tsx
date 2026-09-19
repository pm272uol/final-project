"use client";

import { useState } from "react";
import { exportProductionPdf } from "@/lib/productionPdf";
import type { StoryboardPackage } from "@/types/storyboard";

export function PdfExport({ storyboard, duration, busy }: {
  storyboard: StoryboardPackage;
  duration: string;
  busy: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");

  async function exportPdf() {
    setExporting(true);
    setStatus("Preparing production PDF…");
    try {
      const warnings = await exportProductionPdf(storyboard, duration);
      setStatus(warnings.length ? `PDF exported. ${warnings.join("; ")}.` : "Production PDF exported.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="PDF export" className="space-y-3 border-t border-ink pt-6">
      <button type="button" disabled={busy || exporting} onClick={() => void exportPdf()}
        className="border-[1.5px] border-ink bg-ink px-5 py-3 font-bold text-paper disabled:opacity-50">
        {exporting ? "Exporting PDF…" : "Export production PDF"}
      </button>
      <p role="status" className="text-sm">{status}</p>
    </section>
  );
}
