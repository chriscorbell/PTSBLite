# ADR-0026: Parts are modelled from marketing media, not from CAD

- **Status:** Accepted
- **Date:** 2026-08-31

The blower and terminal in the viewport were invented: a grey box with a motor drum on it, and a
taller grey box with a display panel. They were placeholders for parts modelled from real geometry,
and the repository had been asking Kelly Tube Systems for CAD files or dimensioned drawings so that
could happen.

Asked directly whether the photographs and drawings at
[kellytubesystems.com/kel2020](https://kellytubesystems.com/kel2020/) would do instead, the client
answered on 2026-08-30: *"pretty but approximate is totally fine as the final build. Let's try to do
it this way (using the website to model things). A blower should, height wise, fill a 1 ft grid
unit. A terminal (KEL2020) should, height wise, fill 2 feet of grid unit. Do NOT re draw/model the
tubes or bends - what exists now is good enough anyway."*

So the parts are modelled from the media, and this is the final Lite appearance rather than a
placeholder for a later pass.

**What the media supplies is shape, proportion and finish, and nothing else.** The photographs carry
no measurements, so nothing dimensional is read off them. Every size in the model still comes from
the app: 1 cell is 1 ft (ADR-0001), a terminal is 2 ft tall (ADR-0021), a blower fills one cell, and
the tube radius is `TUBE_R`. Where a proportion in a photograph disagrees with one of those, the app
wins and the model is stretched to fit. That division is the whole reason approximate is safe here —
an approximate *picture* misleads nobody, whereas an approximate *dimension* would flow into the
parts list and into what the app tells someone will fit in their building.

**Tubes and bends are untouched**, as the client asked. Split sleeves are modelled from the same
media (ADR-0022).

What the units became:

- A **blower** is the black power unit at the foot of a Kel2020 stack: a drum with a stepped neck, a
  metal collar where the tube leaves it, and a green power light. Its axis is its port axis, because
  `dirToQuat` turns the whole group to face the port — so a blower with its hole up stands on the
  floor the way the real unit does, and one turned to a side lies along its own run.
- A **terminal** is the clear barrel a carrier is loaded into: ribbed, held between two brushed
  collars, with the slotted door and its green wordmark across the front and the send button on the
  lower collar. The body still stands upright whichever way its ports are turned, for the reason
  `buildTerminalMesh` already gave.

Two departures from the photographs, both deliberate and both about the viewport rather than the
hardware:

- **The power unit is graphite, not black.** The viewport's ground is `#10141b` and a room's floor
  `#1a202b`. A true black drum standing on either disappears into it.
- **Metalness stays below about a third.** The scene has no environment map, so a physically
  metallic surface has nothing to reflect and renders near-black. The brushed collars came out
  indistinguishable from the barrel between them at metalness 0.6.

**Part names and numbers are still invented.** Photographs cannot supply a catalogue, so ADR-0013
stands unchanged and the board still carries the open question. Modelling the parts has made that
gap easier to miss, not smaller: the units now look like Kel2020 hardware while the BOM still names
them `BL-2020-A` and `TM-2020-S`.
