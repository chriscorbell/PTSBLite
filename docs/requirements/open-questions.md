# Open questions for the client

Questions the codebase already knows it has, and cannot answer for itself. Each one changes what
gets built, so guessing is more expensive than asking.

When one is answered: record the answer as an ADR if it has lasting consequences, update
[`../baked-in-assumptions.md`](../baked-in-assumptions.md) if it overturns an entry there, and close
the linked issue.

---

## 1. Are tube offcuts reusable?

**Blocks:** issue #48 · **Affects:** every quote's tube line and total

`bomRows` buys `ceil(total tube feet / 6)` stock lengths, which assumes each cut run comes from a
fresh 6 ft section and offcuts are discarded. The default quote wording says the same thing — *"Stock
tube count includes 6ft sections that will be cut on-site to required lengths; offcuts are not
warranted."*

If installers in practice cut several short runs from one length, the app is over-quoting tube, and
the wording is wrong too.

**Ask:** how do you actually buy and cut tube? Is there a minimum usable offcut length? Please send
two or three real jobs with their tube counts so the rule can be checked against them.

---

## 2. Is one blower with exactly two terminals the real product?

**Affects:** routing, validation, the whole placement model · **See:** ADR-0002

Currently enforced as a v1 fence. `DesignState` would hold more; validation and the placement rules
assume the counts. This is the **single largest determinant** of how much work the requirements
imply — a three-terminal system is a different routing problem, not a bigger one.

**Ask:** what does a typical installation look like? How many terminals, how many blowers, and does
a single system ever branch?

---

## 3. Must an installer be able to move a placed part?

**Affects:** a substantial new capability · **See:** "Absent" in baked-in-assumptions

Today the only way to change a placed part is to erase it and place another. There is no selection
model at all — the `cursor` tool does nothing.

**Ask:** when you lay out a system and get it slightly wrong, what do you expect to do? Is
erase-and-replace acceptable, or is drag-to-move expected?

---

## 4. Who owns the real catalog, and what form does it arrive in?

**Affects:** `src/data/parts.json`, the registry loader, possibly the schema

The shipped part numbers and names are invented placeholders. Prices are installer-entered and the
catalog cannot carry them (ADR-0003).

**Ask:** who maintains the authoritative part list? Does it arrive as a spreadsheet, an export from
an existing system, or typed in? How often does it change, and do prices differ per customer?

---

## 5. Does a quote need per-customer fields?

**Blocks:** issue #54 · **Affects:** the export flow and possibly a customer record

Customer name, quote number, project and notes are global settings, so quoting a second customer
means editing Settings first. Export is gated on them being filled in, so the *first* quote is
necessarily correct — the risk is the second one carrying the first one's name.

**Ask:** how many quotes go out, and to how many different customers? Should the app remember
customers, auto-increment quote numbers, or is editing settings per quote acceptable?

---

## 6. Which platforms must be supported?

**Affects:** the release matrix · **See:** ADR-0006

Windows is assumed to be the client's platform. Builds are produced for macOS and Linux too. macOS
is signed and notarized; Windows is deliberately unsigned and shows a SmartScreen prompt on first
install.

**Ask:** what do the machines running this actually run? Is there an IT policy about unsigned
installers?
