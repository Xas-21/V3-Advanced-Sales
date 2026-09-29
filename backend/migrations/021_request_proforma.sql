ALTER TABLE requests ADD COLUMN IF NOT EXISTS proforma JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_proforma_invoice_property
ON requests (property_id, (proforma->>'invoiceNumber'))
WHERE NULLIF(BTRIM(proforma->>'invoiceNumber'), '') IS NOT NULL;
