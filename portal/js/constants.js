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
  maxSpeed: 175,                     // Portal walk speed (no sprint without the HEV suit)
  duckSpeedScale: 1 / 3,             // PLAYER_DUCKING_MULTIPLIER, ground only
  accelerate: 10,                    // sv_accelerate
  airAccelerate: 10,                 // sv_airaccelerate
  airWishCap: 30,                    // Source caps air wishspeed at 30
  friction: 4,                       // sv_friction
  stopSpeed: 100,                    // sv_stopspeed
  stepSize: 18,                      // sv_stepsize
  jumpSpeed: 160,                    // HL2/Portal 1 jump impulse: sqrt(2 * 600 * 21), ~21 units
  jumpBoost: 0.5,                    // forward-speed bonus on jump (0.1 while ducked), capped at 1.5x max speed
  groundLaunchSpeed: 140,            // NON_JUMP_VELOCITY: moving up faster than this = airborne
  duckTime: 0.4,                     // TIME_TO_DUCK (ground); ducking in the air is instant
  unduckTime: 0.2,                   // TIME_TO_UNDUCK
  useRadius: 80,                     // PLAYER_USE_RADIUS
  fallPunchThreshold: 303,           // PLAYER_FALL_PUNCH_THRESHOLD (HL2 gravity)
  stepSoundTime: 0.4,                // footstep interval while walking (+0.1 ducked)
  regenDelay: 1.0,                   // sv_regeneration_wait_time
  regenRate: 45,                     // health per second once regenerating (see docs/FIDELITY.md)
};

export const PORTAL = {
  halfWidth: 32,                     // prop_portal default half width
  halfHeight: 54,                    // prop_portal default half height: a 64 x 108 portal
  holeDepth: 64,                     // how far collision is "removed" behind a portal
  tunnelDepth: 28,
  surfaceOffset: 0.35,
  minFloorExitSpeed: 300,            // pop the player out of floor portals
  floorExitNudge: 90,
  funnelTime: 0.6,                   // sv_player_funnel_into_portals: steer bodies due to enter within this time
  shotRange: 16384,
};

export const CUBE = {
  half: 20,
  holdMaxSpeed: 3500,                // the carried object keeps up with flings
  dropError: 12,                     // CGrabController: let go when the averaged error passes 12 units
  dropGrace: 1,                      // ...which starts accumulating one second after pickup
  holdPitch: 75 * Math.PI / 180,     // carry pitch is clamped to +-75 degrees
  friction: 3,
};

export const PELLET = {
  radius: 10,
  speed: 420,                        // launcher default is 150; chambers set their own (ours: 420)
  lifetime: 12,                      // BallLifetime; passing a portal tops it up to MinLifeAfterPortal
  minLifeAfterPortal: 6,
};

export const COLORS = {
  blue: 0x2b8cff,
  orange: 0xff8a1c,
  blueGlow: 0x7fc0ff,
  orangeGlow: 0xffbe6e,
};
