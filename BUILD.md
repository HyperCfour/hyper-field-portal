# HYPER Field Portal: build spec (v1, Mobil / Clarksons)

Prototype: `prototype/app.html` + `prototype/data.js` (snapshot of the Screen Register, 16 Nov 2026). Open `app.html` in a browser to click through. Same flow and fields as below. The confirmation screen shows the exact `create_item` payloads the live version sends.

The prototype uses the Hyper design system: `prototype/colors_and_type.css` (tokens, type scale, dark and light themes), `prototype/fonts/` (Neue Montreal) and `prototype/assets/` (logo SVGs). Keep these files together with `app.html`. The Next.js build should load the same stylesheet and fonts; see the design skill's `references/platform-mapping.md` for the Next.js on Vercel pattern. Light theme only, locked on the page (`data-theme="light"`), since most use is on a forecourt in daylight. The system's status hues are tuned for dark, so small status text (tags, notices) uses darker tones of the same hues (`--ok-text #15803D`, `--warn-text #B45309`, and the system's `--accent-text` for coral) to meet AA on #FAFAFA; the tinted fills are the system's own. One column, phone first, that sits comfortably on a desktop (640px max, wider side padding above 720px, hover styles only on devices with a pointer).

## Portals (one code base, one Vercel project)

The live app serves one portal per retailer from the same deployment. Each has its own address, its own access code and its own sign-in cookie, and only ever reads its own group on the Screen Register. The bare address lists nothing, so one retailer never sees another. Everything retailer-specific is in `web/lib/portals.mjs`; adding a retailer is one entry there plus an access code.

| Address | Register group(s) | Network label on tickets | Who raises | Raised by organisation / Channel |
|---|---|---|---|---|
| `/mobil` | Mobil `group_mm8baqwb` | Mobil | Clarksons technician | Partner / Partner escalation |
| `/foursquare` | Foursquare `group_mm8bhsmq` | Foursquare | Store owner or operator, or head office (asked in Your details) | Store or Client / QR / web form |
| `/liquorland` | Liquorland `group_mm8bd7rg` | Liquorland | Store owner or operator, or head office | Store or Client / QR / web form |
| `/briscoe-group` | Briscoes `group_mm8bjcme`, Rebel Sport `group_mm8bj6v` | Briscoes or Rebel Sport, from the screen's group | Head office | Client / QR / web form |

- **Brand step.** A portal with more than one banner (Briscoe Group) starts by asking which brand; the rest of the flow is then scoped to it. Single-banner portals skip it.
- **Logos.** Drop a file at `web/public/assets/banners/<banner id>.svg` (or `.png`, `.webp`); ids are `mobil`, `foursquare`, `liquorland`, `briscoes`, `rebel-sport`. It shows above the title and on the brand step. Without a file the brand name is shown as text on the brand step and nothing above the title.
- **Raised by** reads "Name (Clarksons)", "Name (Foursquare store)" or "Name (Briscoes head office)". The Clarksons job number is only asked on the Mobil portal.
- **Symptoms and the four checks are the same on every portal.** Confirmed 25 Nov 2026: the same checks apply to store owners and head office.
- **Access codes.** `PORTAL_CODE_MOBIL`, `PORTAL_CODE_FOURSQUARE`, `PORTAL_CODE_LIQUORLAND`, `PORTAL_CODE_BRISCOE_GROUP`. `PORTAL_CODE` is a fallback for any portal without its own; leave it unset in production.
- **The CMS is never read or shown.** It is internal to HYPER.

The sections below were written for Mobil / Clarksons and describe the flow every portal shares; `prototype/` is still the Mobil-only click-through.

## Purpose

Clarksons technicians find the Mobil site they are at, pick the screen or screens from the registered list and raise a ticket into HYPER's Support Tickets board. The ticket links to the screen by monday item ID, so there is no typed Screen ID, no match step and no dirty data. Replaces QR stickers for Mobil.

This portal is field-driven and separate from the n8n daily offline check, which raises tickets proactively from player heartbeats. Both write to the same board; a field ticket for a screen that already has a proactive ticket is expected and is linked, not blocked (see Duplicates).

## Flow

1. **Your details**: name and NZ mobile (required, used for the callback). "Remember me on this phone" is on by default and keeps them on the device, so the step is skipped next time; unticked, they last for the visit only (shared device). An Edit link in the header reopens this step.
2. **Find the site**: search name, street or town; "Use my location" sorts by distance (site coordinates geocoded once from the Sites board addresses).
3. **Pick the screens**: the site's screens by device name, with Screen ID, position and status (Online / Offline Nd / Paused / Switched off / Not yet seen). One or more can be selected. "Select all live screens" selects every Live screen at the site; switched-off screens can be added individually, with a warning. A screen that isn't listed isn't on the register and cannot be supported through the portal: the note tells the technician to call the desk. There is no unregistered-screen path.
4. **What's wrong**: symptom (required, applies to every selected screen), the four pre-escalation checks (all required), photos (optional, up to 4, resized on the phone), notes, Clarksons job number (optional; it changes per job, so it is asked here rather than kept with the profile).
5. **Sent**: confirmation listing the ticket per screen.

**Whole site rule.** When every Live screen at the site is selected and there are at least two, the submission is raised as P1 Critical, one ticket per screen, and each description starts with "Whole site affected: all N screens reported in one submission." Otherwise tickets are P2 High and each description notes the other Screen IDs in the same submission.

**Draft.** Site, selected screens, symptoms, checks, notes and job number are saved in `localStorage` as the technician goes, and restored on reload. Photos are not saved (they are still on the phone). The draft is cleared on send.

**Back.** Each step is a browser history entry. The Back control at the top of steps 2 to 4 and the phone's own back button (Android back, iOS swipe) step through the same screens and never leave the app. A step only opens when what it needs is in place (a site, a selection); otherwise the nearest earlier step opens. After sending, the selection is cleared, so back cannot return to the form and resend the same tickets.

## Architecture (Vercel)

- Next.js (App Router) on Vercel. Server route handlers call monday; the browser never sees the token.
- `MONDAY_TOKEN` in Vercel environment variables: the shared HYPER service account token (the same account the n8n check moves to), with access to the Network Operations workspace only. Never in code or git.
- Read: Sites and Screen Register (Mobil group, exclude Decommissioned / Removed). Cache 5 to 15 minutes (`revalidate`), so register changes show quickly.
- Write: one `create_item` per selected screen. Photos: `add_file_to_column` (column `t_photos`) on the **first ticket of the batch only**; the other tickets' descriptions say "Photos attached to <first ticket name>". This keeps a whole-site submission to 4 uploads rather than 4 × N.
- Photos are resized in the browser before upload (1600 px long edge, JPEG at 80%, roughly 200 to 400 KB each). Vercel route handlers cap request bodies at 4.5 MB, so full-size phone photos must never reach the server. Modern browsers apply EXIF orientation when decoding, so the canvas output is upright.
- Access: v1 a shared Clarksons access code (env `PORTAL_CODE`) + per-device name/phone; v2 Supabase Auth magic links per technician, giving an audit trail. Rate limit submissions per device: Vercel functions are stateless, so the counter lives in Vercel KV / Upstash or Supabase.
- Site coordinates: two number columns on the Sites board (lat, long), filled once by a script. No Supabase needed for this.
- Optional Supabase: users, submission log.

## monday IDs

| Thing | ID |
|---|---|
| Support Tickets board | 18436511532 |
| New and in triage group | group_mm8ba8qc |
| Screen Register board | 18436511524 |
| Mobil group (register) | group_mm8baqwb |
| Sites board | 18436511522 |

## Reads

Screens (paginate with `next_items_page`). The device name is the `legacy_ids` column ("Device name / legacy IDs" on the register; Support Tickets mirrors it as "Device name", `lookup_mm90eg2z`):

```graphql
query { boards(ids:[18436511524]) { items_page(limit:500, query_params:{rules:[{column_id:"lifecycle", compare_value:[6,3], operator:not_any_of}]}) { cursor items { id name group { id } column_values(ids:["legacy_ids","reg_site","position","lifecycle","health","offline_since"]) { id text ... on BoardRelationValue { linked_item_ids } } } } } }
```

Keep `group.id == group_mm8baqwb`. The CMS column is internal to HYPER and is not read: it must not appear in the technician-facing app. Sites: `items(ids:[...site ids])` with `street`, `region`, `site_status`. Label ids confirmed 17 Nov 2026: lifecycle Live 1, Out of rotation 7, Decommissioned 6, Removed 3; health Online 1, Offline 0, Unknown 2, Paused 7.

Display name in the screen list: the device name with everything up to the first dash removed ("Mobil 10th Ave - Menu Board 1" shows as "Menu Board 1"). About 20 register names abbreviate the site, so do not strip the literal site name. No site name contains a dash.

## Write: the ticket

`create_item(board_id: 18436511532, group_id: "group_mm8ba8qc", item_name: <device name>, column_values: <JSON>)`, once per selected screen.

| Column | ID | Value |
|---|---|---|
| Item name | name | Device name from the register, e.g. "Mobil Kamo - Menu Board" |
| Screen ID (as reported) | screen_ref | Register item name, e.g. MM173 |
| Screen | t_screen | `{"item_ids":[<register item id>]}` |
| Request type | req_type | `{"label":"Fault"}` |
| Network (as reported) | net_ref | `{"label":"Mobil"}` |
| Channel | channel | `{"label":"Partner escalation"}` |
| Raised by organisation | raised_org | `{"label":"Partner"}` |
| Priority | priority | `{"label":"P2 High"}`, or `P1 Critical` under the whole site rule |
| Reported symptom | symptom | `{"ids":[...]}`: 1 Blank, 2 Frozen, 3 Wrong content, 5 Flicker/colour, 6 Damage, 8 Other |
| Pre-escalation checks | prechecks | `{"ids":[1, ...ticked, 6?]}`: 1 Screen ID confirmed (always, the screen came from the register), 2 Power, 3 Cables, 4 Internet, 5 Restarted (all four ticked), 6 Photo (only when a photo is attached) |
| Raised by | raised_by | "Name (Clarksons)" |
| Contact phone | c_phone | `{"phone":"+6421...","countryShortName":"NZ"}`. NZ mobiles only, normalised to +64 on the device and again on the server. monday's docs show both `+E.164` and bare-digit forms; confirm on the first live write |
| Partner reference | partner_ref | Clarksons job number, if given |
| Description | description | `{"text":"<batch line>\n<notes>"}` |
| Parent ticket | parent_tkt | Existing self-link column on Support Tickets. Set by the server to the open ticket for the same screen, when there is one (see Duplicates) |
| Photos | t_photos | `add_file_to_column` after create, first ticket of the batch only |

Existing board automations then: set status New and assign, start SLA clocks and due dates. Leave `t_status` unset.

## Duplicates

The technician is never asked about existing tickets. At submit time, for each selected screen, the server queries Support Tickets for open items linked to that screen (`t_screen` contains the register item id, `t_status` not Closed 19 or Cancelled 17; the same definition the n8n check uses). If one exists:

- set **Parent ticket** (`parent_tkt`) on the new ticket to the existing one;
- prepend "Possible duplicate of <existing ticket name>. " to the description.

The desk then sees both the proactive ticket and the field ticket, which usually carries more detail for triage, and decides how to merge them. `parent_tkt` already exists on the board, so no schema change is needed.

## Rules

- Never create a ticket from free text: always `t_screen` by item ID. No unregistered-screen path; unlisted screens are not supported.
- Out of rotation screens ("Switched off"): allowed, with a warning. Not included in "Select all live screens".
- Validation server-side too: at least one symptom, all four checks, name, NZ mobile; at least one screen; every screen id must be on the register and in the Mobil group.
- Photos optional, max 4, resized client-side; reject any single file over 1 MB server-side as a backstop.
- No dashes in user-facing copy; NZ English. Device names from the register are data and keep their dashes.

## Live app (`web/`)

Next.js 15 (App Router, TypeScript) in `web/`. Vercel project root directory: `web`.

```
web/
  app/page.tsx                        bare address: "use the link you were given", lists no retailers
  app/[portal]/page.tsx               a portal (renders components/Portal.tsx with that portal's config)
  app/[portal]/access/page.tsx        its access code screen
  app/api/p/[portal]/access/route.ts  POST {code}: sets that portal's access cookie
  app/api/p/[portal]/register/route.ts GET: that portal's sites and screens from monday, cached 10 minutes
  app/api/p/[portal]/tickets/route.ts POST: validates, checks for open tickets, creates one ticket per screen, attaches photos
  middleware.ts             gate: no access cookie for the portal means /<portal>/access (pages) or 401 (API)
  lib/portals.mjs           the portals: banners, register groups, ticket labels, roles
  lib/shared.mjs            pure helpers shared with the browser: phone, names, whole-site rule, ticket payloads
  lib/monday.ts             monday GraphQL client and file upload
  lib/register.ts           register read and shaping
  lib/tickets.ts            validation, duplicate check, create, photos
  lib/access.ts             access cookie
  public/                   colors_and_type.css, fonts/, assets/ (same files as the prototype)
  tests/                    node --test, no network
```

Environment variables (Vercel project settings, never in git): `MONDAY_TOKEN` (service account) and one `PORTAL_CODE_<PORTAL>` per portal (see Portals). Copy `.env.example` to `.env.local` to run locally.

Commands: `npm install`, `npm test`, `npm run dev` (http://localhost:3000/mobil and the other portal addresses), `npm run build`. Deploy: `vercel` from `web/` (preview) or `vercel --prod`.

Rate limiting in v1 is a best-effort in-memory limit per IP (10 submissions per 10 minutes per warm instance) plus hard caps (screens must belong to the chosen site, 4 photos, 1 MB each). A durable limiter needs Vercel KV or Upstash; add it before opening the portal beyond Clarksons.

## Register clean-up before launch

Found in the 16 Nov snapshot (504 screens, 112 sites):

- **5 Live screens have no site** (blank `reg_site`), so they never appear in the portal: MHL078, ME078, MHR081 (Mobil Pt Chevalier), MM127 (Mobil Taradale), MM173 (Mobil Kamo). Link them to their sites.
- **Duplicate site:** "Mobil Bealey" (MM009 only) and "Mobil Bealey Ave" (8 screens), same address. Merge into one site and move MM009.
- **MM009's device name** is "Mobil Bealey -Menu Board 1" (missing space). Display handles it; fix for tidiness.
- One Live screen has health Unknown; it shows as "Not yet seen".

## Later

- Other partners (Epay for Impulse, Wisley/contractors for NZ Post): add a portal in `web/lib/portals.mjs`.
- Ticket status page per technician (their open tickets, closure confirmations).
- Store-facing version without checks, to replace store QR printouts.
- Location sorting (needs the Sites lat/long columns filled).
