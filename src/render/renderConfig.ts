/**
 * Render-only tuning. Camera, layout, animation timings — anything that could
 * change without altering a single ball trajectory.
 */

/** Logical design resolution; Phaser.Scale.FIT letterboxes to this (CLAUDE.md). */
export const VIEW_W = 720;
export const VIEW_H = 1280;

/* Camera ---------------------------------------------------------- */

export const CAM_FOLLOW_LERP = 0.09;
/** Zoom used while playing, and the wider one used for the read-the-hole move. */
export const CAM_PLAY_ZOOM = 1;
export const CAM_READ_PAD = 40;
/** Length of the opening pan from cup back to tee, in ms. */
export const CAM_READ_MS = 1150;
export const CAM_SETTLE_MS = 420;
/** Extra world margin the camera may pan into beyond the hole bounds. */
export const CAM_PAN_MARGIN = 90;
export const CAM_MIN_ZOOM = 0.55;
export const CAM_MAX_ZOOM = 1.6;

/* Layers ---------------------------------------------------------- */

export const DEPTH = {
  ground: 0,
  surfaces: 10,
  decals: 20,
  cup: 30,
  elements: 40,
  walls: 50,
  ghost: 55,
  preview: 60,
  ball: 70,
  fx: 80,
  aim: 90,
  hud: 1000,
  overlay: 1100,
} as const;

/* Ball and trail -------------------------------------------------- */

export const TRAIL_POINTS = 16;
export const TRAIL_MIN_SPEED = 220;
export const SQUASH_MAX = 0.22;
export const SQUASH_RECOVER_MS = 130;

/* Aiming ---------------------------------------------------------- */

export const AIM_RING_RADIUS = 34;
export const AIM_ARROW_MAX = 150;
export const PREVIEW_DOT_R = 4.5;
/** Pointer travel in screen px before a drag stops counting as a tap. */
export const TAP_SLOP = 10;
export const TAP_MS = 250;

/* HUD ------------------------------------------------------------- */

export const HUD_MARGIN = 26;
export const PIP_R = 7;
export const PIP_GAP = 20;

/* Transitions ----------------------------------------------------- */

export const FADE_MS = 260;
export const RESULT_DELAY_MS = 520;
export const STAR_POP_MS = 220;

/* Effects --------------------------------------------------------- */

export const SPARK_LIFE_MS = 420;
export const RIPPLE_LIFE_MS = 620;
/** Screen shake magnitude for a hard wall hit, at max speed. */
export const SHAKE_MAX = 0.0045;
