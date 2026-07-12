# Dashboard Hub Page Component Contract (for subagents)

## Goal
Replace the 10 stub analytics pages in `dashboardHub/pages/` with REAL, deep analytics
dashboards. Each page is a standalone React + TypeScript component. Do NOT put all code in
AS.tsx — each tab must be its own file in `dashboardHub/pages/`.

## Hard contract (MUST follow exactly)
- Each file default-exports a function component: `export default function DashboardHubXxxPage({ colors }: { colors: any })`.
- Use ONLY the `colors` prop for all styling (no Tailwind arbitrary colors). `colors` has:
  `bg, card, primary, textMain, textMuted, border, grid, blue, green, red, orange, yellow, purple,
   blueBg, greenBg, redBg, orangeBg, purpleBg` (and `*Bg` variants are hex+alpha like `#3b82f618`).
- Data fetching: `import { apiUrl } from "../../backendApi";` then
  `const res = await fetch(apiUrl("/api/<endpoint>")); const data = await res.json();`
  The session cookie is auto-sent (same-origin). NO manual Authorization header.
- Charts: `import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
   ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend } from "recharts";`
- Icons: `import { <Icon> } from "lucide-react";` (e.g. BarChart3, TrendingUp, Users, etc.)
- Do NOT modify AS.tsx, DashboardHubShell.tsx, dashboardHubTabs.ts, or backendApi.ts.
- Keep each file self-contained (its own helper functions). No shared new utils.
- Use a `Card`-like wrapper: a div with `style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1 }}` and padding.
- Add a date-range filter (Last 7 / 30 / 90 days / All) where time-series make sense, computed in JS from `createdAt`/`checkIn`/`date` fields.

## Endpoints & real field shapes (tenant-scoped server-side; call WITHOUT propertyId)
- GET /api/requests  -> array of request objects. Key fields:
  id, status (Inquiry|Tentative|Confirmed|Cancelled|...), segment (One Shot Group, Corporate,
  Leisure, MICE, ...), account, accountId, propertyId, checkIn (YYYY-MM-DD), checkOut,
  eventStart, eventEnd, createdAt (ISO), adr (number), nights (number), rooms [{type,count,rate,
  mealPlan,occupancy}], totalCost (string), paidAmount (string), payments [{date,amount,...}],
  bookerName, logs [{date,action,user}], segment, note.
- GET /api/rooms -> [{id,name,size,count,capacity,propertyId}]
- GET /api/venues -> [{id,name,area,capacity,shapes:[{name,capacity}],propertyId}]
- GET /api/financials -> [{id, type, amount, date, propertyId, category, ...}] (may be empty)
- GET /api/crm-state -> {propertyId, leads:{new,waiting,qualified,proposal,negotiation,won,
  notInterested:[]}, pipeline:{...same stages}, accountActivities:{}, salesCalls:[]}
- GET /api/accounts -> [{id,name,type,city,country,createdAt,createdByUserId,activities:[{at,title,user}]}]
- GET /api/promotions -> [{id,title,type,status,startDate,endDate,discount,propertyId,...}] (may be empty)
- GET /api/properties -> [{id,name,city,country,propertyType,roomsCount?}]
- GET /api/users -> [{id,username,name,role,status,propertyId,property_ids,createdAt}]

## What each page must contain (deep analytics — not a placeholder)
Each page: header (title + icon + summary stat row of 3-4 MiniStats), at least 2 charts,
data tables where useful, date filters, and comparisons (e.g. this period vs previous).
Be thoughtful per tab name. Handle EMPTY data gracefully (show "No data yet" state, not crash).

## Pages to build (one file each, exact filenames)
- DashboardHubRequestsPage.tsx       -> deep request analytics (status mix, segment mix, ADR trend,
                                        revenue by account, booking lead-time, cancellations,
                                        property comparison, monthly volume)
- DashboardHubRoomsPage.tsx          -> inventory & utilization (room types, capacity vs booked,
                                        occupancy rate, revenue per available room type)
- DashboardHubMicePage.tsx           -> MICE/venue analytics (venue capacity, event types,
                                        bookings by venue, seasonal demand)
- DashboardHubRevenueMixPage.tsx     -> revenue composition (by segment, by property, by account,
                                        paid vs outstanding, trend)
- DashboardHubCrmPage.tsx            -> pipeline/funnel (leads & pipeline stages, conversion,
                                        by stage, by property)
- DashboardHubAccountsPage.tsx       -> account portfolio (types, by city/country, top accounts by
                                        request volume, creation trend, activities)
- DashboardHubPromotionsPage.tsx     -> promotions performance (status mix, active timeline,
                                        discount distribution, by property)
- DashboardHubAgreementsPage.tsx     -> agreements/contracts (status, by property, timeline,
                                        value if available)
- DashboardHubActivitiesPage.tsx     -> user activity (requests created per user, log actions
                                        breakdown, daily activity timeline)
- DashboardHubSalesPerformancePage.tsx -> sales rep performance (requests per user, conversion rate,
                                        revenue per rep, leaderboard)

## Verification
After writing, run `cd /docker/hermes-agent-ypek/data/V2-Advanced-Sales && npx tsc --noEmit -p tsconfig.json`
is NOT required; instead ensure valid TSX. The orchestrator will rebuild. Do not run the dev server.
Return a one-line summary per file you created.
