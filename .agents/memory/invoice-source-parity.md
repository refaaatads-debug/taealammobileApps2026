---
name: Invoice source parity
description: The mobile invoice history must match the platform's issued-invoice source and not confuse payment attempts with invoices.
---

The student invoice screen should read issued records from `invoices` filtered by the authenticated student's `student_id`. `payment_records` represents checkout/payment state and must not be merged into the invoice list or labeled as an invoice.

**Why:** A pending subscription payment appeared as a 199 SAR invoice when the student had no issued invoice, because the mobile screen merged `payment_records` into the invoice history.

**How to apply:** Keep payment records in payment-success or payment-status verification flows only. Use `invoices` for invoice cards, invoice numbers, tax/VAT, ZATCA state, documents, and QR data; validate production records through an authorized read-only Supabase source before changing data.