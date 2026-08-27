# ADR-0018: The exported BOM carries rendered views

## Status

Accepted.

## Context

The BOM PDF was a parts list: a page of names, part numbers and quantities. The client asked for it
to also show the system — "5 total screen grabs, one from each diagonal angle, and then a
top-down" — so that a document handed to someone who was not at the screen says what was built and
not only what it is made of.

The pictures have to come from somewhere. The scene exists only in a WebGL context inside the
running viewport, and there is no server: PTSBLite is static files with a `connect-src 'none'`
policy, so nothing can be rendered anywhere else.

## Decision

The viewport renders the five views on request and hands them back as JPEG bytes. `generateBomPdf`
takes them as an option and appends them, two to a page, after the parts list.

Four things about the capture are deliberate.

**The angles are the View menu's.** One `STANDARD_VIEWS` list serves both, so a page of the document
and the screen can be put in the same pose, and each picture is captioned with the name the menu
uses.

**Rendered at a fixed 1280 x 800**, not at the size of the browser window, so a document does not
change shape with whoever exported it.

**Every transient affordance is hidden first** — the placement ghost, the port glows, the landing
highlights and floor shadows, the height markers. Which of those is on screen depends on the tool
that happens to be armed when the button is pressed, and a document that varies with that is a poor
record of a design.

**Framed on the design together with its room**, rather than reusing wherever the camera is parked.
Framing the parts alone gives every design a different scale and a one-part design an extreme
close-up of it.

The read-back is `toDataURL` in the same synchronous turn as the render it follows. The drawing
buffer is not preserved between frames, so anything that let the browser present first would read
back a cleared canvas.

## Consequences

- A BOM PDF is now on the order of a megabyte rather than a few kilobytes. It is a download, not a
  payload sent anywhere, so the cost is the visitor's disk and nothing else.
- The document depends on WebGL. A browser without it exports the parts list alone rather than
  failing — `captureRef` is simply never filled in.
- Changing `STANDARD_VIEWS` changes every exported document as well as the View menu. That is the
  point of sharing the list, and the reason it is a constant rather than a setting.
- The no-money guarantee (ADR-0011) is unaffected: the pictures are of geometry, and `BomRow` still
  cannot carry a price.
