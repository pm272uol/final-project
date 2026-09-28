import { WorkflowDiagnosticsProvider } from "@/components/WorkflowDiagnostics";
import { diagnosticsEnabled } from "@/lib/diagnostics/server";
import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Concept Art & Storyboard Orchestrator",
  description: "Turn rough scene ideas into production-ready storyboard packages.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WorkflowDiagnosticsProvider enabled={diagnosticsEnabled()}>{children}</WorkflowDiagnosticsProvider></body>
    </html>
  );
}
