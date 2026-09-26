"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteConversationAction } from "@/app/actions/chat";
import { shareConversation } from "@/app/actions/share";
import { AUTO_MODEL_ID, MODEL_BY_ID, DEFAULT_MODEL_ID, RESEARCH_MODEL_ID, resolveModel } from "@/config/models";
import { MODEL_THEMES, themeVars } from "@/config/model-themes";
import { isPlanId, PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type BillingPeriod, type PlanId } from "@/config/plans";
import { PricingDialog } from "./PricingDialog";
import { useSendMessage } from "@/hooks/use-send-message";
import { EASE } from "@/lib/motion";
import { useChat, useChatHydrated, useLang, type Conversation } from "@/store/chat";
import { fmt, pick, translate, type TKey } from "@/lib/i18n";
import { convTitle } from "@/lib/locales/chat-data";
import { TIER_TEXT } from "@/lib/locales/plans";
import { ArtifactPanel } from "./ArtifactPanel";
import { ArtifactProvider, type ArtifactPayload } from "./artifact-context";
import { ChatHeader } from "./ChatHeader";
import { InputArea, type InputAreaHandle } from "./InputArea";
import { KnowledgePanel } from "./KnowledgePanel";
import { MemoryPanel } from "./MemoryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SkillsMarket } from "./SkillsMarket";
import { CoworkPanel } from "./CoworkPanel";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { CoworkProvider } from "./cowork-context";
import { MessageList } from "./MessageList";
import { PlanStatusBanner } from "./PlanStatusBanner";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { TipCard } from "./TipCard";
import { WhatsNew } from "./WhatsNew";
import { Welcome } from "./Welcome";
import { ThemeProvider } from "./theme-context";

/** Suhbat o'chirilgandan keyin "Qaytarish" uchun vaqt. */
const UNDO_MS = 5000;
/** RegisterForm yozadi: landing'da tanlangan tarif (post-signup checkout). */
const PENDING_PLAN_KEY = "sov-pending-plan";

interface DashboardProps {
  user: { name: string; email: string; avatarUrl?: string | null };
  defaultModelId?: string;
  initialConversations?: Conversation[];
  isDev?: boolean;
  plan?: PlanId;
  memoryEnabled?: boolean;
  planState?: "free" | "active" | "expiring_soon" | "expired";
  daysLeft?: number | null;
  /** Tarif banneri: tugash vaqti, (muddati o'tgan bo'lsa ham) pullik tarif, karta obunasi yangilanadimi. */
  planExpiresAt?: string | null;
  paidPlan?: PlanId;
  planRenews?: boolean;
  /** /app?paid=1|0 — to'lov sahifasidan qaytish natijasi. */
  paymentReturn?: "success" | "failed" | null;
  /** Landing'dagi to'lov chipi (/app?checkout=crypto) — tarif oynasi shu usul bilan ochiladi. */
  checkoutMethod?: "card" | "crypto" | "sbp" | null;
}

/** Tariflar tartibi (past → yuqori) — "kerakli tarif" tavsiyasi uchun. */
const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "ultra"];

/** ?paid=1 dan keyin tarif yangilanishini kutish: shuncha marta, shuncha ms oralig'ida. */
const PAID_POLL_TRIES = 15;
const PAID_POLL_MS = 4000;

export function Dashboard({ user, defaultModelId, initialConversations, isDev, plan: planId = "free", memoryEnabled: memoryInit = true, planState = "free", daysLeft = null, planExpiresAt = null, paidPlan = "free", planRenews = false, paymentReturn = null, checkoutMethod = null }: DashboardProps) {
  const router = useRouter();
  const plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;
  // Barqaror t — useCallback bog'liqliklari har renderda yangilanmasin.
  const lang = useLang();
  const t = useCallback((key: TKey) => translate(lang, key), [lang]);
  const [pricing, setPricing] = useState<{
    open: boolean;
    reason: string | null;
    suggested: PlanId | null;
    period?: BillingPeriod;
    method?: "card" | "crypto" | "sbp" | null;
  }>(() =>
    // Landing'dagi "Kripto / СБП / Karta" chipi: tarif oynasi darhol shu usul bilan ochiladi.
    checkoutMethod
      ? { open: true, reason: null, suggested: null, method: checkoutMethod }
      : { open: false, reason: null, suggested: null },
  );
  // URL'dagi ?checkout= olib tashlanadi (reload qayta ochmasin).
  useEffect(() => {
    if (!checkoutMethod) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
  }, [checkoutMethod]);
  const openPricing = useCallback((reason: string | null = null, suggested: PlanId | null = null, period?: BillingPeriod) => {
    setPricing({ open: true, reason, suggested, period });
  }, []);
  const hydrated = useChatHydrated();
  const {
    conversations,
    order,
    activeId,
    modelId,
    research,
    sidebarOpen,
    setModel,
    setResearch,
    setSidebarOpen,
    newChat,
    select,
    remove,
    mergeFromServer,
    enabledSkills,
    toggleSkill,
    blindPrompting,
    setBlindPrompting,
  } = useChat(
    // Faqat kerakli maydonlar — boshqa holat (cowork outline, sozlamalar…) o'zgarsa qayta render yo'q.
    useShallow((s) => ({
      conversations: s.conversations,
      order: s.order,
      activeId: s.activeId,
      modelId: s.modelId,
      research: s.research,
      sidebarOpen: s.sidebarOpen,
      setModel: s.setModel,
      setResearch: s.setResearch,
      setSidebarOpen: s.setSidebarOpen,
      newChat: s.newChat,
      select: s.select,
      remove: s.remove,
      mergeFromServer: s.mergeFromServer,
      enabledSkills: s.enabledSkills,
      toggleSkill: s.toggleSkill,
      blindPrompting: s.blindPrompting,
      setBlindPrompting: s.setBlindPrompting,
    })),
  );
  const { send, regenerate, editAndResend, stop, isStreaming } = useSendMessage();
  // Oqim tugagach "Javob tayyor" e'loni (render vaqtida, effektsiz).
  const [prevStreaming, setPrevStreaming] = useState(isStreaming);
  const [replyAnnouncement, setReplyAnnouncement] = useState("");
  if (prevStreaming !== isStreaming) {
    setPrevStreaming(isStreaming);
    setReplyAnnouncement(isStreaming ? "" : translate(lang, "p8bReplyReady"));
  }
  const inputRef = useRef<InputAreaHandle>(null);
  const seededRef = useRef(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [artifact, setArtifact] = useState<ArtifactPayload | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(memoryInit);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [coworkOpen, setCoworkOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "busy" | "done">("idle");
  // Biror panel/dialog ochiqmi — Esc shu holatda oqimni to'xtatmaydi, faqat panelni yopadi.
  const overlayOpen =
    memoryOpen || settingsOpen || kbOpen || skillsOpen || coworkOpen || connectorsOpen || pricing.open;

  // Barqaror onClose'lar: panellar effektlari [open, onClose] ga bog'liq — inline closure
  // har token'da yangi bo'lib, ochiq panel serverdan qayta-qayta yuklanardi.
  const closeMemory = useCallback(() => setMemoryOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeKb = useCallback(() => setKbOpen(false), []);
  const closeSkills = useCallback(() => setSkillsOpen(false), []);
  const closeCowork = useCallback(() => setCoworkOpen(false), []);
  const closeConnectors = useCallback(() => setConnectorsOpen(false), []);
  const closePricing = useCallback(() => setPricing((p) => ({ ...p, open: false })), []);
  const closeArtifact = useCallback(() => setArtifact(null), []);
  const closeSources = useCallback(() => setSourcesOpen(false), []);
  const openMemory = useCallback(() => setMemoryOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openKb = useCallback(() => setKbOpen(true), []);
  const openSkills = useCallback(() => setSkillsOpen(true), []);
  const openCowork = useCallback(() => setCoworkOpen(true), []);
  const openConnectors = useCallback(() => setConnectorsOpen(true), []);
  const upgradeFromSettings = useCallback(() => {
    setSettingsOpen(false);
    openPricing();
  }, [openPricing]);

  /** Suhbatning matnli nusxasini ulashadi va havolani buferga oladi. */
  const handleShare = useCallback(async () => {
    const s = useChat.getState();
    const conv = s.activeId ? s.conversations[s.activeId] : null;
    if (!conv || !conv.messages.length) return;
    setShareState("busy");
    let res: Awaited<ReturnType<typeof shareConversation>>;
    try {
      res = await shareConversation({
        title: conv.title,
        modelId: conv.modelId,
        messages: conv.messages
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content, modelId: m.modelId ?? null, createdAt: m.createdAt })),
      });
    } catch {
      // Tarmoq uzilishi / server action xatosi — tugma "busy" da qotib qolmasin.
      setShareState("idle");
      window.alert(t("p3bShareFailed"));
      return;
    }
    if (!res.ok) {
      setShareState("idle");
      window.alert(res.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(res.url);
    } catch {
      window.prompt(t("chLinkPrompt"), res.url);
    }
    setShareState("done");
    setTimeout(() => setShareState("idle"), 2500);
  }, [t]);

  // Tezkor tugmalar: Ctrl+K model, Ctrl+N yangi suhbat, Ctrl+/ kiritish, Esc to'xtatish.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new Event("sovereign:open-model"));
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useChat.getState().newChat();
        inputRef.current?.focus();
      } else if (mod && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && isStreaming && !e.defaultPrevented && !overlayOpen) {
        // Menyu/dialog Esc'ni o'zi yopgan bo'lsa (preventDefault) — oqimni to'xtatmaymiz.
        // Panel ochiq bo'lsa (overlayOpen) Esc faqat panelni yopadi: panellar document'da
        // tinglaydi va bu yerdan oldin ishlaydi, holat esa hali "ochiq" — oqim to'xtamaydi.
        // Fokus biror ochiq menyu/dialog ichida yoki boshqa matn maydonida bo'lsa ham to'xtatmaymiz.
        const el = document.activeElement;
        const inOverlay = el instanceof Element && !!el.closest('[role="dialog"], [role="menu"], [role="listbox"]');
        const inOtherField = el instanceof HTMLInputElement;
        if (!inOverlay && !inOtherField) stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStreaming, stop, overlayOpen]);
  const artifactCtx = useMemo(
    () => ({ open: (a: ArtifactPayload) => setArtifact(a) }),
    [],
  );

  // One-time: merge server conversations and apply the onboarding default model.
  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    seededRef.current = true;
    if (initialConversations?.length) mergeFromServer(initialConversations);
    const s = useChat.getState();
    if (defaultModelId && MODEL_BY_ID[defaultModelId] && s.order.length === 0 && s.modelId === DEFAULT_MODEL_ID) {
      s.setModel(defaultModelId);
    }
  }, [hydrated, initialConversations, defaultModelId, mergeFromServer]);

  const active = activeId ? conversations[activeId] : null;
  const messages = active?.messages ?? [];
  const model = resolveModel(modelId);
  // Faqat SOVEREIGN dizayni — model tanlanganda ham interfeys rangi o'zgarmaydi
  // (per-model reskin olib tashlandi). Barcha modellar bir xil SOVEREIGN ko'rinishida.
  const theme = MODEL_THEMES.sovereign;
  const ctx = useMemo(() => ({ theme, model }), [theme, model]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.citations?.length);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const citations = lastAssistant?.citations ?? [];
  const showSources = citations.length > 0 && sourcesOpen;

  const handleToggleResearch = useCallback(
    (on: boolean) => {
      if (on && !plan.limits.research) {
        openPricing(t("chResearchPro"), "pro");
        return;
      }
      setResearch(on);
      if (on && model.category !== "research") setModel(RESEARCH_MODEL_ID);
    },
    [setResearch, setModel, model.category, plan.limits.research, openPricing, t],
  );

  // O'chirish — darhol lokal olib tashlanadi, serverdan esa ~5s dan keyin
  // (shu vaqt ichida "Qaytarish" bosilsa — suhbat joyiga qaytadi).
  const pendingDeletes = useRef(new Map<string, { conv: Conversation; wasActive: boolean; timer: ReturnType<typeof setTimeout> }>());
  const [undoToast, setUndoToast] = useState<string | null>(null);

  const commitDelete = useCallback((id: string) => {
    const p = pendingDeletes.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingDeletes.current.delete(id);
    void deleteConversationAction(id).catch(() => {});
    setUndoToast((cur) => (cur === id ? null : cur));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const s = useChat.getState();
      const conv = s.conversations[id];
      if (!conv) return;
      // Oqimdagi suhbat o'chirilsa — oqimni to'xtatamiz (aks holda "Qaytarish" uni
      // "streaming" holatida tiklardi va xabar osilib qolardi).
      const live = conv.messages.some((m) => m.status === "streaming");
      if (live) stop();
      const snapshot: Conversation = live
        ? {
            ...conv,
            messages: conv.messages.map((m) =>
              m.status !== "streaming"
                ? m
                : m.modelId && m.content
                  ? { ...m, status: "done" as const, error: t("uxInterrupted") }
                  : { ...m, status: "error" as const, content: "", error: t("p3bStopped") },
            ),
          }
        : conv;
      const timer = setTimeout(() => commitDelete(id), UNDO_MS);
      pendingDeletes.current.set(id, { conv: snapshot, wasActive: s.activeId === id, timer });
      remove(id);
      setUndoToast(id);
    },
    [remove, commitDelete, stop, t],
  );

  const undoDelete = useCallback((id: string) => {
    const p = pendingDeletes.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pendingDeletes.current.delete(id);
    useChat.setState((s) => {
      const conversations = { ...s.conversations, [id]: p.conv };
      const order = Object.values(conversations)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((c) => c.id);
      return { conversations, order, activeId: p.wasActive ? id : s.activeId };
    });
    setUndoToast(null);
  }, []);

  // Sahifa yopilsa yoki Dashboard chiqib ketsa — kutayotgan o'chirishlarni yakunlaymiz.
  useEffect(() => {
    const pending = pendingDeletes.current;
    const flush = () => {
      for (const id of [...pending.keys()]) commitDelete(id);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commitDelete]);

  /** Model change with plan gating: locked models open the pricing dialog. */
  const handleModelChange = useCallback(
    (id: string) => {
      if (id === AUTO_MODEL_ID) {
        setModel(id);
        return;
      }
      const m = MODEL_BY_ID[id];
      if (!m) return;
      if (!planAllowsTier(plan, m.tier)) {
        const need = planForTier(m.tier);
        openPricing(fmt(t("chModelLocked"), { model: m.name, tier: pick(lang, TIER_TEXT[m.tier]) || TIER_LABEL[m.tier], plan: need.name }), need.id);
        return;
      }
      setModel(id);
    },
    [plan, setModel, openPricing, t, lang],
  );

  // Auto-open the artifact panel when a finished answer contains a site (HTML/SVG).
  // JSX/TSX/React avtomatik ochilmaydi — foydalanuvchi o'zi "Preview" ni bosadi.
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    const check = () => {
      const s = useChat.getState();
      const conv = s.activeId ? s.conversations[s.activeId] : null;
      const last = conv?.messages[conv.messages.length - 1];
      if (!last || last.role !== "assistant" || last.status === "streaming") return;
      if (autoOpenedRef.current === last.id) return;
      const m = /```(html|svg)\s*\n([\s\S]*?)```/i.exec(last.content);
      if (m && m[2].trim().length > 40) {
        autoOpenedRef.current = last.id;
        setArtifact({ code: m[2].trim(), lang: m[1].toLowerCase() });
      }
    };
    return useChat.subscribe(check);
  }, []);

  // Landing'dagi tarif tugmasi → /register?plan=pro&period=year → onboarding'dan
  // keyin shu yerda to'lov oynasi o'sha tarif bilan ochiladi (bir marta).
  useEffect(() => {
    if (!hydrated) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PENDING_PLAN_KEY);
      if (raw) localStorage.removeItem(PENDING_PLAN_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let target: (typeof PLAN_BY_ID)[PlanId] | undefined;
    let period: BillingPeriod = "month";
    try {
      const p = JSON.parse(raw) as { plan?: string; period?: string; at?: number };
      const fresh = typeof p.at === "number" && Date.now() - p.at < 24 * 60 * 60 * 1000;
      target = fresh && p.plan && p.plan in PLAN_BY_ID ? PLAN_BY_ID[p.plan as PlanId] : undefined;
      period = p.period === "year" ? "year" : "month";
    } catch {
      return; // buzilgan qiymat — e'tiborsiz
    }
    if (!target || target.price === 0 || target.id === plan.id) return;
    const planId = target.id;
    const id = setTimeout(() => openPricing(null, planId, period), 600);
    return () => clearTimeout(id);
  }, [hydrated, openPricing, plan.id]);

  // Server-side refusals ([upgrade] errors) open the pricing dialog.
  useEffect(() => {
    const onUpgrade = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string; plan?: string }>).detail;
      const reason = detail?.reason ?? null;
      // Server "[upgrade:ultra]" bilan kerakli tarifni aytsa — o'sha; aks holda keyingi tarif.
      // Joriydan past/teng tarif "Kerakli" deb belgilanmaydi (Ultra'da limit — boshi berk ko'cha emas).
      const rank = PLAN_ORDER.indexOf(plan.id);
      const required = isPlanId(detail?.plan) && PLAN_ORDER.indexOf(detail.plan) > rank ? detail.plan : null;
      let suggested: PlanId | null = required ?? PLAN_ORDER[rank + 1] ?? null;
      if (!required && suggested && suggested !== "ultra" && reason && /\bultra\b/i.test(reason)) suggested = "ultra";
      openPricing(reason, suggested);
    };
    window.addEventListener("sovereign:upgrade", onUpgrade);
    return () => window.removeEventListener("sovereign:upgrade", onUpgrade);
  }, [openPricing, plan.id]);

  // To'lovdan qaytish (?paid=1 / ?paid=0): xabar ko'rsatamiz, URL'ni tozalaymiz va
  // webhook tarifni yangilaguncha serverdan qayta o'qiymiz (router.refresh).
  const [payNotice, setPayNotice] = useState<"success" | "failed" | null>(paymentReturn);
  const [planAtReturn] = useState(plan.id);
  const payShown = payNotice === "success" && plan.id !== planAtReturn ? "active" : payNotice;

  useEffect(() => {
    if (!paymentReturn) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("paid");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  }, [paymentReturn]);

  useEffect(() => {
    if (payShown !== "success") return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (tries > PAID_POLL_TRIES) clearInterval(id);
      else router.refresh();
    }, PAID_POLL_MS);
    return () => clearInterval(id);
  }, [payShown, router]);

  // Tarif faollashgach xabar o'zi yopiladi.
  useEffect(() => {
    if (payShown !== "active") return;
    const id = setTimeout(() => setPayNotice(null), 6000);
    return () => clearTimeout(id);
  }, [payShown]);

  const inputEl = (
    <InputArea
      onSend={send}
      onStop={stop}
      isStreaming={isStreaming}
      research={research}
      onToggleResearch={handleToggleResearch}
      enabledSkills={enabledSkills}
      onToggleSkill={toggleSkill}
      blindPrompting={blindPrompting}
      onToggleBlindPrompting={setBlindPrompting}
      onOpenCowork={openCowork}
      onOpenKnowledge={openKb}
      onOpenMemory={openMemory}
      ref={inputRef}
      autoFocus
    />
  );

  const empty = messages.length === 0;
  const centered = empty && theme.layout.centeredEmptyInput;

  return (
    <ThemeProvider value={ctx}>
      <CoworkProvider>
      <ArtifactProvider value={artifactCtx}>
      <div
        className="theme-root tt flex h-svh w-full overflow-hidden"
        style={themeVars(theme)}
        data-theme={theme.id}
      >
        <Sidebar
          open={sidebarOpen}
          onOpen={() => setSidebarOpen(true)}
          onClose={() => setSidebarOpen(false)}
          conversations={conversations}
          order={order}
          activeId={activeId}
          onSelect={(id) => {
            select(id);
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          onNew={() => {
            newChat();
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          onDelete={handleDelete}
          research={research}
          onToggleResearch={handleToggleResearch}
          user={user}
          isDev={isDev}
          plan={plan}
          onUpgrade={() => openPricing()}
          onOpenMemory={openMemory}
          onOpenSettings={openSettings}
          onOpenKnowledge={openKb}
          onOpenSkills={openSkills}
          onOpenCowork={openCowork}
          onOpenConnectors={openConnectors}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* ambient background per theme */}
          <div
            className="tt pointer-events-none absolute inset-0 -z-10"
            style={{
              background: "radial-gradient(70% 30% at 50% -5%, color-mix(in srgb, var(--t-primary) 7%, transparent) 0%, transparent 60%)",
            }}
          />

          <ChatHeader
            title={convTitle(active?.title, t)}
            modelId={modelId}
            onModelChange={handleModelChange}
            plan={plan}
            onOpenSidebar={() => setSidebarOpen(true)}
            sidebarOpen={sidebarOpen}
            hasSources={citations.length > 0}
            sourcesOpen={sourcesOpen}
            onToggleSources={() => setSourcesOpen((o) => !o)}
            onUpgrade={() => openPricing()}
            onShare={messages.length ? handleShare : undefined}
            shareState={shareState}
          />

          {/* Tarif expired/expiring_soon holatida chirali panel chiqadi */}
          <PlanStatusBanner
            planState={planState}
            daysLeft={daysLeft}
            expiresAt={planExpiresAt}
            paidPlan={paidPlan}
            renews={planRenews}
            onRenew={(id) => openPricing(null, id, "month")}
          />

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {!hydrated ? (
                <div className="flex-1" />
              ) : empty ? (
                <AnimatePresence mode="wait">
                  <Welcome
                    key={theme.id}
                    userName={user.name}
                    onSuggestion={(text) => inputRef.current?.setDraft(text)}
                    input={centered ? <div className="w-full">{inputEl}</div> : undefined}
                  />
                </AnimatePresence>
              ) : (
                // Butun ro'yxat live region emas (suhbat almashtirilganda butun tarix o'qilardi);
                // javob tugagani alohida yashirin region orqali qisqa e'lon qilinadi (quyida).
                <div className="flex min-h-0 flex-1 flex-col" aria-busy={isStreaming}>
                  <MessageList messages={messages} onRegenerate={regenerate} onEdit={editAndResend} />
                </div>
              )}

              {!centered && (
                <motion.div
                  layout
                  // Faqat joylashuv haqiqatan o'zgarganda o'lchaydi — har token'da reflow bo'lmasin.
                  layoutDependency={`${!!artifact}-${showSources}`}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="px-3 pb-3 pt-2 md:px-6 md:pb-5"
                >
                  {inputEl}
                </motion.div>
              )}
            </div>

            <AnimatePresence>
              {artifact ? (
                <ArtifactPanel key={artifact.code.slice(0, 64)} artifact={artifact} onClose={closeArtifact} />
              ) : showSources ? (
                <SourcesPanel
                  key="sources"
                  citations={citations}
                  query={typeof lastUser?.content === "string" ? lastUser.content : undefined}
                  updatedAt={lastAssistant?.createdAt}
                  onClose={closeSources}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <PricingDialog
          open={pricing.open}
          onClose={closePricing}
          currentPlan={plan.id}
          reason={pricing.reason}
          suggestedPlan={pricing.suggested}
          initialPlan={pricing.period ? pricing.suggested : null}
          initialPeriod={pricing.period}
          preferredMethod={pricing.method ?? null}
        />

        {/* Ekran o'quvchilar uchun: javob tayyor bo'lganda qisqa e'lon */}
        <div className="sr-only" role="status" aria-live="polite">
          {replyAnnouncement}
        </div>

        {/* O'chirilgan suhbat — "Qaytarish" (5s) */}
        <AnimatePresence>
          {undoToast && (
            <motion.div
              key={undoToast}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: EASE }}
              role="status"
              className="tt fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 border py-2 pl-4 pr-2 text-sm shadow-lg"
              style={{ background: "var(--t-surface)", borderColor: "var(--t-border)", borderRadius: 14, color: "var(--t-text)" }}
            >
              <span>{t("uxDeleted")}</span>
              <button
                type="button"
                onClick={() => undoDelete(undoToast)}
                className="min-h-8 rounded-lg px-3 font-semibold transition-colors hover:bg-white/10"
                style={{ color: "var(--t-accent)" }}
              >
                {t("uxUndo")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* To'lovdan qaytish xabari (?paid=1 / ?paid=0) */}
        <AnimatePresence>
          {payShown && (
            <motion.div
              key={payShown}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: EASE }}
              role={payShown === "failed" ? "alert" : "status"}
              className="tt fixed left-1/2 top-4 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-start gap-3 border py-2.5 pl-4 pr-2 text-sm shadow-lg"
              style={{
                background: "var(--t-surface)",
                borderColor: payShown === "failed" ? "var(--error, #E0554E)" : "var(--t-border)",
                borderRadius: 14,
                color: "var(--t-text)",
              }}
            >
              <span className="min-w-0 flex-1 py-1">
                {payShown === "failed" ? t("p3bPaidFail") : payShown === "active" ? t("p3bPaidActive") : t("p3bPaidOk")}
              </span>
              {payShown === "failed" && (
                <button
                  type="button"
                  onClick={() => {
                    setPayNotice(null);
                    openPricing();
                  }}
                  className="min-h-8 shrink-0 rounded-lg px-3 font-semibold transition-colors hover:bg-white/10"
                  style={{ color: "var(--t-accent)" }}
                >
                  {t("p3bPaidRetry")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPayNotice(null)}
                className="min-h-8 shrink-0 rounded-lg px-2 transition-colors hover:bg-white/10"
                style={{ color: "var(--t-text-muted)" }}
                aria-label={t("p3bDismiss")}
                title={t("p3bDismiss")}
              >
                <X className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* "Nima yangi" va 30 soatlik maslahat (src/content/updates.ts, tips.ts) */}
        {hydrated && <WhatsNew />}
        {hydrated && (
          <TipCard
            onOpenPanel={(p) => ({ memory: openMemory, knowledge: openKb, skills: openSkills, connectors: openConnectors, cowork: openCowork })[p]()}
            onResearch={() => handleToggleResearch(true)}
            onDraft={(text) => inputRef.current?.setDraft(text)}
          />
        )}

        <MemoryPanel open={memoryOpen} onClose={closeMemory} enabled={memoryEnabled} onEnabledChange={setMemoryEnabled} />
        <SkillsMarket open={skillsOpen} onClose={closeSkills} enabled={enabledSkills} onToggle={toggleSkill} />
        <CoworkPanel open={coworkOpen} onClose={closeCowork} messages={messages} />
        <ConnectorsPanel open={connectorsOpen} onClose={closeConnectors} />
        <KnowledgePanel open={kbOpen} onClose={closeKb} />
        <SettingsPanel
          open={settingsOpen}
          onClose={closeSettings}
          user={user}
          plan={plan.id}
          onUpgrade={upgradeFromSettings}
        />
      </div>
      </ArtifactProvider>
      </CoworkProvider>
    </ThemeProvider>
  );
}
