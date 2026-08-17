<!--
Plain-English rendering of the open `question` issues, written to be sent to the client.
Keep in sync when those change:
  1 -> #92   2 -> #48   3 -> #94   4 -> #93
Question #95 (what computers this runs on) is answered and has been removed: PTSBLite
runs in supported desktop browsers and has no installable version.
No jargon, no issue numbers, no file paths. The reader runs the business, not the build.
-->

# Questions about how you work

**PTSBLite** is Kelly Tube Systems' public marketing tool. Anybody can open it in a web
browser, draw a system, and download a parts list. It shows no prices.

Before it goes much further, there are a few things about your systems and catalog I've had to
guess at.

Where I guessed, I picked something sensible and wrote it down — but a wrong guess gets more
expensive the longer it stays in, because everything built afterwards sits on top of it. These are
the guesses worth checking.

None of this needs a written reply. A phone call works. For a couple of them, an old layout or parts
list would tell me more than any description could.

---

## 1. How many stations does a typical system have?

Right now the app builds exactly one shape: **one blower and two stations** — the first sitting
directly against the blower, the second at the far end of the run. It won't let you draw anything
else.

I built it that way because it matched the example I started from.

**Why it matters:** this is the biggest question on the list. If your jobs branch, or have three or
four stations, or more than one blower, then the app can currently only handle your simplest work. A
system that splits isn't a bigger version of a straight run — it's a different problem to solve, and
knowing now is far cheaper than knowing later.

**What would help most:** rough numbers from the last handful of jobs. How many stations, how many
blowers, and did the tube ever split to serve two places at once?

---

## 2. When you buy tube, do you use the leftover pieces?

The app assumes you don't. It adds up all the tube in the drawing, divides by six, and rounds up —
as if every cut comes off a fresh 6ft stick and the remainder is thrown away.

If your installers actually cut several short runs out of one stick, then **the app's public parts
list asks for more tube than the design needs**.

**Why it matters:** visitors may treat the parts list as an accurate description of the system.

**What would help most:** two or three finished jobs, with the number of 6ft sticks actually used. I
can put the same job through the app and see how far off it is. Also useful: is there a length below
which a leftover piece isn't worth keeping?

---

## 3. Who keeps the real parts list?

The part names and numbers in the app are invented. "BL-2020-A" is not a real blower — I made it up
so there was something on the screen.

The names and part numbers visitors see should be the ones Kelly Tube Systems actually uses.

**Why it matters:** the downloadable parts list currently publishes made-up identifiers.

**What would help most:** whoever keeps the real list, in whatever form it's in — a spreadsheet, a
printed catalogue, or an export from wherever you order. Also worth knowing: how often does it
change?

---

## 4. If you put a part in the wrong place, what do you expect to do?

At the moment, the only way is to erase it and place it again. There's no way to grab a part and
slide it somewhere else.

**Why it matters:** adding that is real work, so I'd rather know whether it's worth doing than
assume. If layouts usually come out right the first time, erase-and-replace may be perfectly fine.

**What would help most:** just tell me whether it's annoying in practice. And if it is — is it
nudging one part over by a foot, or rearranging a whole run?

---

## One thing you have already settled

You told me the web version needs to work in Chrome, Edge, Firefox and Safari on desktop computers.
That is what it does, and it needs nothing installed — you just send someone a link.

There is no installable or internal version in this project's scope.
