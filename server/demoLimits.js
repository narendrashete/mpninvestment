// Soft caps for the public "primedemo" login (group DEMO) only. That one
// login gets handed to multiple leads to test concurrently against the same
// shared sandbox, so growth needs a hard ceiling independent of the nightly
// reset (see server/seed/reset-demo.js). Numbers are generous headroom over
// the seeded baseline (noted per key below), not a real capacity limit.
// MPN and RPS are never subject to these — assertDemoLimit no-ops for them.
export const DEMO_LIMITS = {
  investments: 60, // seeded baseline: 13
  holdings: 60, // seeded baseline: 10
  holders: 15, // seeded baseline: 3
  investmentNames: 20, // seeded baseline: 8
  licPlans: 10, // seeded baseline: 2
  licPolicies: 30, // seeded baseline: 5
  healthPolicies: 30, // seeded baseline: 3
  healthDocBytes: 100 * 1024 * 1024, // seeded baseline: 0 (demo ships with no PDFs attached)
  licDocBytes: 100 * 1024 * 1024, // seeded baseline: 0 (demo ships with no PDFs attached)
  licPremiumDocBytes: 100 * 1024 * 1024, // seeded baseline: 0 (premium receipts/cheque scans)
  healthPremiumDocBytes: 100 * 1024 * 1024 // seeded baseline: 0 (premium receipts/cheque scans)
};

// Throws once `group` is DEMO and `count` has already reached the limit for
// `limitKey`. No-op for every other group.
export function assertDemoLimit(group, count, limitKey, label) {
  if (group !== 'DEMO') return;
  const limit = DEMO_LIMITS[limitKey];
  if (count >= limit) {
    throw new Error(`Demo data limit reached (max ${limit} ${label}) — the demo sandbox resets nightly, try again after the reset.`);
  }
}
