# Tella 2 — o'z modelimiz va uni o'rgatish

Tella 2 (`D:\My_apps\tella2`) — Qwen2.5 asosidagi, o'z serverimizda ishlaydigan
model. SOVEREIGN endi uni chatda model sifatida ko'rsatadi va kuchli modellarning
javoblarini uni o'rgatish uchun to'playdi.

---

## 1. Tella'ni ishga tushirish

```bash
ollama pull qwen2.5:7b-instruct
cd D:\My_apps\tella2
ollama create tella2 -f Modelfile
ollama run tella2 "Salom"
```

Ollama OpenAI-mos API beradi: `http://localhost:11434/v1`

## 2. SOVEREIGN'ga ulash

**Lokal test** (`.env.local`):

```
TELLA_BASE_URL=http://localhost:11434/v1
TELLA_MODEL=tella2
NEXT_PUBLIC_TELLA_ENABLED=1
```

`npm run dev` — model ro'yxatida **Tella 2** paydo bo'ladi.

**Saytda (Vercel).** Vercel funksiyasi sizning kompyuteringizga kira olmaydi, shuning
uchun Tella ochiq manzilda turishi kerak. Ikki yo'l:

1. **Tunnel** (test uchun, kompyuter yoqiq turishi kerak):
   ```bash
   cloudflared tunnel --url http://localhost:11434
   ```
   Chiqqan manzilni `TELLA_BASE_URL=https://xxx.trycloudflare.com/v1` qilib qo'ying.

2. **GPU server** (doim ishlashi uchun): Runpod yoki Hetzner'da Ollama/vLLM.
   Manzilni token bilan himoyalang va `TELLA_API_KEY` ni ham qo'ying.

`NEXT_PUBLIC_TELLA_ENABLED=1` bo'lmasa model ro'yxatda ko'rinmaydi — server
ko'tarilmaganda foydalanuvchi xato olmasligi uchun.

---

## 3. O'z-o'zini o'rgatish (distillation)

Har safar Claude, GPT yoki Gemini javob berganda, savol-javob juftligi trening
bazasiga yoziladi. Keyin shu ma'lumotda Tella fine-tune qilinadi — ya'ni Tella
kuchli modellardan **o'rganadi**.

Yoqish: Vercel env'ga `TRAINING_CAPTURE=on` va `0018` migratsiyani ishga tushiring.

### Nima YOZILMAYDI (kod tomonida qat'iy bloklangan)

| Holat | Sabab |
|---|---|
| Foydalanuvchi sozlamada o'chirgan | Rozilik yo'q |
| Fayl biriktirilgan, `@hujjat` yoki Cowork papka ishlatilgan | Shaxsiy hujjat |
| Maxfiy rejim (Blind Prompting) yoqilgan | Maskalangan matn modelni buzadi |
| Email, telefon, karta raqami yoki API kalit bor | Shaxsiy ma'lumot |
| Javob 120 belgidan qisqa | Sifatsiz namuna |
| Xuddi shu savol allaqachon bor | Takror |

`user_id` **umuman saqlanmaydi** — savol kimniki ekani bog'lanmaydi.

### Ma'lumotni olish

Admin sifatida:

```
https://soveregn.xyz/api/admin/training?limit=2000
```

JSONL fayl yuklanadi — `finetune/train_qlora.py` aynan shu formatni kutadi:

```json
{"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

### Fine-tune

```bash
cd D:\My_apps\tella2
# yuklab olingan faylni finetune/data.jsonl ga qo'ying
pip install -r finetune/requirements.txt
python finetune/train_qlora.py        # Colab T4 tekin yoki Runpod ~$0.4/soat
ollama create tella2 -f tella2-gguf/Modelfile
```

500–2000 ta sifatli juftlikdan boshlash mumkin.

---

## Halol baho: Tella Grok yoki ChatGPT bo'la oladimi?

**Yo'q, bo'la olmaydi** — va buni bilib turish muhim.

| | Tella 2 | GPT-5 / Grok / Claude |
|---|---|---|
| Parametr | 7 mlrd | ~1000+ mlrd (aniq son yashirin) |
| Trening narxi | ~$5 (fine-tune) | yuz millionlab dollar |
| Trening ma'lumoti | sizning bir necha ming juftligingiz | internetning katta qismi |
| Qurilma | 1 ta GPU | o'n minglab GPU |

Fine-tuning modelga **yangi aql qo'shmaydi** — u faqat mavjud bilimni sizning
uslubingizga, tilingizga va mavzuingizga **moslashtiradi**. Tella'ning asosiy
kuchi Qwen2.5'dan keladi.

**Tella real ravishda nimada yutadi:**

- **Maxfiylik** — ma'lumot sizning serveringizdan chiqmaydi.
- **Narx** — so'rov uchun to'lov yo'q, faqat server.
- **O'zbek tili** — o'z ma'lumotingizda moslashtirsangiz, katta modellardan ham
  tabiiyroq yozishi mumkin.
- **Tezlik** — kichik model, qisqa javoblarda tez.

Shuning uchun to'g'ri strategiya: og'ir vazifalar (murakkab kod, tahlil) kuchli
modellarda qolsin, oddiy va maxfiy vazifalar Tella'ga o'tsin.
