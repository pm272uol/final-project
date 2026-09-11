import type { StoryboardPackage } from "@/types/storyboard";
import { sequenceTiming } from "./timing";
import { downloadFile } from "./projects";

/** Explicit page layout, independent of the application DOM or print styles.
 * Rasterized browser text preserves Unicode and is not searchable in the PDF.
 */
export async function exportProductionPdf(board: StoryboardPackage, target: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: board.title, subject: "Storyboard production package", creator: "Framewright" });
  const canvas = document.createElement("canvas"); canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas is unavailable for PDF export.");
  const margin = 84, width = canvas.width - margin * 2, bottom = 1630;
  let y = 0, pages = 0, pageTitle = "Production package";
  const warnings: string[] = [];
  function start() {
    ctx!.fillStyle = "#ffffff"; ctx!.fillRect(0, 0, canvas.width, canvas.height);
    ctx!.fillStyle = "#a34429"; ctx!.font = "bold 22px sans-serif"; ctx!.fillText("FRAMEWRIGHT / PRODUCTION", margin, 65);
    ctx!.fillStyle = "#161813"; ctx!.font = "bold 30px sans-serif"; ctx!.fillText(pageTitle, margin, 118, width);
    ctx!.strokeStyle = "#161813"; ctx!.beginPath(); ctx!.moveTo(margin, 143); ctx!.lineTo(canvas.width - margin, 143); ctx!.stroke();
    y = 188;
  }
  function flush() {
    if (pages++) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
  }
  function next() { flush(); start(); }
  function text(value: string, size = 24, bold = false) {
    const lineHeight = Math.ceil(size * 1.42);
    ctx!.font = `${bold ? "bold " : ""}${size}px sans-serif`;
    // Break oversized words by code point so long prompts cannot overflow the margin.
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const proposed = line ? `${line} ${word}` : word;
        if (ctx!.measureText(proposed).width <= width) { line = proposed; continue; }
        if (line) { lines.push(line); line = ""; }
        for (const char of word) {
          if (ctx!.measureText(line + char).width > width) { lines.push(line); line = ""; }
          line += char;
        }
      }
      lines.push(line);
    }
    for (const line of lines) {
      if (y + lineHeight > bottom) { next(); ctx!.font = `${bold ? "bold " : ""}${size}px sans-serif`; }
      ctx!.fillStyle = "#161813"; ctx!.fillText(line, margin, y); y += lineHeight;
    }
    y += 14;
  }
  function field(label: string, value: string) {
    if (y + 105 > bottom) next();
    text(label.toUpperCase(), 21, true); text(value || "None recorded");
  }
  start();
  const timing = sequenceTiming(board, target);
  text(board.title, 48, true); text(board.logline, 30);
  field("Sequence", `${board.storyboard.length} shots / ${timing.total.toFixed(1)} seconds / target ${target}`);
  field("Direction", `${board.genre} / ${board.tone} / ${board.visualStyle}`);
  field("Cast", board.characters.map(c => `${c.name} (${c.role}): ${c.visualDescription} ${c.personality}`).join("\n\n"));
  field("Locations", board.locations.map(l => `${l.name}: ${l.description} ${l.mood}`).join("\n\n"));
  field("Continuity notes", board.continuityNotes.join("\n"));
  field("Production notes", board.productionNotes.join("\n"));
  for (const shot of timing.shots) {
    flush(); pageTitle = `Shot ${String(shot.panel.panelNumber).padStart(2, "0")} / ${shot.panel.shotType}`; start();
    text(`${shot.start.toFixed(1)}-${shot.end.toFixed(1)}s / ${shot.duration.toFixed(1)} seconds`, 24, true);
    const imageY = y, imageHeight = 500;
    ctx.fillStyle = "#f2f1ed"; ctx.fillRect(margin, imageY, width, imageHeight);
    let image: HTMLImageElement | null = null;
    if (shot.panel.imageUrl) {
      try {
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image(); img.crossOrigin = "anonymous";
          const timer = window.setTimeout(() => { img.src = ""; reject(new Error("Image load timed out")); }, 15000);
          img.onload = () => { clearTimeout(timer); resolve(img); }; img.onerror = () => { clearTimeout(timer); reject(new Error("Image load failed")); };
          img.src = shot.panel.imageUrl!;
        });
      } catch { warnings.push(`Shot ${shot.panel.panelNumber}: image unavailable`); }
    }
    if (image) {
      const scale = Math.min(width / image.naturalWidth, imageHeight / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      ctx.drawImage(image, margin + (width - w) / 2, imageY + (imageHeight - h) / 2, w, h);
    } else { ctx.fillStyle = "#555555"; ctx.font = "28px sans-serif"; ctx.fillText(shot.panel.imageUrl ? "Image unavailable" : "Image not generated", margin + 32, imageY + imageHeight / 2); }
    y += imageHeight + 44;
    text(!shot.panel.imageUrl ? "Image not generated" : shot.panel.imageNeedsReview ? "Image requires review" : shot.panel.imageApproved ? "Image approved" : "Image awaiting approval", 22);
    field("Story beat", shot.panel.storyBeat);
    field("Action", shot.panel.action);
    field("Camera and framing", shot.panel.cameraDirection);
    field("Setting", shot.panel.setting);
    field("Dialogue / narration", shot.panel.dialogueOrNarration);
    field("Sound", shot.panel.sound ?? "None recorded");
    field("Production note", shot.panel.productionNote);
  }
  flush();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFontSize(9); pdf.setTextColor(90);
    pdf.text(`Framewright | ${page} / ${pages}`, 196, 287, { align: "right" });
  }
  downloadFile("storyboard-production.pdf", pdf.output("blob"));
  return warnings;
}
