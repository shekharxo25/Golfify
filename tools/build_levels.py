#!/usr/bin/env python3
"""
Authoring script for the shipped course packs.

Walls are stored as explicit segments in the level format (SPEC section 9), but
for a hole whose playable area is one outline they are always the outline edges.
Deriving them here rather than typing them twice removes the single most common
hand-authoring bug: a green polygon and a wall list that disagree by a few
pixels, which reads in game as an invisible lip the ball catches on.

Run:  python tools/build_levels.py
"""

import json
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "sim", "level", "packs")


def rect(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def ring(poly):
    """Wall segments for every edge of a closed polygon."""
    return [
        {"a": poly[i], "b": poly[(i + 1) % len(poly)]}
        for i in range(len(poly))
    ]


def seg(ax, ay, bx, by):
    return {"a": [ax, ay], "b": [bx, by]}


def block(x, y, w, h):
    """Four wall segments forming a solid interior obstacle."""
    return ring(rect(x, y, w, h))


def hole(hid, par, bounds, tee, cup, outline, walls=None, hazards=None,
         elements=None, hint=None, seed=None):
    data = {
        "id": hid,
        "par": par,
        "bounds": {"x": bounds[0], "y": bounds[1], "w": bounds[2], "h": bounds[3]},
        "tee": list(tee),
        "cup": list(cup),
        "greens": [{"poly": outline}],
        "walls": ring(outline) + (walls or []),
        "hazards": hazards or [],
        "elements": elements or [],
    }
    if hint:
        data["hint"] = hint
    if seed is not None:
        data["seed"] = seed
    return data


def sand(x, y, w, h):
    return {"type": "sand", "poly": rect(x, y, w, h)}


def water(x, y, w, h):
    return {"type": "water", "poly": rect(x, y, w, h)}


def ice(x, y, w, h):
    return {"type": "ice", "poly": rect(x, y, w, h)}


def rough(x, y, w, h):
    return {"type": "rough", "poly": rect(x, y, w, h)}


def bumper(x, y, r=26):
    return {"type": "bumper", "c": [x, y], "r": r}


def boost(x, y, w, h, dx, dy, mult=1.8):
    return {"type": "boost", "poly": rect(x, y, w, h), "dir": [dx, dy], "mult": mult}


def conveyor(x, y, w, h, dx, dy, accel=900):
    return {"type": "conveyor", "poly": rect(x, y, w, h), "dir": [dx, dy], "accel": accel}


def portal(ax, ay, afacing, bx, by, bfacing, r=30):
    return {
        "type": "portal",
        "a": {"c": [ax, ay], "r": r, "facing": afacing},
        "b": {"c": [bx, by], "r": r, "facing": bfacing},
    }


def windmill(x, y, blade_len, blades, rpm, phase=0):
    return {
        "type": "windmill",
        "c": [x, y],
        "bladeLen": blade_len,
        "bladeCount": blades,
        "rpm": rpm,
        "phase": phase,
    }


def mover(x, y, w, h, travel_x, travel_y, period_ms, phase=0):
    """A solid rectangular block sliding along a straight path."""
    return {
        "type": "mover",
        "segs": block(x, y, w, h),
        "path": [[0, 0], [travel_x, travel_y]],
        "periodMs": period_ms,
        "phase": phase,
    }


UP = (0, -1)
HALF_PI = 1.5707963267948966

# ------------------------------------------------------------------ #
# Pack 1 — the elements that do not move
# ------------------------------------------------------------------ #

PACK1 = [
    # 1. Straight. Nothing but aim and power.
    hole("p1h1", 2, (0, 0, 720, 1280), (360, 1060), (360, 240),
         rect(110, 120, 500, 1040),
         hint="straight"),

    # 2. Dog-leg. The corner cannot be cut, so the bank shot teaches itself.
    hole("p1h2", 3, (0, 0, 720, 1400), (500, 1200), (200, 280),
         [[390, 1300], [610, 1300], [610, 180], [110, 180], [110, 380], [390, 380]],
         hint="bank_left"),

    # 3. Sand across the fairway: the first real penalty for a lazy line.
    hole("p1h3", 3, (0, 0, 720, 1400), (360, 1180), (360, 240),
         rect(110, 120, 500, 1160),
         hazards=[sand(180, 600, 360, 220)],
         hint="around_sand"),

    # 4. Water with one bridge. Thread it or pay a stroke.
    hole("p1h4", 3, (0, 0, 720, 1500), (300, 1350), (300, 240),
         rect(110, 120, 500, 1300),
         hazards=[water(110, 700, 310, 140), water(520, 700, 90, 140)],
         hint="thread_bridge"),

    # 5. One bumper, dead on the line. Pinball, introduced in isolation.
    hole("p1h5", 3, (0, 0, 720, 1400), (360, 1200), (360, 240),
         rect(90, 120, 540, 1160),
         elements=[bumper(360, 700, 40), bumper(200, 470), bumper(520, 470)],
         hint="off_the_bumper"),

    # 6. Long hole, one boost pad. Reaching the cup without it is the challenge.
    hole("p1h6", 3, (0, 0, 720, 1800), (360, 1580), (360, 220),
         rect(110, 120, 500, 1560),
         elements=[boost(280, 1100, 160, 160, *UP, 1.8)],
         hint="ride_the_boost"),

    # 7. A narrow mown lane through rough. Accuracy over power.
    hole("p1h7", 3, (0, 0, 720, 1400), (360, 1200), (360, 220),
         rect(90, 120, 540, 1160),
         hazards=[rough(90, 240, 210, 760), rough(420, 240, 210, 760)],
         hint="stay_in_the_lane"),

    # 8. Serpentine. Two banks minimum, sand punishing the wide line.
    hole("p1h8", 4, (0, 0, 720, 1600), (500, 1400), (450, 260),
         [[110, 1480], [610, 1480], [610, 1200], [430, 1200], [430, 780],
          [610, 780], [610, 160], [290, 160], [290, 780], [110, 780]],
         hazards=[sand(150, 850, 180, 200)],
         elements=[bumper(270, 1080)],
         hint="double_bank"),

    # 9. Finale: boost into a channel between two lakes.
    hole("p1h9", 4, (0, 0, 720, 1600), (360, 1400), (360, 230),
         rect(80, 120, 560, 1360),
         hazards=[water(80, 340, 220, 300), water(420, 340, 220, 300)],
         elements=[
             boost(300, 900, 120, 120, *UP, 1.6),
             bumper(200, 1050),
             bumper(520, 1050),
         ],
         hint="boost_the_channel"),
]

# ------------------------------------------------------------------ #
# Pack 2 — the elements that move
# ------------------------------------------------------------------ #

PACK2 = [
    # 1. A sheet of ice. Almost no friction: power control is everything.
    hole("p2h1", 3, (0, 0, 720, 1400), (360, 1200), (360, 230),
         rect(110, 120, 500, 1160),
         hazards=[ice(160, 400, 400, 600)],
         hint="ice_control"),

    # 2. A sealed upper chamber. The portal is the only way in.
    hole("p2h2", 3, (0, 0, 720, 1400), (360, 1180), (360, 230),
         rect(110, 120, 500, 1160),
         walls=[seg(110, 700, 610, 700)],
         elements=[portal(360, 860, -HALF_PI, 360, 560, -HALF_PI)],
         hint="through_the_portal"),

    # 3. A sliding gate. Read the rhythm, then commit.
    hole("p2h3", 3, (0, 0, 720, 1450), (360, 1250), (360, 230),
         rect(110, 120, 500, 1210),
         walls=[seg(110, 700, 250, 700), seg(470, 700, 610, 700)],
         elements=[mover(250, 680, 140, 40, 80, 0, 2600)],
         hint="time_the_gate"),

    # 4. The windmill, walled in so there is no way around it.
    hole("p2h4", 3, (0, 0, 720, 1450), (360, 1250), (360, 240),
         rect(100, 120, 520, 1210),
         walls=[seg(100, 700, 190, 700), seg(530, 700, 620, 700)],
         elements=[windmill(360, 700, 170, 4, 8)],
         hint="through_the_blades"),

    # 5. A belt pushing right. Every line across it needs an allowance.
    hole("p2h5", 3, (0, 0, 720, 1450), (480, 1250), (240, 240),
         rect(110, 120, 500, 1210),
         elements=[conveyor(160, 600, 400, 300, 1, 0, 900)],
         hint="aim_off_the_belt"),

    # 6. Ice below, a gap above, and a portal for anyone who spots it.
    hole("p2h6", 4, (0, 0, 720, 1500), (360, 1300), (520, 200),
         rect(100, 120, 520, 1260),
         walls=[seg(100, 420, 440, 420)],
         hazards=[ice(140, 760, 440, 340)],
         elements=[portal(200, 600, 0, 520, 320, 0), bumper(300, 500), bumper(400, 620)],
         hint="portal_shortcut"),

    # 7. Blades over water. Miss the timing and you pay twice.
    hole("p2h7", 4, (0, 0, 720, 1550), (360, 1350), (360, 220),
         rect(100, 120, 520, 1310),
         hazards=[water(100, 900, 240, 220), water(420, 900, 200, 220)],
         elements=[windmill(360, 520, 180, 3, 9)],
         hint="thread_then_time"),

    # 8. A belt that drags you off the gate, and bumpers past it.
    hole("p2h8", 4, (0, 0, 720, 1600), (400, 1400), (300, 220),
         rect(100, 120, 520, 1360),
         walls=[seg(100, 640, 220, 640), seg(500, 640, 620, 640)],
         elements=[
             conveyor(140, 1000, 440, 260, -1, 0, 800),
             mover(220, 620, 160, 40, 120, 0, 2400),
             bumper(300, 380),
             bumper(420, 380),
         ],
         hint="belt_then_gate"),

    # 9. Everything, once, in order. The ad creative shot.
    hole("p2h9", 5, (0, 0, 720, 1900), (360, 1700), (360, 180),
         rect(90, 120, 540, 1660),
         hazards=[
             sand(120, 1300, 220, 160),
             ice(380, 1080, 240, 180),
             water(90, 560, 230, 160),
             water(400, 560, 230, 160),
         ],
         elements=[
             boost(300, 1500, 120, 120, *UP, 1.5),
             conveyor(120, 880, 500, 160, 1, 0, 700),
             bumper(200, 780),
             bumper(520, 780),
             windmill(360, 400, 150, 4, 11),
             portal(150, 260, -HALF_PI, 560, 220, -HALF_PI),
         ],
         hint="the_whole_circus"),
]

# ------------------------------------------------------------------ #
# Dev hole: every element type at once (Phase 4 gate)
# ------------------------------------------------------------------ #

DEV = hole(
    "devAll", 5, (0, 0, 720, 1900), (360, 1760), (360, 200),
    rect(80, 120, 560, 1700),
    walls=[seg(80, 640, 240, 640), seg(480, 640, 640, 640)],
    hazards=[
        sand(110, 1440, 200, 160),
        rough(360, 1440, 260, 160),
        water(110, 1180, 200, 150),
        ice(380, 1180, 240, 150),
    ],
    elements=[
        boost(300, 1620, 120, 100, *UP, 1.6),
        conveyor(110, 940, 500, 160, 1, 0, 800),
        bumper(220, 820),
        bumper(500, 820),
        mover(240, 620, 160, 40, 80, 0, 2400),
        windmill(360, 400, 150, 4, 10),
        portal(160, 260, -HALF_PI, 560, 250, -HALF_PI),
    ],
    hint="dev_all_elements",
)


def write(name, payload):
    path = os.path.abspath(os.path.join(OUT_DIR, name))
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    print("wrote", os.path.relpath(path))


def main():
    os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)
    write("pack1.json", {"id": "pack1", "index": 0, "holes": PACK1})
    write("pack2.json", {"id": "pack2", "index": 1, "holes": PACK2})
    write("dev.json", {"id": "dev", "index": 99, "holes": [DEV]})


if __name__ == "__main__":
    main()
