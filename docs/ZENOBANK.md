# ZenoBank — Kripto To'lov Integratsiyasi

> Ma'lumot manbasi: https://docs.zenobank.io  ·  So'nggi tekshiruv: 2026-09-18

## API Overview

- **Base URL**: `https://api.zenobank.io`
- **Authentication**: `X-API-Key: sk_...` (Bearer emas, custom header)
- **API kalit prefiks**: `sk_` (secret / server-side)
- **Content-Type**: `application/json`

## Checkout yaratish

```http
POST https://api.zenobank.io/api/v1/checkouts
X-API-Key: sk_xxx
Content-Type: application/json

{
  "orderId": "sov_...",              // Bizning ichki order id (uuid)
  "priceAmount": "5.00",             // Decimal string, priceCurrency da
  "priceCurrency": "USD",            // ISO 4217
  "successRedirectUrl": "https://sovhq.vercel.app/app?paid=1"
}
```

**Javob:**

```json
{
  "id": "ch_l0k1o87yt6",
  "orderId": "sov_...",
  "priceCurrency": "USD",
  "priceAmount": "5.00",
  "status": "OPEN",
  "expiresAt": "2026-09-19T10:30:00Z",
  "checkoutUrl": "https://pay.zenobank.io/ch_...",   // Foydalanuvchini bu URL'ga yuboramiz
  "createdAt": "2026-09-18T10:00:00Z",
  "successRedirectUrl": "https://sovhq.vercel.app/app?paid=1"
}
```

## Webhooks

Uchta event turi:

| Event | Ma'no |
|---|---|
| `checkout.completed` | To'liq to'lov qabul qilindi → plan yoqiladi |
| `checkout.expired` | Muddat tugadi, to'lov kelmadi |
| `checkout.partially_paid` | Muddat tugadi, ammo qisman to'lov keldi (manual review) |

**Payload:**

```json
{
  "type": "checkout.completed",
  "data": {
    "id": "ch_...",
    "orderId": "sov_...",
    "priceCurrency": "USD",
    "priceAmount": "100.00",
    "paidAmount": "100.00",
    "status": "COMPLETED",
    "expiresAt": "...",
    "checkoutUrl": "...",
    "createdAt": "...",
    "successRedirectUrl": "..."
  }
}
```

**Imzo tekshiruvi**: Svix (`svix-id`, `svix-timestamp`, `svix-signature` sarlavhalari). Secret ZenoBank Dashboard → Developers dan olinadi, prefiks `whsec_`.

**MUHIM**: `wh.verify(payload, headers)` **RAW** body bilan chaqirilishi kerak — JSON'ni re-serialize qilib bo'lmaydi (imzo buziladi).

```ts
import { Webhook } from "svix";

const wh = new Webhook(process.env.ZENOBANK_WEBHOOK_SECRET!);
const rawBody = await req.text();
try {
  const msg = wh.verify(rawBody, {
    "svix-id": req.headers.get("svix-id")!,
    "svix-timestamp": req.headers.get("svix-timestamp")!,
    "svix-signature": req.headers.get("svix-signature")!,
  });
  // msg.type = "checkout.completed" | ...
  // msg.data.orderId → apply_order_payment RPC (service-role)
} catch {
  return new Response("invalid signature", { status: 401 });
}
```

## SDK

`@zenobank/sdk` ni allaqachon ishlatamiz — u yuqoridagi wrap'ni bir qatorda beradi:

```ts
zeno().checkouts.create({ orderId, priceAmount, priceCurrency, successRedirectUrl })
zeno().webhooks.verify({ secret, rawBody, headers })
```

## Bizdagi joylashuv

- **Client**: [src/lib/payments/zenobank.ts](../src/lib/payments/zenobank.ts) — singleton client + secret export
- **Checkout API**: [src/app/api/checkout/route.ts](../src/app/api/checkout/route.ts) — auth + order insert + zeno.checkouts.create
- **Webhook**: [src/app/api/webhooks/zenobank/route.ts](../src/app/api/webhooks/zenobank/route.ts) — Svix verify (raw body) → apply_order_payment RPC (service-role)

## Env variables

```
ZENOBANK_API_KEY=sk_... (Dashboard → Developers → API Keys)
ZENOBANK_WEBHOOK_SECRET=whsec_... (Dashboard → Developers → Webhook → Signing Secret)
```

Vercel'da ikkalasi ham **Secret** turi bilan qo'yiladi.

## Dashboard webhook sozlash

ZenoBank Dashboard → **Developers** → **Webhooks** → **Add endpoint**:

- **URL**: `https://sovhq.vercel.app/api/webhooks/zenobank`
- **Events**: `checkout.completed`, `checkout.expired`, `checkout.partially_paid`
- **Signing Secret** ni nusxa olib `ZENOBANK_WEBHOOK_SECRET` env ga qo'ying → redeploy

## Foydalanuvchi tomondan ko'rinishi

1. `/app` da **Pricing** → **Sotib olish** bosadi
2. Client `POST /api/checkout { plan: "pro" }` chaqiradi
3. Server order yaratadi (`orders` jadval, status=`pending`)
4. Server `zeno.checkouts.create(...)` bilan checkout yaratadi
5. Foydalanuvchi `checkoutUrl` ga yo'naltiriladi (ZenoBank hosted page)
6. Kripto to'lov qiladi
7. ZenoBank bizga `checkout.completed` webhook yuboradi
8. Bizning webhook handler `apply_order_payment(p_order_id)` RPC ni chaqiradi
9. Foydalanuvchi profil `plan` ni yangilaydi va `plan_expires_at = now() + 30 days`
10. `successRedirectUrl` bo'yicha `/app?paid=1` ga qaytadi
