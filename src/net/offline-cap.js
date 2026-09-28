// src/net/offline-cap.js — the away limit, in hours, from the server's own meter.
// The inverse of vigourGrantMin (src/core/hunt.js): grant_min = max(720, hr_offline_cap_ms/60000),
// exact only because VIGOUR_FLOOR_MIN 720 == c_base_h*60 (2026-08-11-accrual.sql, 2026-09-25 hr_vigour_of).
export function capHoursFromVigour(v) {
  const m = v && typeof v === 'object' ? Number(v.grant_min) : NaN;
  return (Number.isFinite(m) && m > 0) ? m / 60 : null;
}
