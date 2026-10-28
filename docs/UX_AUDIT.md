# UX and accessibility audit, 21 October 2026

Scope: 17 screens (sign in, join, password reset, events, event page for player and staff, new event, members, member editing, profile, settings, club, groups, invites, attendance summary, missing answers) at 375 and 1280 pixels, light and dark. Sample data, not the test project. Measured with browser probes for contrast, tap targets, accessible names, focus, layout, cognitive load and text; then a reading pass of every screen. Accessibility findings are judged against WCAG 2.2 AA.

## What works
1. Contrast: 1,620 text elements measured, 0 below the AA minimum, in light and dark.
2. Focus outline: 2 pixels, 6.75:1 to 8:1 against the page, on every control tested.
3. No sideways scrolling on any screen at 375 or 1280. Wide tables scroll inside their own box.
4. Every input and button has an accessible name. Three font weights, two typefaces, one heading per page.
5. The answer buttons on the events home sit in easy thumb reach (168 pixels from the thumb rest on a phone).

## Found and fixed
1. [Accessibility, 2.5.8] "Password dimenticata?" on sign in was 17 pixels tall, "Accedi" on the invite page too. Now 44 pixels.
2. [Accessibility, 2.4.1] No way to skip the navigation on 13 signed in screens. A "Vai al contenuto" link now appears on the first Tab.
3. [Accessibility, 4.1.2] Two lists read all their options as their name, for example "Ruolo in campo Non indicato Portiere Difensore Attaccante". Labels are now tied to the field instead of wrapping it.
4. [Accessibility, 1.3.1] Screen readers heard the time as "22:30fino alle 00:00". A space now separates them.
5. [Major] The meetup time was cut off on phone event rows ("Agorà Milano, ritrovo 20:00" clipped by 38 pixels). Rows now wrap to two lines.
6. [Major] "1 membri" on the groups page. Now "1 membro".
7. [Major] The invites list showed an empty heading with nothing under it. It now says there are no invites yet and what to do.
8. [Note] "consiglio direttivo" on the groups page, "Direttivo" everywhere else. Now "direttivo".
9. [Note] The attendance summary still had a back link to Eventi although it is its own tab now. Removed.
10. [Note] Group rows open and close but nothing showed it. A turning arrow now does.
11. [Note] 45 percent of the text on the events home was semibold, so weight no longer marked what matters. The day numbers in the week strip and calendar are now regular weight.

## Checked and left as is
1. The photo upload button was reported with a 1:1 focus ring, because the probe measures the hidden file field. Checked by hand: the ring is drawn around the button on the page background, 2 pixels, well above 3:1.
2. The "repeat every week" checkbox is 20 pixels, but its whole 44 pixel row is clickable.
3. The sign in, join and password pages have no skip link because they have no navigation to skip.

## Still open
1. The new event form spaces every field the same, so date and time, place and groups do not read as groups. Worth grouping when the form is next touched.
2. On phones the club name and photo take the top 72 pixels on every screen. Fine for now; revisit if screens feel crowded.
