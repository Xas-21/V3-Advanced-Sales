# Rate Structure — Design

**Date:** 2026-09-28  
**Status:** Approved in conversation 2026-09-28 (page and request rules). Charts added 2026-09-28 at the user’s request.

## Goal

Give each property a named rate catalog, separate from the rates stored on an account. A plan such as `TO` (Tour Operator) holds date periods. Each period holds prices by room type, meal plan, and occupancy. A request can pick one plan. When it does, room rates come from that plan.

## Page

New side-menu item **Rate Structure**, directly under Promotions. It lists the active property’s rate plans.

**Add Rate Plan** asks for a short code and a name. Example: code `TO`, name `Tour Operator`. The list then shows one row, “TO Rate Plan”.

Each plan has **Add period**. A period is a from-date and a to-date. The period row has a **Rates** button.

**Rates** opens the price grid:

- One line is one room type plus one meal plan (the property’s meal plans: RO, BB, HB, FB, and any others).
- Beside them is one price field for every occupancy that property uses. Defaults are Single, Double, Triple, and Quad. Twin appears only when Twin is in that property’s occupancy list.
- **Add row** adds another room type. The same room type may appear twice when the meal plan differs (Deluxe + BB and Deluxe + HB).
- A period cannot contain two lines with the same room type and meal plan. Saving again updates that line.
- A blank price means “no price”. A typed `0` is a real price.

Plans, periods, and prices belong to the property. They are stored as their own records, the same way promotions are, not inside the account and not inside the property settings document.

## Who can edit

The Rate Structure menu is visible to the same roles that can open Promotions. Creating, editing, and deleting plans uses the same permissions as creating, editing, and deleting promotions. Anyone who can edit a request can pick a plan on that request.

## Request field

Section 1, Basic information, gets a **Rate plan** dropdown. It opens on **Choose your rate plan**. Choices are that property’s plans, shown as code and name (`TO — Tour Operator`).

The request stores the chosen plan id, plus the code and name as shown at selection time. Each room keeps its own rate number.

## Which price wins

- **No plan chosen.** Account rates work as they do today. A matching account rate fills the room. If the account has no matching rate, a number already typed on the row stays. It is not set to 0.
- **A plan is chosen.** Account rates are not applied. Every room on the request is priced from the plan, including rooms already saved on an edit.

Match all of these:

- The stay dates overlap the period
- Room type
- Occupancy
- Meal plan

If two periods of the same plan overlap the stay, the shorter period wins. If the lengths are equal, the period saved most recently wins.

## When prices are applied again

- Choosing or changing the plan, or changing check-in or check-out, reprices every room.
- Changing one room’s type, occupancy, or meal plan reprices that room only.
- A hand-typed rate is replaced when one of those changes happens.
- Until then, the typed rate stays.
- Opening a saved request without changing the plan, the dates, or a room does not change the stored rates.

## Missing price

If the plan has no price for that room type, occupancy, and meal plan on those dates, the rate already on the row stays. It is not set to 0. That room shows a short note: the plan has no price for this room.

A removed or missing plan does not reprice. The dropdown shows the saved code and name as no longer available. Rooms keep the rates already stored on them.

## Charts

The Rate Structure page shows three charts for the active property. They use the same chart library as the rest of the app. A meal-plan filter applies to the first two. It defaults to the property’s first meal plan.

**Prices.** For the selected plan and the selected period, a grouped bar chart. Each group is a room type. Each bar is one occupancy. The bar height is the price. A missing price is a gap, not a zero bar. If no period is selected, the chart uses the period that contains today, or the latest period if none contains today.

**Coverage.** For that same plan, period, and meal plan, a count of filled prices versus prices the grid could hold (room types on the period × occupancies on the property). Under the count, list the missing combinations, such as `Deluxe · Single · BB`. This is how a user sees holes before a request hits them.

**Plan use.** A bar chart of the property’s plans. Each bar is the number of requests that stored that plan. Cancelled requests are excluded. Beside it, the room revenue on those requests: the rate already saved on each room row, times rooms times nights, before tax. The range is the stay overlapping a From / To control on the page. The default range is the current calendar month. Requests with no plan are not a bar.

## Out of scope

- Changing account-profile rates, except that they apply only when the request has no plan selected
- Changing event package prices or meeting rental
