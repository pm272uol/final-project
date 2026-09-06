export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};
export function estimateCost(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  pricing?: ModelPricing,
) {
  if (
    !pricing ||
    usage?.inputTokens === undefined ||
    usage.outputTokens === undefined
  )
    return undefined;
  return (
    (usage.inputTokens * pricing.inputPerMillion +
      usage.outputTokens * pricing.outputPerMillion) /
    1_000_000
  );
}
