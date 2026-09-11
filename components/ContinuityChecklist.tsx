"use client";
import type { StoryboardPackage } from "@/types/storyboard";
import { continuityChecklist } from "@/lib/continuityChecklist";

export function ContinuityChecklist({ data, busy, onChange }: { data: StoryboardPackage; busy: boolean; onChange: (board: StoryboardPackage) => void }) {
  const issues = continuityChecklist(data), reviews = data.continuityReview ?? {};
  const checked = issues.filter(i => reviews[i.id]?.checked).length;
  return <details className="paper-card p-5" aria-label="Continuity issue checklist">
    <summary className="font-bold cursor-pointer">Continuity issue checklist · {checked}/{issues.length} reviewed · {issues.filter(i => i.flagged && !reviews[i.id]?.checked).length} flags to review</summary>
    <p className="my-3 text-sm">These are text-based prompts for human review, not verified image errors. Cast, prop, wardrobe and location changes may be intentional. Checks do not approve or lock images. Relevant shot or reference changes reopen checks.</p>
    <fieldset disabled={busy} className="space-y-3">
      {issues.map(issue => <div key={issue.id} className="border p-3 space-y-2">
        <p className="font-bold">Shot {issue.panelNumber} · {issue.category}{issue.flagged ? " · Possible issue" : " · Visual check"}</p>
        <p className="text-sm">{issue.message}</p>
        <label className="block"><input type="checkbox" checked={reviews[issue.id]?.checked ?? false} onChange={e => onChange({ ...data, continuityReview: { ...reviews, [issue.id]: { note: reviews[issue.id]?.note ?? "", checked: e.target.checked } } })} />Reviewed shot {issue.panelNumber} {issue.category.toLowerCase()}</label>
        <label className="block text-sm">Review note<textarea className="block w-full border p-2" aria-label={`Shot ${issue.panelNumber} ${issue.category.toLowerCase()} review note`} maxLength={2000} value={reviews[issue.id]?.note ?? ""} onChange={e => onChange({ ...data, continuityReview: { ...reviews, [issue.id]: { checked: reviews[issue.id]?.checked ?? false, note: e.target.value } } })} /></label>
      </div>)}
    </fieldset>
  </details>;
}
