@AGENTS.md

## i18n — majburiy qoida

Foydalanuvchiga ko'rinadigan HAR BIR yangi matn (sahifa, komponent, tugma, aria-label/placeholder/title, xato xabari, email, desktop UI) darhol **4 tilda** qo'shiladi: `uz` (lotin), `uz-cyrl`, `ru`, `en`. Standart til — `en`.

- Web: kalitlar `src/lib/locales/*.ts` (`Dict`, har kalitda 4 til), komponentda `useT()` / `t("key")`, serverda `getServerT()`. Qattiq yozilgan matn qoldirmang.
- Desktop: `desktop/ui/src/lib/i18n.js`. CLI — o'zbekcha (dizayn bo'yicha).
- Ish tugagach: `npm run i18n:check` (etishmayotgan til / bo'sh qiymat / mavjud bo'lmagan kalit) toza bo'lishi kerak.
