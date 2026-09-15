# SOVEREIGN AI — To'liq Arxitektura Hujjati
**Versiya:** 1.0 | **Sana:** 2026 | **Maxfiylik darajasi:** Founder-only

---

## 1. PLATFORMA HAQIDA UMUMIY MA'LUMOT

SOVEREIGN — VeriTrust (Zero-Trust Middleware) va SELF (Persistent Identity) konsepsiyalarini birlashtirgan, 
OpenRouter orqali barcha yirik AI modellariga xavfsiz kirishni ta'minlovchi va 
Perplexity Sonar API orqali real-vaqt internet tadqiqotini integratsiya qilgan 
maxfiylik-birinchi AI platforma.

### Asosiy printsiplar
1. **Zero-Trust Privacy** — hech bir tashqi servis foydalanuvchining haqiqiy ma'lumotini ko'rmaydi
2. **Persistent Sovereignty** — xotira va identifikatsiya foydalanuvchiga tegishli
3. **Model Agnosticism** — bitta interfeys orqali barcha modellar
4. **Verified Truth** — barcha AI javoblari faktik tekshiruvdan o'tadi
5. **Research-First** — Perplexity bilan real internet ma'lumotlari

---

## 2. TEXNOLOGIYA STEKI

### Frontend
```
Framework:     Next.js 15 (App Router)
UI Library:    shadcn/ui + Radix UI primitives
Styling:       Tailwind CSS v4 + CSS Variables (per-model theming)
Animations:    Framer Motion
State:         Zustand (global) + React Query (server state)
Forms:         React Hook Form + Zod validation
Icons:         Lucide React
Fonts:         Variable fonts via Google Fonts
```

### Backend
```
Runtime:       Node.js 20 LTS (Bun yoki Next.js API routes)
Database:      PostgreSQL (Supabase) — user data, sessions
Vector DB:     pgvector (Supabase) — memory embeddings
Cache:         Redis (Upstash) — session, rate limiting
Auth:          Supabase Auth (Google OAuth + Email/Password)
File Storage:  Supabase Storage — user uploads, knowledge files
```

### AI & API
```
Model Router:  OpenRouter API (openrouter.ai/api/v1)
Research AI:   Perplexity Sonar API (api.perplexity.ai)
Embeddings:    OpenAI text-embedding-3-small (via OpenRouter)
Local fallback: Ollama (self-hosted, ixtiyoriy)
```

### Privacy & Security
```
Tokenization:  Custom Blind Prompting SDK (TypeScript)
Encryption:    AES-256-GCM (Web Crypto API)
Key Storage:   Supabase Vault + user-controlled KMS
ZKP Library:   snarkjs (WebAssembly, client-side)
Secrets:       HashiCorp Vault yoki AWS KMS (enterprise)
```

### Deployment
```
Hosting:       Vercel (frontend + API routes)
Edge:          Vercel Edge Functions (privacy layer)
CDN:           Cloudflare
Monitoring:    Sentry + Vercel Analytics
CI/CD:         GitHub Actions
```

---

## 3. TIZIM ARXITEKTURASI

```
┌─────────────────────────────────────────────────────────────┐
│                     FOYDALANUVCHI QURILMASI                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Next.js Frontend (Browser)               │  │
│  │                                                       │  │
│  │   ┌─────────────┐    ┌─────────────────────────┐    │  │
│  │   │  Auth Layer  │    │   Personal AI Vault      │    │  │
│  │   │  (Supabase)  │    │  (Encrypted localStorage) │    │  │
│  │   └─────────────┘    └─────────────────────────┘    │  │
│  │                                                       │  │
│  │   ┌───────────────────────────────────────────────┐  │  │
│  │   │         Blind Prompting SDK (Client-side)      │  │  │
│  │   │   User Input → Tokenize → Mask → Send         │  │  │
│  │   └───────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    HTTPS (Shifrlangan)
                              │
┌─────────────────────────────────────────────────────────────┐
│                   SOVEREIGN BACKEND (Vercel)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            API Gateway (Next.js Route Handlers)       │  │
│  │                                                       │  │
│  │  /api/chat    /api/research    /api/memory    /api/verify │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│         ┌────────────────┼────────────────┐                 │
│         │                │                │                 │
│  ┌──────▼──────┐ ┌───────▼──────┐ ┌──────▼────────┐      │
│  │  Contextual  │ │   Research   │ │Neural-Symbolic │      │
│  │  Enrichment  │ │   Engine     │ │  Verification  │      │
│  │  (Memory     │ │  (Perplexity)│ │  (Fact Check)  │      │
│  │   Injection) │ └──────────────┘ └───────────────┘      │
│  └──────────────┘                                           │
│         │                                                   │
│  ┌──────▼──────────────────────────────────────────────┐  │
│  │              Model Orchestrator (OpenRouter)          │  │
│  │                                                       │  │
│  │  GPT-4o  │  Claude  │  Gemini  │  LLaMA  │  Mistral │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Database Layer                     │  │
│  │   PostgreSQL (Supabase) │ pgvector │ Redis (Upstash) │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. AUTENTIFIKATSIYA VA ONBOARDING OQIMI

### 4.1 Ro'yxatdan o'tish

```
Bosqich 1: Kirish varianti tanlash
├── Google OAuth (Supabase Auth orqali)
└── Email + Parol (magic link yoki parol)

Bosqich 2: Email tasdiqlash (agar email tanlangan bo'lsa)

Bosqich 3: Onboarding Questionnaire (5 savol)
├── Savol 1: "AI'ni asosan nima uchun ishlatasiz?"
│   └── Variantlar: Ish/Biznes | Tadqiqot | Ijodiy | Shaxsiy
│
├── Savol 2: "Qaysi sohada ishlaysiz?"
│   └── Variantlar: Texnologiya | Biznes | Ta'lim | Sog'liqni saqlash | 
│                   Huquq | Moliya | Ijod | Boshqa
│
├── Savol 3: "Siz uchun eng muhimi nima?"
│   └── Variantlar: Tezlik | Aniqlik | Maxfiylik | Narx | (multi-select)
│
├── Savol 4: "Qaysi tillarda ishlaysiz?"
│   └── Multi-select: O'zbek | Rus | Ingliz | + boshqalar
│
└── Savol 5: "Qanday hajmdagi kontekst kerak?"
    └── Variantlar: Qisqa suhbatlar | O'rta loyihalar | Uzun tadqiqotlar

Bosqich 4: Shaxsiy AI Vault yaratish
├── Master parol tanlash (lokal shifrlash uchun)
├── Yoki hardware key (YubiKey/TouchID/FaceID)
└── Recovery key generatsiya va saqlash

Bosqich 5: Tanlangan javoblarga qarab default model tanlash
└── Dashboard'ga yo'naltirish
```

### 4.2 Session Management

```typescript
// Supabase session + lokal vault kombinatsiyasi
interface UserSession {
  supabaseSession: Session;           // Server auth
  vaultKey: CryptoKey;               // Client-side encryption key
  memoryGraph: EncryptedMemoryGraph; // Lokal + bulut sync
  preferences: UserPreferences;      // Onboarding javoblari
}
```

---

## 5. OPENROUTER API INTEGRATSIYASI

### 5.1 Qo'llab-quvvatlanadigan modellar

```typescript
export const SOVEREIGN_MODELS = {
  // Premium modellar
  "claude-sonnet-4-5":    { provider: "anthropic", theme: "claude",    cost: "$$"    },
  "gpt-4o":               { provider: "openai",    theme: "chatgpt",   cost: "$$"    },
  "gemini-pro-1.5":       { provider: "google",    theme: "gemini",    cost: "$$"    },
  "mistral-large":        { provider: "mistral",   theme: "mistral",   cost: "$$"    },
  
  // Tekin modellar (OpenRouter free tier)
  "llama-3.1-8b:free":    { provider: "meta",      theme: "llama",     cost: "free"  },
  "gemma-2-9b:free":      { provider: "google",    theme: "gemini",    cost: "free"  },
  "mistral-7b:free":      { provider: "mistral",   theme: "mistral",   cost: "free"  },
  "qwen-2.5-7b:free":     { provider: "alibaba",   theme: "qwen",      cost: "free"  },
  
  // Research (Perplexity)
  "sonar-online":         { provider: "perplexity",theme: "perplexity",cost: "free"  },
  "sonar-pro-online":     { provider: "perplexity",theme: "perplexity",cost: "$"     },
} as const;
```

### 5.2 OpenRouter API chaqiruvi

```typescript
// src/lib/openrouter.ts

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

interface SovereignChatRequest {
  maskedMessages: Message[];      // Blind Prompting'dan o'tgan
  modelId: string;
  memoryContext: string;          // Maskalangan xotira konteksti
  temperature?: number;
  maxTokens?: number;
}

export async function callOpenRouter(req: SovereignChatRequest) {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://sovereign.ai",
      "X-Title": "SOVEREIGN AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: req.modelId,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(req.memoryContext)
        },
        ...req.maskedMessages
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      // OpenRouter-specific options
      transforms: ["middle-out"],  // Token compression
      route: "fallback",           // Agar model band bo'lsa, fallback
    }),
  });
  
  return response.json();
}

// Smart routing: so'rov turiga qarab model tanlash
export function selectOptimalModel(
  query: string, 
  userPrefs: UserPreferences
): string {
  if (isCodeQuery(query))     return "gpt-4o";
  if (isResearchQuery(query)) return "sonar-online";
  if (isCreativeQuery(query)) return "claude-sonnet-4-5";
  if (isMathQuery(query))     return "gemini-pro-1.5";
  
  // Foydalanuvchi budget preferensiyasiga qarab
  if (userPrefs.budget === "free") return "llama-3.1-8b:free";
  return userPrefs.defaultModel ?? "claude-sonnet-4-5";
}
```

### 5.3 Model fallback zanjiri

```
Asosiy model → Alternativ → Tekin fallback → Xato
claude-sonnet → claude-haiku → llama-3.1-8b:free → Error
gpt-4o        → gpt-4o-mini  → llama-3.1-8b:free → Error
gemini-pro    → gemini-flash  → gemma-2-9b:free   → Error
```

---

## 6. PERPLEXITY RESEARCH INTEGRATSIYASI

### 6.1 Nima uchun Perplexity?

```
✓ Real-vaqt internet qidiruvi (Google kabi)
✓ Sonar modeli tekin (sonar-small-online)
✓ Manbalar bilan birga javob qaytaradi
✓ RAG (Retrieval Augmented Generation) o'rnatilgan
✓ API OpenAI-compatible (oson integratsiya)
```

### 6.2 Perplexity API chaqiruvi

```typescript
// src/lib/perplexity.ts

const PERPLEXITY_BASE = "https://api.perplexity.ai";

interface ResearchRequest {
  maskedQuery: string;           // Blind Prompting'dan o'tgan
  searchFocus?: "web" | "academic" | "news" | "youtube";
  returnSources?: boolean;
}

export async function researchWithPerplexity(req: ResearchRequest) {
  const response = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-sonar-small-128k-online", // TEKIN model
      // Premium: "llama-3.1-sonar-large-128k-online"
      messages: [
        {
          role: "system",
          content: `Sen aniq va ishonchli ma'lumot beruvchi tadqiqotchisan. 
                    Faqat tasdiqlangan manbalardan javob ber. 
                    Har bir da'voni manba bilan asosla.`
        },
        {
          role: "user",
          content: req.maskedQuery
        }
      ],
      temperature: 0.2,          // Past temp = aniqroq javoblar
      max_tokens: 2048,
      return_citations: true,    // Manbalar ro'yxatini qaytarish
      search_recency_filter: "month", // Oxirgi oy ma'lumotlari
    }),
  });
  
  const data = await response.json();
  
  return {
    content: data.choices[0].message.content,
    citations: data.citations ?? [],  // Manba URL'lari
    usage: data.usage,
  };
}
```

### 6.3 Research rejimini qachon ishlatish

```typescript
export function shouldUseResearch(query: string): boolean {
  const researchTriggers = [
    /so'nggi|yangi|bugun|hozir|2024|2025|2026/i,
    /narx|qiymat|statistika|ma'lumot/i,
    /kim|qachon|qayerda|nima bo'ldi/i,
    /yangilik|xabar|hodisa/i,
    /tadqiqot|maqola|ilmiy/i,
  ];
  
  return researchTriggers.some(pattern => pattern.test(query));
}

// Hybrid: Perplexity (faktlar) + OpenRouter (sintez)
export async function hybridResponse(query: string) {
  const [researchData, aiResponse] = await Promise.all([
    researchWithPerplexity({ maskedQuery: maskQuery(query) }),
    callOpenRouter({ 
      maskedMessages: [{ role: "user", content: maskQuery(query) }],
      modelId: "claude-sonnet-4-5",
      memoryContext: ""
    })
  ]);
  
  // Neural-Symbolic Verification bilan birlashtirish
  return synthesizeAndVerify(researchData, aiResponse);
}
```

---

## 7. BLIND PROMPTING SDK

### 7.1 Tokenizatsiya jarayoni

```typescript
// src/lib/blind-prompting.ts

interface TokenMap {
  [token: string]: string;  // "[ENTITY_A]" → "Asilbek Yusupov"
}

export class BlindPromptingSDK {
  private tokenMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  
  // Matnni anonimlashtirish
  mask(text: string): { masked: string; tokenMap: TokenMap } {
    let masked = text;
    
    // 1. Shaxs ismlarini topish va almashtirish (NER)
    masked = this.replaceEntities(masked, "PERSON");
    
    // 2. Kompaniya nomlarini almashtirish
    masked = this.replaceEntities(masked, "ORG");
    
    // 3. Raqamli qiymatlarni almashtirish
    masked = this.replaceValues(masked);
    
    // 4. Email va telefon raqamlarini almashtirish
    masked = this.replacePII(masked);
    
    // 5. URL va domain nomlarini almashtirish
    masked = this.replaceURLs(masked);
    
    return {
      masked,
      tokenMap: Object.fromEntries(this.tokenMap)
    };
  }
  
  // AI javobini qayta tiklash
  unmask(text: string): string {
    let unmasked = text;
    this.reverseMap.forEach((original, token) => {
      unmasked = unmasked.replaceAll(token, original);
    });
    return unmasked;
  }
  
  private generateToken(type: string): string {
    const count = [...this.tokenMap.keys()]
      .filter(k => k.startsWith(`[${type}`)).length;
    return `[${type}_${String.fromCharCode(65 + count)}]`;
    // Natija: [PERSON_A], [PERSON_B], [ORG_A], [VAL_1], etc.
  }
}

// Misol:
// Input:  "Asilbek Yusupov kompaniyasi FayzInc $50,000 byudjet bilan..."
// Output: "[PERSON_A] kompaniyasi [ORG_A] [VAL_1] byudjet bilan..."
// AI javob beradi, keyin tokenlar qayta tiklanadi
```

---

## 8. XOTIRA TIZIMI (PERSISTENT MEMORY GRAPH)

### 8.1 Ma'lumotlar bazasi sxemasi

```sql
-- Foydalanuvchi profili
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE,
  google_id     TEXT UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  onboarding    JSONB,          -- Onboarding javoblari
  preferences   JSONB,          -- UI, model, til sozlamalari
  default_model TEXT DEFAULT 'claude-sonnet-4-5'
);

-- Xotira tugunlari (Memory Graph)
CREATE TABLE memory_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,           -- Shifrlangan matn
  content_enc   BYTEA,                   -- AES-256 shifrlangan versiya
  embedding     vector(1536),            -- Semantik qidiruv uchun
  node_type     TEXT,                    -- 'fact' | 'preference' | 'project' | 'person'
  importance    FLOAT DEFAULT 0.5,       -- 0-1 muhimlik darajasi
  access_count  INT DEFAULT 0,           -- Qancha marta ishlatilgan
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ,
  metadata      JSONB
);

-- Xotira aloqalari (Knowledge Graph edges)
CREATE TABLE memory_edges (
  from_node     UUID REFERENCES memory_nodes(id),
  to_node       UUID REFERENCES memory_nodes(id),
  relation      TEXT,                    -- 'relates_to' | 'contradicts' | 'supports'
  weight        FLOAT DEFAULT 1.0,
  PRIMARY KEY (from_node, to_node)
);

-- Suhbat tarixi
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  model_used    TEXT,
  title         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  metadata      JSONB                    -- model-specific metadata
);

-- Suhbat xabarlari
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role          TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content       BYTEA NOT NULL,          -- AES-256 shifrlangan
  masked_content TEXT,                   -- Log/debug uchun tokenizatsiyalangan
  citations     JSONB,                   -- Perplexity manbalar
  verified      BOOLEAN DEFAULT FALSE,   -- Neural-Symbolic tekshiruv
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Base (foydalanuvchi yuklagan fayllar)
CREATE TABLE knowledge_base (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT,
  content_enc   BYTEA,                   -- Shifrlangan fayl tarkibi
  embedding     vector(1536),
  chunk_index   INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indekslar
CREATE INDEX ON memory_nodes USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON memory_nodes (user_id, importance DESC);
```

### 8.2 Xotiradan kontekst olish

```typescript
// src/lib/memory.ts

export async function retrieveRelevantMemory(
  userId: string,
  query: string,
  limit: number = 5
): Promise<MemoryContext> {
  // 1. So'rovni vektorga aylantirish
  const queryEmbedding = await embed(query);
  
  // 2. pgvector bilan semantik qidiruv
  const relevantNodes = await supabase.rpc('match_memories', {
    query_embedding: queryEmbedding,
    user_id: userId,
    match_threshold: 0.7,
    match_count: limit
  });
  
  // 3. Shifrlashni ochish va kontekst yaratish
  const decryptedNodes = await Promise.all(
    relevantNodes.data.map(node => decryptNode(node))
  );
  
  // 4. Tokenizatsiya (Blind Prompting uchun)
  const sdk = new BlindPromptingSDK();
  const maskedContext = decryptedNodes
    .map(n => sdk.mask(n.content).masked)
    .join("\n\n");
  
  return {
    maskedContext,
    nodeCount: decryptedNodes.length,
    tokenMap: sdk.getTokenMap()
  };
}
```

---

## 9. NEURAL-SYMBOLIC VERIFICATION ENGINE

```typescript
// src/lib/verification.ts

interface VerificationResult {
  isVerified: boolean;
  confidence: number;        // 0-1
  corrections: Correction[];
  finalContent: string;
}

export async function verifyAIResponse(
  aiResponse: string,
  userId: string,
  researchData?: ResearchData
): Promise<VerificationResult> {
  
  const corrections: Correction[] = [];
  
  // 1. Faktik da'volarni ajratish
  const claims = await extractClaims(aiResponse);
  
  // 2. Har bir da'voni tekshirish
  for (const claim of claims) {
    
    // a) Foydalanuvchi Knowledge Graph bilan solishtirish
    const graphCheck = await checkAgainstKnowledgeGraph(claim, userId);
    
    // b) Agar Perplexity ma'lumoti mavjud bo'lsa, u bilan solishtirish
    if (researchData) {
      const webCheck = checkAgainstResearch(claim, researchData);
      if (!webCheck.matches && graphCheck.confidence < 0.8) {
        corrections.push({
          original: claim.text,
          corrected: webCheck.corrected,
          source: webCheck.source,
          type: 'factual_correction'
        });
      }
    }
    
    // c) Lokal First-Order Logic tekshiruvi
    const logicCheck = applyFirstOrderLogic(claim, graphCheck.relatedFacts);
    if (!logicCheck.isConsistent) {
      corrections.push({
        original: claim.text,
        corrected: logicCheck.correctedVersion,
        source: 'knowledge_graph',
        type: 'logical_correction'
      });
    }
  }
  
  // 3. Kerakli tuzatishlarni qo'llash
  let finalContent = aiResponse;
  for (const correction of corrections) {
    finalContent = finalContent.replace(correction.original, correction.corrected);
  }
  
  return {
    isVerified: corrections.length === 0,
    confidence: calculateConfidence(corrections, claims),
    corrections,
    finalContent
  };
}
```

---

## 10. API ENDPOINTLAR

```
POST /api/auth/register          — Ro'yxatdan o'tish
POST /api/auth/login             — Kirish (email/parol)
GET  /api/auth/google            — Google OAuth
POST /api/auth/onboarding        — Onboarding savollari saqlash

POST /api/chat                   — Asosiy chat endpoint
  Body: { message, modelId, conversationId?, useResearch? }
  Response: SSE stream (Server-Sent Events) — real-vaqt javob

GET  /api/chat/history           — Suhbat tarixi
GET  /api/chat/:conversationId   — Bitta suhbat
DELETE /api/chat/:conversationId — Suhbatni o'chirish

GET  /api/models                 — Mavjud modellar ro'yxati
POST /api/models/suggest         — So'rovga qarab model tavsiyasi

POST /api/memory/search          — Xotiradan qidiruv
GET  /api/memory/nodes           — Xotira tugunlari
DELETE /api/memory/nodes/:id     — Bitta xotirani o'chirish
DELETE /api/memory/all           — Barcha xotirani o'chirish (⚠️)

POST /api/knowledge/upload       — Fayl yuklash
GET  /api/knowledge/files        — Yuklangan fayllar
DELETE /api/knowledge/files/:id  — Faylni o'chirish

GET  /api/user/profile           — Profil ma'lumotlari
PUT  /api/user/preferences       — Sozlamalarni yangilash
GET  /api/user/export            — Barcha ma'lumotlarni eksport (GDPR)
DELETE /api/user/account         — Hisobni o'chirish (⚠️)
```

---

## 11. REAL-VAQT STREAMING (SSE)

```typescript
// src/app/api/chat/route.ts

export async function POST(req: Request) {
  const { message, modelId, conversationId } = await req.json();
  
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      
      // 1. Blind Prompting
      const sdk = new BlindPromptingSDK();
      const { masked } = sdk.mask(message);
      
      // 2. Xotiradan kontekst olish
      const memory = await retrieveRelevantMemory(userId, message);
      
      // 3. Tadqiqot kerakmi?
      let researchData;
      if (shouldUseResearch(message)) {
        researchData = await researchWithPerplexity({ 
          maskedQuery: sdk.mask(message + " " + memory.maskedContext).masked 
        });
      }
      
      // 4. OpenRouter'ga jo'natish (streaming)
      const openRouterStream = await callOpenRouterStream({
        maskedMessages: [{ role: "user", content: masked }],
        modelId,
        memoryContext: memory.maskedContext,
      });
      
      // 5. Stream'dan o'qish va real-vaqt jo'natish
      let fullResponse = "";
      for await (const chunk of openRouterStream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        fullResponse += text;
        
        // Tokenlarni qayta tiklash va jo'natish
        const unmasked = sdk.unmask(text);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: unmasked })}\n\n`));
      }
      
      // 6. Javobni tekshirish va xotiraga saqlash
      const verified = await verifyAIResponse(sdk.unmask(fullResponse), userId, researchData);
      await saveToMemory(userId, message, verified.finalContent);
      
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

---

## 12. MODEL TEMA TIZIMI (UI Atmosphere Switching)

```typescript
// src/config/model-themes.ts

export const MODEL_THEMES = {
  claude: {
    name: "Claude",
    provider: "Anthropic",
    primaryColor: "#CC785C",       // Issiq korall
    bgColor: "#1A0F0A",            // Qo'ng'ir-qora
    accentColor: "#D4956A",        // Tilla-korall
    fontDisplay: "Tiempos Headline, serif",
    fontBody: "Söhne, sans-serif",
    borderRadius: "12px",
    animationStyle: "smooth",
    gradientFrom: "#2D1810",
    gradientTo: "#1A0F0A",
    greeting: "Salom! Men Claude, Anthropic tomonidan yaratilganman.",
    welcomeEmoji: "✦",
  },
  
  chatgpt: {
    name: "ChatGPT",
    provider: "OpenAI",
    primaryColor: "#10A37F",       // GPT yashil
    bgColor: "#0D0D0D",            // Sof qora
    accentColor: "#19C37D",        // Yorqin yashil
    fontDisplay: "Söhne, sans-serif",
    fontBody: "Söhne, sans-serif",
    borderRadius: "8px",
    animationStyle: "instant",
    gradientFrom: "#0D1117",
    gradientTo: "#0D0D0D",
    greeting: "Assalomu alaykum! Men GPT, OpenAI tomonidan yaratilganman.",
    welcomeEmoji: "⬡",
  },
  
  gemini: {
    name: "Gemini",
    provider: "Google",
    primaryColor: "#4285F4",       // Google ko'k
    bgColor: "#0C0C1E",            // Deep blue-qora
    accentColor: "#A855F7",        // Binafsha
    fontDisplay: "Google Sans, sans-serif",
    fontBody: "Roboto, sans-serif",
    borderRadius: "24px",
    animationStyle: "material",
    gradientFrom: "#0C1A3D",
    gradientTo: "#0C0C1E",
    greeting: "Salom! Men Gemini, Google tomonidan yaratilganman.",
    welcomeEmoji: "✦",
    // Rainbow gradient aksent: Ko'k → Binafsha → Qizil → Sariq
    multiColor: ["#4285F4", "#EA4335", "#FBBC05", "#34A853"],
  },
  
  perplexity: {
    name: "Perplexity",
    provider: "Perplexity AI",
    primaryColor: "#20808D",       // Teal
    bgColor: "#0A0E14",            // Qora-ko'k
    accentColor: "#29A0AD",        // Yorqin teal
    fontDisplay: "Helvetica Neue, sans-serif",
    fontBody: "Inter, sans-serif",
    borderRadius: "6px",
    animationStyle: "research",    // Qidiruv animatsiyasi
    gradientFrom: "#0A1520",
    gradientTo: "#0A0E14",
    greeting: "Internet'dan real-vaqt ma'lumot qidiraman.",
    welcomeEmoji: "⊕",
    // Research-specific: manbalar ko'rinadi
    showCitations: true,
  },
  
  mistral: {
    name: "Mistral",
    provider: "Mistral AI",
    primaryColor: "#FF7000",       // To'q to'q sariq-to'q sariq (Mistral brend)
    bgColor: "#0F0A05",            // Qo'ng'ir-qora
    accentColor: "#FF9500",        // Amber
    fontDisplay: "Inter, sans-serif",
    fontBody: "Inter, sans-serif",
    borderRadius: "10px",
    animationStyle: "smooth",
    gradientFrom: "#1A0F05",
    gradientTo: "#0F0A05",
    greeting: "Bonjour! Je suis Mistral — Evropaning AI'si.",
    welcomeEmoji: "⬌",
  },
  
  llama: {
    name: "LLaMA",
    provider: "Meta AI (Ochiq)",
    primaryColor: "#7C3AED",       // Binafsha
    bgColor: "#080516",            // To'q binafsha-qora
    accentColor: "#9F67FF",        // Yorqin binafsha
    fontDisplay: "Inter, sans-serif",
    fontBody: "Inter, sans-serif",
    borderRadius: "8px",
    animationStyle: "smooth",
    gradientFrom: "#120A2A",
    gradientTo: "#080516",
    greeting: "Salom! Men LLaMA — Meta AI tomonidan ochiq manbali model.",
    welcomeEmoji: "🦙",
    badge: "TEKIN",
  },
  
  // Universal / Default tema (barcha modellar birlashganda)
  sovereign: {
    name: "SOVEREIGN",
    provider: "Universal",
    primaryColor: "#5B50F0",       // Kosmik indigo — hammaning o'rtasida
    bgColor: "#060812",            // Deep space
    accentColor: "#7C6FF7",        // Yumshoq indigo
    fontDisplay: "Syne, sans-serif",
    fontBody: "DM Sans, sans-serif",
    borderRadius: "14px",
    animationStyle: "premium",
    gradientFrom: "#0D1033",
    gradientTo: "#060812",
    greeting: "SOVEREIGN'ga xush kelibsiz.",
    welcomeEmoji: "⬡",
  }
};
```

---

## 13. UNIVERSAL RANG TANLASH ASOSI

```
MUAMMO: Har bir modelning o'z brend rangi bor:
  Claude    → Korall    #CC785C
  ChatGPT   → Yashil    #10A37F
  Gemini    → Ko'k      #4285F4
  Perplexity→ Teal      #20808D
  Mistral   → To'q sariq #FF7000
  LLaMA     → Binafsha  #7C3AED

YECHIM: Barcha ranglarni birlashtiruvchi universal rang topish

Hisoblash:
  RGB o'rtachasi:
  R: (204 + 16 + 66 + 32 + 255 + 124) / 6 = 116 → 0x74
  G: (120 + 163 + 133 + 128 + 112 + 58)  / 6 = 119 → 0x77
  B: (92  + 127 + 244 + 141 + 0   + 237) / 6 = 140 → 0x8C

  Natija: #74778C → ammo bu juda kulrang

STRATEGIYA: O'rtacha emas, ruhiy birlashma:
  Yashil (GPT) + Ko'k (Gemini) + Binafsha (LLaMA) + Issiq (Claude)
  = Premium indigo-violet: #5B50F0

  Bu rang:
  ✓ Barcha modellar rangidan farq qiladi (o'ziga xos)
  ✓ "Tech premium" his beradi
  ✓ Qorong'u fonlarda yaxshi ishlaydi
  ✓ Ko'p rangli gradient uchun markaz nuqtasi bo'ladi
  
UNIVERSAL GRADIENT (model selector'da ishlatilinadi):
  linear-gradient(135deg, 
    #00D4FF 0%,   → Teal (Perplexity)
    #5B50F0 35%,  → Indigo (Universal)
    #A855F7 65%,  → Violet (LLaMA)
    #FF7000 100%  → Amber (Mistral)
  )
```

---

## 14. XAVFSIZLIK ARXITEKTURASI

```
QATLAM 1 — Transport
  ✓ TLS 1.3 barcha aloqalar uchun
  ✓ HSTS (HTTP Strict Transport Security)
  ✓ Certificate pinning (mobil ilovada)

QATLAM 2 — Autentifikatsiya
  ✓ JWT tokenlar (15 daqiqa muddati)
  ✓ Refresh tokenlar (7 kun, rotation bilan)
  ✓ Device fingerprinting

QATLAM 3 — Ma'lumotlar
  ✓ Barcha DB ma'lumotlari AES-256-GCM bilan shifrlangan
  ✓ Encryption kalit foydalanuvchi master-parolidan hosil qilinadi
  ✓ Zero-knowledge: server shifrlash kalitini bilmaydi

QATLAM 4 — AI So'rovlar
  ✓ Blind Prompting: haqiqiy ma'lumot hech qachon tashqariga chiqmaydi
  ✓ OpenRouter API kalit serverda (client'da yo'q)
  ✓ Request ID'lar log qilinmaydi (privacy-by-design)

QATLAM 5 — Compliance
  ✓ GDPR: ma'lumotlarni eksport va o'chirish
  ✓ SOC 2 Type II (Supabase meros)
  ✓ ISO 27001 amaliyotlari
```

---

## 15. ISHLASH KO'RSATKICHLARI (TARGETS)

```
Birinchi javob vaqti (TTFB):   < 200ms
Streaming boshlanishi:         < 500ms
Xotiradan qidiruv:             < 100ms
Blind Prompting kechikish:     < 50ms (client-side)
Perplexity tadqiqot:           < 3 saniya
Model almashish:               < 200ms (UI)

Concurrent foydalanuvchilar:   10,000+ (Vercel Edge)
Uptime maqsadi:               99.9%
```

---

*SOVEREIGN Architecture v1.0 — Maxfiy hujjat*
*Barcha huquqlar himoyalangan © 2026 FayzInc*
