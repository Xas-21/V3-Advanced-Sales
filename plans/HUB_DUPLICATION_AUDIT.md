# Hub tabs — duplicated KPIs / charts audit

Compare originals side-by-side with `*-preview` tabs. Previews intentionally drop or re-label overlaps.

## Cross-tab overlaps

| Metric / chart | Where it appears | Verdict |
|---|---|---|
| Top accounts by revenue | Requests, Revenue Mix, Accounts, sometimes CRM | **Keep collection-first on Revenue Mix**; Requests = booking lens; Accounts preview = concentration only (one chart); CRM preview drops top-account revenue |
| Segment / monthly revenue | Requests, Revenue Mix, MICE (MICE slice) | **Revenue Mix owns hotel mix**; MICE preview = MICE-scoped only; Requests keeps volume/ADR/lead-time |
| Win rate | Requests (bookings), CRM (leads), Sales Performance (reps) | **Different denominators** — previews label explicitly (booking / lead / rep) |
| Status / pipeline mix | Requests status, CRM stages, Agreements (request statuses as Signed/Pending/Lost) | Agreements original is a **status proxy**, not Contracts module — preview disclaims |
| Activity volume | CRM (lead activities), Activities (hub user actions) | **Name clash** — Activities preview labels “hub user activity” |

## Within-tab duplicates (originals)

| Tab | Issue | Preview direction |
|---|---|---|
| Rooms | Rooms-by-type ≈ Capacity-by-type; fixed ~90d; radial gauge | One inventory mix; RangeTabs; Meter |
| MICE | Soft-empty gate; no range; double pies | Real empty; range; one status + one revenue lens |
| CRM | “Stage conversion” from counts; NaN dates in-range; pipeline $ ignores range | Honest labels; date guard; range-aware pipeline |
| Accounts | Range mostly only “New”; portfolio $ overlaps Revenue Mix | Broader range effect; light revenue |
| Promotions | Default `all`; MiniStats from unfiltered `enriched` | Default 30d/90d; stats = filtered set |
| Agreements | Titled like contracts; request status proxy | Honest copy + period |
| Activities | Active users = `byUser.slice(0,10).length` | Count all, chart top 10 |
| Sales Performance | Rep `revenue` includes pending while KPI won-only; local StatCard | Align series; kit MiniStat |

## Plan 033 note

033 restored unique charts on previews (Requests-by-rep + radar, promo types/timeline, agreements volume+value, RevPAR, MICE area/capacity). **KEEP OUT** list above unchanged.

## Ownership (recommended after you pick previews)

1. **Revenue Mix** — collection / segment / channel mix (hotel-wide money)
2. **Requests** — booking funnel, volume, ADR, lead time, cancellations
3. **CRM** — lead pipeline & stages
4. **Sales Performance** — rep leaderboard
5. **Rooms / MICE** — inventory & events lenses (scoped)
6. **Accounts** — portfolio composition & concentration
7. **Promotions** — promo usage / lift
8. **Agreements** — rename or wire real contracts later; until then status proxy with disclaimer
9. **Activities** — hub usage / active users
