# SOVEREIGN Skills

Chatbot javoblariga qo'shiladigan ekspert "playbook"lar. Ochiq Claude-skill'lardan moslashtirilgan:

- **UI/UX Pro Max** — [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- **Apple Design** — [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill)
- **Cybersecurity** — [mukul975/anthropic-cybersecurity-skills](https://github.com/mukul975/anthropic-cybersecurity-skills)
- Qo'shimcha: Clean Code, Pro Writing, Data Viz

## Qanday ishlaydi

- Har bir skill `src/config/skills.ts` da: nomi, tavsifi, trigger regex'lari va tizim-promptga qo'shiladigan qoidalar.
- **Avtomatik**: foydalanuvchi xabari trigger'ga mos kelsa (masalan "React da form yoz" → UI/UX + Clean Code), skill o'sha so'rovga faollashadi.
- **Qo'lda**: input'dagi **Skills** tugmasidan yoqib/o'chirib qo'yasiz. Yoqilganlar har javobga qo'shiladi. Default: UI/UX Pro Max + Clean Code.
- Server (`/api/chat`) yoqilgan + avtomatik aniqlangan skill'larni birlashtirib, ularning qoidalarini model tizim-promptiga qo'shadi va qaysilari ishlatilganini `skills` SSE hodisasi bilan qaytaradi.
- Javob ostida qaysi skill'lar qo'llanilgani badge sifatida ko'rinadi.

## Yangi skill qo'shish

`src/config/skills.ts` dagi `SKILLS` massiviga yangi obyekt qo'shing:

```ts
{
  id: "my-skill",
  name: "Nomi",
  description: "Qisqa tavsif",
  category: "code",          // code | design | security | writing | data
  glyph: "◆",
  color: "#5B50F0",
  triggers: [/regex1/i, /regex2/i],
  prompt: "Skill faol bo'lganda modelga beriladigan qoidalar...",
  defaultOn: false,
}
```

Cybersecurity katalogida 800+ skill bor (34 domen). Hozir bittasi umumiy "Cybersecurity" skill sifatida jamlangan; kerak bo'lsa domenlarga (Web App, Cloud, Forensics, Malware, ...) ajratib, har biriga alohida trigger va prompt berish mumkin.
