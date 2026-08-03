<!--
Plain-English rendering of the open `question` issues, written to be sent to the client.
Keep in sync when those change:
  1 -> #92   2 -> #48   3 -> #94   4 -> #93   5 -> #54
Question 6 (#95, what computers this runs on) is answered and has been removed: the public
web version is what ships, and desktop installers are not being published. If desktop
distribution resumes, the Windows code-signing half of #95 becomes live again — ADR-0006.
No jargon, no issue numbers, no file paths. The reader runs the business, not the build.
-->

# Questions about how you work

There are now two versions. **PTSBuilderLite** is the one anybody can open in a web browser — it
draws a system and gives you a parts list, and shows no prices at all. The **full version** is the
one your team would use internally, which adds pricing and the customer quote.

Before either goes much further, there are a few things about your business I've had to guess at.

Where I guessed, I picked something sensible and wrote it down — but a wrong guess gets more
expensive the longer it stays in, because everything built afterwards sits on top of it. These are
the guesses worth checking.

None of this needs a written reply. A phone call works. For a couple of them, an old quote would
tell me more than any description could.

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
as if every cut comes off a fresh 6ft stick and the remainder is thrown away. The suggested wording
on the quote says the same thing: *"offcuts are not warranted."*

If your installers actually cut several short runs out of one stick, then **the app is telling you
to buy more tube than you need**, and the quote is charging your customer for it.

**Why it matters:** it changes the price of every quote that has short runs in it.

**What would help most:** two or three finished jobs, with the number of 6ft sticks actually used. I
can put the same job through the app and see how far off it is. Also useful: is there a length below
which a leftover piece isn't worth keeping?

---

## 3. Who keeps the real parts list?

The part names and numbers in the app are invented. "BL-2020-A" is not a real blower — I made it up
so there was something on the screen.

Prices are already sorted: you type those in yourself, and the app refuses to produce a quote until
you have. But the names and part numbers your customer sees should be the ones you actually order
by.

**Why it matters:** a quote with made-up part numbers can't go out the door.

**What would help most:** whoever keeps the real list, in whatever form it's in — a spreadsheet, a
printed catalogue, an export from wherever you order. Also worth knowing: how often does it change,
and do different customers get different prices?

---

## 4. If you put a part in the wrong place, what do you expect to do?

At the moment, the only way is to erase it and place it again. There's no way to grab a part and
slide it somewhere else.

**Why it matters:** adding that is real work, so I'd rather know whether it's worth doing than
assume. If layouts usually come out right the first time, erase-and-replace may be perfectly fine.

**What would help most:** just tell me whether it's annoying in practice. And if it is — is it
nudging one part over by a foot, or rearranging a whole run?

---

## 5. How many quotes do you send, and to how many different customers?

The customer's name, the project name, the quote number and the notes are currently **settings** —
you fill them in once and they stay that way. The app won't let you export a quote until they're
filled in, so your first quote is always correct.

The problem is the second one. Quote a different customer, forget to change the name, and **their
quote goes out with the previous customer's name on it**. Nothing warns you, because as far as the
app can tell nothing is missing.

**Why it matters:** it's embarrassing rather than expensive, but it's an easy mistake to make and a
hard one to spot.

**What would help most:** roughly how many quotes go out in a month, and to how many different
people. A handful a year, and editing the settings each time is fine. Several a week, and the app
should be asking for the customer on each quote and counting the quote numbers up itself.

---

## One thing you have already settled

You told me the web version needs to work in Chrome, Edge, Firefox and Safari on desktop computers.
That is what it does, and it needs nothing installed — you just send someone a link.

That also answers the question I was going to ask about Windows install warnings. Nobody installs
anything, so nobody sees one. If you later want the full version handed out as a proper installable
program, that question comes back and it is worth about a few hundred dollars a year to make the
warning go away. Not something to decide now.
