// Units, body sizes, tuning constants and small maths helpers. No dependencies.

// Distances are in metres. S converts the old 2D pixel tuning into metres.
export const S = 0.015;
export const GRAVITY = 0.45 * S, RUN_SPEED = 7 * S, JUMP_V = 9.5 * S;
export const THIGH = 28 * S, SHIN = 28 * S, TORSO = 42 * S, NECK = 14 * S, UARM = 22 * S, FARM = 22 * S;
export const HEAD = 19 * S, JOINT_GAP = 5 * S;
export const HIP_W = 0.1, SH_W = 0.2, BODY_R = 0.22;
export const Z_MIN = -4.7, Z_MAX = 5.6;
export const CHUNK = 16, FAR_CHUNK = 160;
export const MAX_GANGSTERS = 3;
export const KICK_WINDUP = 6;

export function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, k) => a + (b - a) * k;
export const rot = (ox, oy, a) => ({ x: ox * Math.cos(a) - oy * Math.sin(a), y: ox * Math.sin(a) + oy * Math.cos(a) });
