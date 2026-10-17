# Measured motion grammar of the original (optical flow on the upload, 30 fps, 4,700 frames)

Method: Farnebäck optical flow and frame differencing on the embedded video region (src: scratchpad/flow/flow.py). Plot: `motion_curves.png`, with flow p95, radial zoom (+ = push in) and frame difference; red lines are cuts, green lines are downbeats.

- **72 cuts in 156 s.** Mean shot 2.15 s, but median 0.90 s: the edit is bimodal.
  - **Long plates** (17.5 s open, 16.8 s spacetime, 9.6 s, 9.4 s): one continuous world, kept alive by camera moves and in-plate events.
  - **Burst slams** at every hook: 6–7 cuts in about 1.5 s (22.4–24.1, 58.9–60.2, 124.3–125.7 s), shots of 0.17–0.33 s with flow peaks of 90–150 px per frame (whip/slam speed).
- **Cuts on the beat:** 53% within one frame of a beat (the screen recording adds offset, so the true figure is higher).
- **Almost never static:** only 18% of frames are near-still (p95 flow < 0.3 px); 32% are fast (> 4 px/frame). Still frames are deliberate holds (a 0.5–1 s breath before a hit).
- **Beat-pulsed push-ins:** the zoom curve shows regular per-beat spikes inside plates (for example 42–52 s, 26–30 s, 97–100 s), small camera punches on kicks, not continuous drift.
- **Shot energy ladder:** quiet sections average 0.6–1.5 px/frame flow (breakdowns, the Ilya room); verses 2–5; hooks 8–27.

Rules for Silicon Shield, derived from this:
1. Alternate **long continuous plates** (8–18 s, one world, an evolving camera) with **burst sequences** (0.2–0.35 s shots) at hooks and transitions.
2. Every 1–2 beats something lands (a word, a hit, a camera punch); plan holds deliberately, never by accident.
3. Use camera punches and pushes synced to kicks (small, +2–5% scale with a fast decay); avoid floaty constant drift.
4. Keep an energy ladder per section: breakdown less than about 1.5 px/frame, verse 2–5, chorus and hook 8+.
5. Gate: our motion-QA script flags any stretch over 1.2 s with p95 below 0.3 px that is not marked as an intentional hold.
