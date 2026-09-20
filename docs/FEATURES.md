# SOVEREIGN — yangi imkoniyatlar qo'llanmasi

Bu hujjat saytdagi va CLI'dagi so'nggi imkoniyatlarni tushuntiradi: nima qiladi,
qanday ishlatiladi va chegaralari nimada.

---

## 1. Chatdagi brauzer — havolani AI o'zi o'qiydi

Xabarga havola yozsangiz, AI javob berishdan oldin o'sha sahifani ochib matnini
o'qiydi va shu asosda javob beradi.

```
https://example.com bu qanday sayt? Qisqa tushuntir.
```

- Bir xabarda **2 tagacha** havola o'qiladi.
- Har sahifadan **12 000 belgigacha** matn olinadi, kutish 12 soniya.
- Javob ostida manbalar ko'rinadi, xabar tepasida "Sahifa o'qildi" belgisi chiqadi.
- Havolali savol keshlanmaydi — sahifa mazmuni o'zgarib turadi.

**Xavfsizlik.** Faqat ochiq internet manzillari o'qiladi. Ichki tarmoq
(`127.0.0.1`, `10.x`, `192.168.x`, `169.254.169.254` — bulut metadata),
`file://`, standart bo'lmagan portlar va parolli URL'lar bloklanadi.
Qayta yo'naltirish (redirect) har bir qadamda qaytadan tekshiriladi, shuning uchun
sayt sizni ichki manzilga burib yubora olmaydi.

Sahifa ochilmasa (bloklangan, juda katta yoki matn emas), AI shuni ochiq aytadi.

---

## 2. Model band bo'lsa avtomatik almashish

Tanlangan model xato bersa (limit tugagan, kredit yo'q, provayder yiqilgan),
chat to'xtamaydi:

1. Tarifingiz ruxsat beradigan boshqa modelga o'tiladi (arzonrog'idan boshlab).
2. Xabar tepasida **"Model almashtirildi"** belgisi chiqadi, ustiga kursor
   olib borsangiz sababi ko'rinadi.
3. Agar javobning bir qismi allaqachon yozilgan bo'lsa, model almashtirilmaydi —
   aks holda javob ikki xil uslubda chiqib, chalkash bo'lardi.

Bundan tashqari server darajasida zaxira shlyuzlar zanjiri bor (pastga qarang).

---

## 3. Cowork — kompyuteringizdagi papka

Chapdagi panelda **Cowork papka** bo'limini oching va papkani tanlang. Shundan
so'ng chatda `@` yozib fayl nomini tanlaysiz — AI o'sha faylni ko'radi.

- Rasmni endi qo'lda yuklamaysiz: `@rasm.png` deb yozsangiz kifoya.
- Kod fayllari matn sifatida, rasmlar ko'rish uchun yuboriladi.
- `node_modules`, `.git`, `.next`, `dist` kabi papkalar ro'yxatga kirmaydi.
- **"AI fayl ro'yxatini ko'rsin"** yoqilgan bo'lsa, modelga faqat *nomlar*
  yuboriladi (mazmun emas) — shunda u kerakli faylni o'zi so'ray oladi.

**Maxfiylik.** Papka serverga yuklanmaydi. Faqat siz `@` bilan tanlagan fayl
AI'ga boradi. Ruxsatni brauzerning o'zi boshqaradi.

**Brauzer.** Chrome va Edge'da papka jonli ulanadi (fayl o'zgarsa yangisi
o'qiladi). Firefox va Safari'da papkaning nusxasi olinadi — o'zgarishlarni
ko'rish uchun papkani qayta tanlash kerak.

---

## 4. Javob ichida jonli ko'rinish (Generative UI)

Model kerak bo'lganda javobida oddiy matn o'rniga komponent chizadi: KPI
kartalari, grafik (ustun/chiziq/soha/doira), jadval, qadamlar yoki belgilanadigan
ro'yxat.

Model kod yubormaydi — faqat tekshiriladigan JSON. Noto'g'ri yoki yarim kelgan
blok skeleton bo'lib qoladi, xom JSON hech qachon ko'rinmaydi.

---

## 5. `@` eslatmalari

`@` yozganda ikkita manba birlashtiriladi:

| Belgi | Manba | Nima bo'ladi |
|---|---|---|
| Cowork | Kompyuteringizdagi papka | Fayl o'qilib xabarga biriktiriladi |
| KB | Bilim bazasi hujjatlari | Server o'sha hujjat qismlarini kontekstga oladi |

Bilim bazasi hujjati `@` bilan tanlansa, o'xshashlik qidiruvi o'tkazilmaydi —
aynan o'sha hujjatdan o'qiladi.

---

## 6. Skills market

Chapdagi **Skills** bo'limida katalog bor: qidiruv, kategoriya, batafsil tavsif,
yoqish/o'chirish. Pastda **o'z skilingizni** yozishingiz mumkin (nom + qoidalar).

- O'z skillaringiz shu qurilmada saqlanadi.
- Faqat **yoqilgani** so'rov bilan birga ketadi (maks 3 ta, 2000 belgigacha).

---

## 7. Provayderlar: OmniRoute asosiy, qolgani zaxira

OmniRoute (Railway) sozlangan bo'lsa, **tekin/arzon modellar avval unga boradi** — u o'zi
ulangan provayderlar (Groq, Gemini, Mistral, OpenRouter…) orasida kvotaga qarab almashtiradi.
OmniRoute xato bersa, xuddi shu model to'g'ridan-to'g'ri provayder orqali qayta uriniladi,
keyin boshqa modelga, oxirida kalitsiz LLM7 ga o'tiladi. Flagman modellar (Claude/GPT)
OmniRoute'ga yuborilmaydi: uning "auto" tanlovi ularni pullik yo'l orqali yuborib xarajatni oshiradi.

`OMNIROUTE_MODEL=auto/gemini` — sinovda ishlagan tanlov. `auto`, `auto/cheap`, `auto/best-free`
yaroqsiz yoki qimmat bo'lib chiqdi.

## 7a. Zaxira zanjiri

Asosiy yo'nalish ishlamay qolsa, tartib bilan quyidagilarga o'tiladi. Har biri
faqat `.env` da kaliti bo'lsa ishlaydi:

| Tartib | Xizmat | Env |
|---|---|---|
| 1 | Experiential Labs | `EXPERIENTIAL_API_KEY`, `EXPERIENTIAL_MODEL` |
| 2 | O'z OmniRoute instansiyangiz | `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY` |
| 3 | Boshqa OpenAI-mos shlyuz | `GATEWAY_BASE_URL`, `GATEWAY_API_KEY` |
| 4 | LLM7 (kalitsiz, tekin) | `LLM7_API_KEY` (ixtiyoriy) |

To'g'ridan-to'g'ri provayderlar: Groq, Cerebras, SambaNova, Mistral, OpenAI,
NVIDIA NIM (`NVIDIA_API_KEY`), OpenRouter.

### OmniRoute'ni ulash

OmniRoute — alohida server, Vercel funksiyasi ichida ishlamaydi. Uni alohida
ko'tarasiz:

```bash
npm install -g omniroute
omniroute serve --port 4000
```

Doimiy ishlashi uchun Railway, Fly.io yoki VPS'ga qo'ying, keyin Vercel env'ga:

```
OMNIROUTE_BASE_URL=https://sizning-omniroute.example.com/v1
OMNIROUTE_API_KEY=...
```

---

## 8. CLI (`@islombekrrr/sov-cli`)

| Buyruq | Vazifasi |
|---|---|
| `sov` | Vibe rejim: kodni faqat AI yozadi, fayl uchun tasdiq so'ralmaydi |
| `sovereign` | Oddiy rejim: har bir o'zgarish tasdiqlanadi |
| `@yo'l` | Faylni biriktirish; Tab bilan yo'l to'ldiriladi |
| `/vibe` | Vibe rejimni yoqish/o'chirish |
| `/swarm 4 <vazifa>` | 2–8 ishchi parallel ishlaydi, natija birlashtiriladi |
| `/sessions` | Saqlangan suhbatlar |
| `/resume <id>` | Suhbatni davom ettirish |
| `/rewind [n]` | Oxirgi n savolni qaytarish |
| `/fork` | Joriy suhbatdan yangi shox |

Vibe rejimda ham **xavfli terminal buyruqlari tasdiq so'raydi** — bu chegara
ataylab ochilmagan.


---

## 9. Til (i18n)

Sozlamalar → **Til** yoki lending'dagi tanlagich: O'zbekcha (lotin), Ўзбекча (кирилл),
Русский, English. Tanlov brauzerda saqlanadi; interfeys asosiy matnlari va **AI javob tili**
shunga o'tadi (foydalanuvchi boshqa tilda yozsa, AI o'sha tilda javob beradi).
Yangi til qo'shish: `src/lib/i18n.ts` — bitta lug'at, bitta ustun.

## 10. Onboarding

7 qadam: maqsad, soha, ustuvorlik, tillar, tajriba, **yosh guruhi**, **davlat**.
Yosh va davlat `profiles.onboarding` JSON ichida saqlanadi (`ageGroup`, `country`, `otherCountry`).
