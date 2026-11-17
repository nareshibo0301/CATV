# Business rules

## User IDs

Distributors, operators, and customers get `PREFIX-00001`. The prefix and padding are per category. Changing them does not rewrite existing codes. Admins have no user code.

## Connections

Publish creates `PENDING_ACTIVATION`. Paid activation becomes `ACTIVE_PAID` and issues an invoice immediately. Free activation is admin-only and needs a start, a duration (1 month, 2 months, or custom days), and a reason. No invoice is issued during the free period.

A daily job, plus a catch-up when the API starts, finds `ACTIVE_FREE` rows whose end date has passed. The status update and the first invoice commit together, so a second run does not bill twice. The history reason is `auto: free period ended`.

## Commission

Commission is earned only on money actually paid, and only when the connection has a distributor (the customer sits under a distributor, or under an operator who sits under a distributor). A direct operator under an admin earns none. Nothing is earned while the connection is free.

If the handling operator has a commission rule, that rule is used. Otherwise the distributor's rule is used. The type and value are copied onto the ledger row, so a later rule change does not alter it. A partial payment earns a proportional amount. Voiding a payment cancels the original row and writes a negative row. Rows are never deleted.

Assumption: fixed commission is scaled by `payment / invoice total`, so two partial payments do not each pay the full fixed amount.
