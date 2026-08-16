# ADR-0009: Component styling lives in colocated stylesheets

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

The renderer had **three** styling mechanisms, and which one a rule used was down to whichever was
nearest when it was written:

1. **260 `style=` props** — 232 object literals inline in JSX, plus 28 shared `CSSProperties`
   constants (`inputStyle`, `iconBtn`, `kbdStyle`, `labelStyle`, `th`, `td`, …).
2. **`src/styles/app.css`** — 119 lines holding the design tokens, a reset, the app shell, and a
   handful of utility classes.
3. **Components injecting global CSS at render time** — including a `<style>` block in `TopBar.tsx`
   defining `.topbtn` and `.filemenu-item`.

The third is the worst of the three and shows what the absence of a convention cost. The rules were
global despite living in a component, re-inserted into the document on every render, and ordered by
mount rather than by cascade.

The inline majority cost something subtler. With no stylesheet to put a rule in, reuse had to happen
in JavaScript, and where that meant threading props it did not happen at all. `LeftRail.tsx` defines
a `RailTooltip` component, uses it once, and then repeats its fifteen-property style object verbatim
in two more places in the same file. Hover was reimplemented five times as `useState` plus
`onMouseEnter`/`onMouseLeave`, costing a React render per pointer movement to do what `:hover` does
for free.

This matters now specifically because the client's requirements have not arrived. Whatever they ask
for will land on this layer hardest, and it is currently the layer where reading a component means
reading its styling interleaved with its logic.

## Decision

**Component styling lives in a plain CSS file colocated with the component**: `LeftRail.css` sits
beside `LeftRail.tsx` and is imported by it.

- **Class names are component-prefixed**, BEM-ish: `.left-rail`, `.left-rail__tooltip`,
  `.left-rail__button--active`. Prefixes are how collisions are avoided; there is no scoping tool.
- **State is expressed through selectors**, using the ARIA and `data-` attributes a component
  already sets (`[aria-pressed="true"]`, `[data-level="error"]`) or an explicit modifier class.
  Never by branching in JavaScript to produce a different style object.
- **`src/styles/app.css` keeps only** design tokens, the reset, app-shell layout, and primitives
  genuinely shared by more than one component (`.topbtn`, `.filemenu-item`, `.nosel`).
- **No `<style>` blocks in components.** Ever.
- **`style=` is reserved for values computed at runtime** that CSS cannot know. There are currently
  no permitted exceptions.

A value with a finite set of states is not an exception — it is a modifier class. A numeric value a
native element can carry is not an exception either: a progress bar is `<progress value>`, not an
inline `width`.

## Alternatives rejected

**CSS Modules.** The genuine argument for them was provable co-deletion: delete the component,
delete its styles, with no orphan rules left behind. Colocating a plain stylesheet gets exactly the
same property. What remained was automatic scoping versus a naming convention, and for twelve
components that did not outweigh keeping class names greppable end to end — the string in the source
is the string in the devtools inspector. Worth noting they would have cost nothing to adopt: Vite
compiles `*.module.css` with no dependency and no configuration. The decision is about legibility,
not tooling cost.

**Tailwind, or a CSS-in-JS library.** A dependency, a build step, a configuration file, and an idiom
every future contributor has to learn, to solve a problem plain CSS already solves here.

**One global stylesheet.** Deleting a feature would leave rules nobody can prove are dead, and the
file only ever grows.

## Consequences

- Every component gets a `.css` file next to it. Deleting the component means deleting two files.
- The five `useState` hover flags and their event handlers are gone, replaced by `:hover`.
- Both injected `<style>` blocks are gone; `.topbtn` and `.filemenu-item` moved to `app.css`, which
  is where a rule shared by two components belonged all along.
- A rule that is hard to express in CSS is a signal the markup is wrong, not a licence for an
  inline style.
- The end-state check is `rg` over **every** `style=` prop, not just the literals — the shared
  `CSSProperties` constants are the same problem wearing a name.
