/**
 * Pure request money calculators — characterization surface for tests.
 * Acc totals live in beoShared (already importable without React).
 * Evt totals extracted verbatim from RequestsManager (no behavior change).
 */
import {
  calculateAccFinancialsForRequest,
  calculateEventAgendaDays,
  inclusiveCalendarDays,
  paymentsMeetOrExceedTotal,
  sumAgendaAttendeeDays,
} from './beoShared';

export { calculateAccFinancialsForRequest };

type EvtAgendaItem = {
  startDate?: string;
  endDate?: string;
  rate?: number;
  pax?: number;
  rental?: number;
};

type EvtPayment = { amount?: number };

type EvtForm = {
  agenda?: EvtAgendaItem[];
  payments?: EvtPayment[];
};

type EvtTax = {
  rate?: number;
  scope?: { events?: boolean; foodAndBeverage?: boolean };
};

/** Event-only financials — verbatim body from RequestsManager.calculateEvtFinancials. */
export function calculateEvtFinancials(form: EvtForm, taxesList: EvtTax[]) {
        const eventCostNoTax = (form.agenda || []).reduce((acc: number, item: EvtAgendaItem) => {
            const start = String(item?.startDate || '').slice(0, 10);
            const end = String(item?.endDate || item?.startDate || '').slice(0, 10);
            const rowDays = start && end ? inclusiveCalendarDays(start, end) : 1;
            const safeDays = Math.max(1, rowDays || 1);
            return acc + (((Number(item?.rate) || 0) * (Number(item?.pax) || 0)) + (Number(item?.rental) || 0)) * safeDays;
        }, 0);
        
        let eventTaxMultiplier = 0;
        taxesList.forEach(tax => {
            const rate = Number(tax.rate) / 100;
            if (tax.scope?.events || tax.scope?.foodAndBeverage) eventTaxMultiplier += rate;
        });

        const totalCostWithTax = eventCostNoTax * (1 + eventTaxMultiplier);
        const paidAmountVal = (form.payments || []).reduce((acc: number, p: EvtPayment) => acc + Number(p.amount), 0);

        let paymentStatus = 'Unpaid';
        if (totalCostWithTax > 0) {
            if (paymentsMeetOrExceedTotal(paidAmountVal, totalCostWithTax)) paymentStatus = 'Paid';
            else if (paidAmountVal > 0) paymentStatus = 'Deposit';
        }

        return {
            eventCostNoTax,
            eventCostWithTax: totalCostWithTax,
            totalCostWithTax,
            grandTotalWithTax: totalCostWithTax,
            grandTotalNoTax: eventCostNoTax,
            revenue: eventCostNoTax,
            totalPax: (form.agenda || []).reduce((acc: number, item: EvtAgendaItem) => acc + Number(item.pax), 0),
            totalEventAttendeeDays: sumAgendaAttendeeDays(form.agenda || []),
            totalEventDays: calculateEventAgendaDays(form.agenda || []),
            nights: 0,
            totalRooms: 0,
            adr: 0,
            paidAmount: paidAmountVal,
            paymentStatus
        };
}
