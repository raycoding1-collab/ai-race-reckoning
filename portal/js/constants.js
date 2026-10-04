// All distances are in Source-engine "units" (1 unit ~ 1 inch), so the
// numbers below can be compared directly with the original game's cvars.
export const CELL = 32;              // level grid resolution
export const TICK = 1 / 120;         // fixed physics step

export const GRAVITY = 600;          // sv_gravity (Portal)
export const MAX_VELOCITY = 3500;    // sv_maxvelocity (per-axis clamp)

export const PLAYER = {
  halfWidth: 16,                     // 32 x 32 hull
  height: 72,
  duckHeight: 36,
  eyeHeight: 64,
  duckEyeHeight: 28,
  maxSpeed: 175,                     // Portal walk/run speed
  duckSpeedScale: 1 / 3,
  accelerate: 10,                    // sv_accelerate
  airAccelerate: 10,                 // sv_airaccelerate
  airWishCap: 30,                    // Source caps air wishspeed at 30
  friction: 4,                       // sv_friction
  stopSpeed: 100,                    // sv_stopspeed
  jumpSpeed: Math.sqrt(2 * 600 * 45),// 45 unit jump
  groundLaunchSpeed: 140,            // moving up faster than this = airborne
  duckTime: 0.2,
  useDistance: 90,
};

export const PORTAL = {
  halfWidth: 32,
  halfHeight: 56,
  holeDepth: 64,                     // how far collision is "removed" behind a portal
  tunnelDepth: 28,
  surfaceOffset: 0.35,
  minFloorExitSpeed: 300,            // pop the player out of floor portals
  floorExitNudge: 90,
  shotRange: 16384,
};

export const CUBE = {
  half: 20,
  holdDistance: 60,
  holdMaxSpeed: 1400,
  dropDistance: 110,
  friction: 3,
};

export const PELLET = {
  radius: 10,
  speed: 420,
  lifetime: 11,
};

export const COLORS = {
  blue: 0x2b8cff,
  orange: 0xff8a1c,
  blueGlow: 0x7fc0ff,
  orangeGlow: 0xffbe6e,
};
