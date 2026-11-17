# API and webhooks

Interactive docs: http://localhost:8080/api/docs

Create a key under Integrations. The secret is shown once. Send it as `Authorization: Bearer catv_...`. Create calls accept `Idempotency-Key` when you store responses yourself; cookie calls from the browser send `X-CSRF-Token`.

## Inbound payment webhook

`POST /api/v1/webhooks/inbound/payments`

Headers: `X-CATV-Timestamp` (unix ms) and `X-CATV-Signature` = hex HMAC-SHA256 of `timestamp + "." + rawBody` using `INBOUND_WEBHOOK_SECRET` (or the JWT access secret when that is unset). Timestamps older than five minutes are rejected. The same `eventId` is stored once.

```json
{ "eventId": "evt-1", "type": "payment.received", "invoiceId": "...", "amount": 100, "method": "UPI" }
```

Node:

```js
const crypto = require('crypto');
const body = JSON.stringify(payload);
const timestamp = String(Date.now());
const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
```

PHP:

```php
$timestamp = (string) round(microtime(true) * 1000);
$signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
```

## Outbound

Admin endpoints subscribe to `user.created`, `user.updated`, `connection.published`, `connection.activated`, `connection.free_started`, `connection.free_expired`, `connection.converted_to_paid`, `invoice.created`, `payment.received`, `commission.created`, and `commission.paid`.

Deliveries send `X-CATV-Signature`, `X-CATV-Timestamp`, and `X-CATV-Event-Id`. Failed deliveries retry with exponential backoff (5 attempts) and then go dead. Ten dead deliveries disable the endpoint.
