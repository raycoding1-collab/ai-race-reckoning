# Gameplay fidelity notes

These are the public facts the physics and gameplay code is checked against. The target is Portal 1, using Portal 2 where the two games agree. Sources are Valve's public Source SDK 2013 ([SDK]), the community FGDs ([FGD]), the Valve Developer Community wiki ([VDC]), and speedrun wikis. No Valve code or assets are copied. Only numbers and described behaviour are used. "Kept" means our value already matched, or a change would break chamber designs (the reason is given).

[SDK]: https://github.com/ValveSoftware/source-sdk-2013
[FGD]: https://github.com/TeamSpen210/HammerAddons

## Player movement (`js/player.js`, `js/physics.js`)

| Fact | Source | Before | After |
|---|---|---|---|
| Gravity 600 (`sv_gravity`, HL2 lineage) | [movevars_shared.cpp][mv], [shareddefs.h][sd] | 600 | kept |
| Per-axis speed cap 3500 (`sv_maxvelocity`, "per axis"). No separate documented player terminal velocity; one community test reports top speed after about 1216 units of drop ([TWP][twp]). | [movevars_shared.cpp][mv] | 3500 per axis | kept |
| Friction 4, stop speed 100, ground accelerate 10, air accelerate 10, air wishspeed cap 30 | [movevars_shared.cpp][mv], [gamemovement.cpp][gm] | same | kept. Portal 2 drops air control above about 300 u/s ([P2SR][p2bh]); Portal 1 keeps Source's standard air strafing, so it is not applied. |
| Walk speed 175, no sprint without the HEV suit; crouched ground speed x1/3 | [SourceRuns ABH][abh] | 175, 1/3 | kept |
| Move keys are scaled down to max speed before use (`forwardmove`) | [gamemovement.cpp][gm] | not modelled | used for the jump bonus |
| Jump: `flMul = 160` (about 21 units) for HL2-based games at gravity 600. Crouch-jumping reaches about 56 units. | [gamemovement.cpp][gm] CheckJumpButton, [VDC Dimensions][dim] | 232 (45 units) | **160** (measured 20.7 units, crouch-jump 56.7). The ledge-reachability check (below) found no chamber route that needs the old 81-unit crouch-jump. |
| Jump bonus: adds 50% of forwardmove along the view (10% ducked), clipped to 1.5x max speed. This is also what makes ABH possible in Portal 1. | [gamemovement.cpp][gm], [SourceRuns ABH][abh] | none | **added** (a forward jump from a run reaches 262.5 u/s) |
| Jump needs a fresh press; airborne when rising faster than 140 (NON_JUMP_VELOCITY) | [gamemovement.cpp][gm] | same | kept |
| Ducking on the ground takes TIME_TO_DUCK = 0.4 s and the hull shrinks at the end. Standing up takes 0.2 s and needs headroom. In the air both happen at once, with the head kept in place (crouch-jump). | [shareddefs.h][sd] | 0.2 s eye lerp, instant hull | **0.4 s / 0.2 s**, spline view transition |
| Hull 32x32x72, crouched 36, eye 64 / 28 | [VDC Dimensions][dim] | same | kept |
| Step height 18 (`sv_stepsize`), StepMove: try again 18 higher, settle down, keep the further result | [movevars_shared.cpp][mv], [gamemovement.cpp][gm] | **none** (any lip blocked you) | **added** (16-unit box walked onto, 24-unit box blocks) |
| Slopes: the world is an axis-aligned voxel grid with no slopes | n/a | n/a | n/a |
| Landing punch: roll = fall speed x 0.013 degrees once fall speed is at least 303 (PLAYER_FALL_PUNCH_THRESHOLD), decayed by a damped spring (damping 9, spring 65). The punch moves the view only, not the aim. | [gamemovement.cpp][gm], [shareddefs.h][sd] | none, and landing went undetected when the ground snap caught the player first | **added**, landing detection fixed |
| Footsteps are time-based: every 400 ms when walking below 220 u/s, +100 ms crouched. Portal plays them at any speed (challenge-mode step counting). | [baseplayer_shared.cpp][bp] | every 72 units travelled | **400 / 500 ms** |
| Fall damage: none (long fall boots) | game fact | none | kept |
| Health regeneration: Portal-style regen with `sv_regeneration_wait_time` 1.0. The VDC tutorial's `sv_regeneration_rate` default (0.5, from Alien Swarm) is not confirmed for Portal. | [VDC Regenerating Health][regen] | 1.2 s delay, 45 hp/s | **1.0 s** delay. Rate kept at 45 hp/s because the turret chambers are tuned to it. |
| Use radius 80 (PLAYER_USE_RADIUS), measured horizontally from the eye and vertically from the hull, so things at your feet are in reach. The trace goes through portals. | [baseplayer_shared.h/.cpp][bp] | 90 along the ray | **80, Source metric**. The use cone now needs line of sight. |

## Portals (`js/portal.js`, `js/physics.js`, `js/game.js`)

| Fact | Source | Before | After |
|---|---|---|---|
| Portal size: half width 32, half height 54, so 64 x 108 (not 64 x 112) | [VDC prop_portal][pp] | 64 x 112 | **64 x 108** |
| Placement bumps a portal away from edges and away from the other portal (`sv_portal_placement_never_bump` turns it off). P2SR gives a maximum bump of 65 units past the other portal. | [VDC][bump], [P2SR][ppt] | edge fitting plus overlap bump | kept |
| Shots stop at glass and at emancipation grills; any non-portalable hit gives the fail effect and leaves the old portal | game fact | same | kept |
| Portals only go on static portalable surfaces. Moving platforms and doors refuse them, so a portal can never ride a moving surface (a Portal 1 portal on a moving surface fizzles). | game fact | same | kept |
| Momentum: the velocity is rotated by the portal pair's transform; the speed is kept | game fact | same | kept |
| Floor-to-floor exits: we push the player out at 300 u/s at least, so they don't sink straight back in | design | 300 | kept (chambers 03 and 07 are built around it) |
| Funnelling (`sv_player_funnel_into_portals` 1, `sv_props_funnel_into_portals`): bodies moving fast at a portal are steered so they enter cleanly instead of clipping the rim. The player must be facing it. | [VDC Portal Funneling][fun] | standing over a floor portal only | **added for players and props**: in flight, toward any portal within 0.6 s, sideways velocity only. A drop 40 units off-centre now goes in; 56 units off (a clear miss) is left alone. |
| After a tilted portal the view rolls back upright | game fact | exponential, rate 7/s | kept |
| Portal 1 places portals after a short think delay; Portal 2 places them at once and removed the gun's fire delay. Neither delay is published. | [Portal Wiki, Reportal][rep] | 0.33 s refire, instant placement | kept (no public number) |
| Both-placed crosshair state and the fail effect on bad surfaces | game fact | present | kept |

## Objects (`js/game.js` carry, `js/entities.js`)

| Fact | Source | Before | After |
|---|---|---|---|
| Carry distance: the object's centre is held `24 + radius` from the eye. `radius` = player half-diagonal (22.6) + the object's extent along the view, which is about 67 for our cube. If a wall is nearer than half of `24 + 2 x radius`, the object is held in close. It never comes inside the player's radius. | [weapon_physcannon.cpp][pc] UpdateObject | fixed 80 | **Source formula** (plus the box is kept out of walls) |
| Carry pitch clamped to +-75 degrees | same | none | **added** |
| Drop rule: let go when the position error, averaged over about 1 s, passes 12 units. Averaging starts 1 s after the pickup. Also let go when the player stands on the object. | same, ComputeError | more than 110 units for 0.25 s | **12-unit averaged error**. The carried object also follows the target's own motion, so it keeps up through turns and flings and is dropped only when it really snags. |
| Carried objects keep their yaw relative to the view, and can be carried and handed through portals | game fact | same | kept |
| Fire while carrying drops the object (Portal has no throw) | game fact | same | kept |
| Buttons are pressed by the player or a cube (cube-only variants exist) | game fact | same | kept |
| Grills dissolve cubes and clear the player's portals; a carried cube is lost | game fact | same | kept |
| Energy pellet launcher: speed 150 by default (chambers set their own), lifetime 12 s, MinLifeAfterPortal 6, one pellet alive at a time | [FGD point_energy_ball_launcher][eb] | 420, 12, 6 | defaults kept, and a launcher may now set `speed`. 420 is kept because the chamber timings rely on it. |
| Faith plates: `trigger_catapult` playerSpeed/physicsSpeed 450; with a launch target the flight adds upward velocity, and "Use Exact Velocity" flies at exactly that speed (two arcs). Targeted launches suppress air control for a quarter second. | [FGD trigger_catapult][cat] | apex-height aiming only | `speed` (default 450) and `exact` added, plus a **0.25 s air-control lock**. Our chambers keep their apex values, which are tuned to their ledges. |
| Turrets: range always 1500 in Portal 1, 120-degree sight cone, no shooting through portals | [FGD npc_portal_turret_floor][tur] | 1700, about 106 degrees | **1500, 120 degrees** |
| Turret damage per bullet and rate of fire | not published | 3 hp, 10/s, 60% hits | kept |
| Turrets topple when pushed, dropped or hit, then spray and die; they can be picked up | game fact | same | kept |
| Goo is instant death | game fact | same | kept |

## Ledge check for the jump change

Each chamber's walkable floor was flood-filled with 1-cell climbs (the 21-unit crouch-jump) and with 2-cell climbs (the old 45-unit crouch-jump). Cells lost with the new jump appear only in chambers 02, 08, 11 and 12. In 02 and 08 they are reachable only by first walking through goo. In 11 the lost cells are the observation booth, which the old jump could climb into. In 12 they are the top of the start ledge, which no route needs to climb back onto. Both scripted playthroughs pass unchanged.

[mv]: https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/movevars_shared.cpp
[gm]: https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/gamemovement.cpp
[sd]: https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/shareddefs.h
[bp]: https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/baseplayer_shared.cpp
[pc]: https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/hl2/weapon_physcannon.cpp
[dim]: https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source)
[pp]: https://developer.valvesoftware.com/wiki/Prop_portal
[bump]: https://developer.valvesoftware.com/wiki/Sv_portal_placement_never_bump
[ppt]: https://wiki.portal2.sr/Portal_Placement_Tricks
[fun]: https://developer.valvesoftware.com/wiki/Portal_Funneling
[rep]: https://wiki.portal2.sr/Reportal
[regen]: https://developer.valvesoftware.com/wiki/Regenerating_Health
[abh]: https://wiki.sourceruns.org/Accelerated-Back-Hopping.html
[p2bh]: https://wiki.portal2.sr/Bunnyhopping_help
[twp]: https://thinking.withportals.com/topic/terminal-velocity-distance
[eb]: https://github.com/TeamSpen210/HammerAddons/blob/master/fgd/point/point/point_energy_ball_launcher.fgd
[cat]: https://github.com/TeamSpen210/HammerAddons/blob/master/fgd/brush/trigger/trigger_catapult.fgd
[tur]: https://github.com/TeamSpen210/HammerAddons/blob/master/fgd/point/npc/npc_portal_turret_floor.fgd
