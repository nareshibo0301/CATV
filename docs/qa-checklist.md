# QA checklist

- [x] Admin-only custom attributes. Distributors can view them and cannot write them.
- [x] One prefix per category. Existing codes stay put when the prefix changes.
- [x] Publish stays pending. Paid activation creates an invoice. Free activation does not.
- [x] Free period expiry converts once and then bills.
- [x] Direct operators do not earn distributor commission. Operators under a distributor do, using the operator rule when one exists.
- [x] Partial payments reduce outstanding and earn proportional commission. A void writes a reversal.
- [x] Dashboard charts and CSV, Excel, and PDF exports use the caller's scope.
- [x] API keys, inbound signed webhooks, and outbound signed deliveries are in place.

Known limits: demo data is a small script, not hundreds of generated customers, until you pass `--demo` after those customers exist. Large exports are written for the current filter immediately up to the report page cap of 100 rows per request, looped until the total is covered. The queue board is admin-cookie only.
