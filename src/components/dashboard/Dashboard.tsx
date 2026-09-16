"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteConversationAction } from "@/app/actions/chat";
import { MODEL_BY_ID, DEFAULT_MODEL_ID, RESEARCH_MODEL_ID } from "@/config/models";
import { MODEL_THEMES, themeVars } from "@/config/model-themes";
import { PLAN_BY_ID, planAllowsTier, planForTier, TIER_LABEL, type PlanId } from "@/config/plans";
import { PricingDialog } from "./PricingDialog";
import { useSendMessage } from "@/hooks/use-send-message";
import { EASE } from "@/lib/motion";
import { useChat, useChatHydrated, type Conversation } from "@/store/chat";
import { ChatHeader } from "./ChatHeader";
import { InputArea, type InputAreaHandle } from "./InputArea";
import { MessageList } from "./MessageList";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { Welcome } from "./Welcome";
import { ThemeProvider } from "./theme-context";

interface DashboardProps {
  user: { name: string; email: string; avatarUrl?: string | null };
  defaultModelId?: string;
  initialConversations?: Conversation[];
  isDev?: boolean;
  plan?: PlanId;
}

export function Dashboard({ user, defaultModelId, initialConversations, isDev, plan: planId = "free" }: DashboardProps) {
  const plan = PLAN_BY_ID[planId] ?? PLAN_BY_ID.free;
  const [pricing, setPricing] = useState<{ open: boolean; reason: string | null; suggested: PlanId | null }>({
    open: false,
    reason: null,
    suggested: null,
  });
  const openPricing = useCallback((reason: string | null = null, suggested: PlanId | null = null) => {
    setPricing({ open: true, reason, suggested });
  }, []);
  const hydrated = useChatHydrated();
  const {
    conversations,
    order,
    activeId,
    modelId,
    research,
    sidebarOpen,
    dynamicTheme,
    setModel,
    setResearch,
    setSidebarOpen,
    setDynamicTheme,
    newChat,
    select,
    remove,
    mergeFromServer,
    enabledSkills,
    toggleSkill,
  } = useChat();
  const { send, regenerate, stop, isStreaming } = useSendMessage();
  const inputRef = useRef<InputAreaHandle>(null);
  const seededRef = useRef(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);

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
  const model = MODEL_BY_ID[modelId] ?? MODEL_BY_ID[DEFAULT_MODEL_ID];
  const theme = dynamicTheme ? MODEL_THEMES[model.theme] : MODEL_THEMES.sovereign;
  const ctx = useMemo(() => ({ theme, model }), [theme, model]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.citations?.length);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const citations = lastAssistant?.citations ?? [];
  const showSources = theme.layout.showCitations && citations.length > 0 && sourcesOpen;

  const handleToggleResearch = useCallback(
    (on: boolean) => {
      if (on && !plan.limits.research) {
        openPricing("Internet tadqiqot (Perplexity) Pro tarifida mavjud.", "pro");
        return;
      }
      setResearch(on);
      if (on && model.category !== "research") setModel(RESEARCH_MODEL_ID);
    },
    [setResearch, setModel, model.category, plan.limits.research, openPricing],
  );

  const handleDelete = useCallback(
    (id: string) => {
      remove(id);
      void deleteConversationAction(id).catch(() => {});
    },
    [remove],
  );

  /** Model change with plan gating: locked models open the pricing dialog. */
  const handleModelChange = useCallback(
    (id: string) => {
      const m = MODEL_BY_ID[id];
      if (!m) return;
      if (!planAllowsTier(plan, m.tier)) {
        const need = planForTier(m.tier);
        openPricing(`${m.name} — ${TIER_LABEL[m.tier]} darajasidagi model. ${need.name} tarifida ochiladi.`, need.id);
        return;
      }
      setModel(id);
    },
    [plan, setModel, openPricing],
  );

  // Server-side refusals ([upgrade] errors) open the pricing dialog.
  useEffect(() => {
    const onUpgrade = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason ?? null;
      openPricing(reason, plan.id === "free" ? "starter" : plan.id === "starter" ? "pro" : "ultra");
    };
    window.addEventListener("sovereign:upgrade", onUpgrade);
    return () => window.removeEventListener("sovereign:upgrade", onUpgrade);
  }, [openPricing, plan.id]);

  const inputEl = (
    <InputArea
      onSend={send}
      onStop={stop}
      isStreaming={isStreaming}
      research={research}
      onToggleResearch={handleToggleResearch}
      enabledSkills={enabledSkills}
      onToggleSkill={toggleSkill}
      ref={inputRef}
      autoFocus
    />
  );

  const empty = messages.length === 0;
  const centered = empty && theme.layout.centeredEmptyInput;

  return (
    <ThemeProvider value={ctx}>
      <div
        className="theme-root tt flex h-svh w-full overflow-hidden"
        style={themeVars(theme)}
        data-theme={theme.id}
      >
        <Sidebar
          open={sidebarOpen}
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
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* ambient background per theme */}
          <div
            className="tt pointer-events-none absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(70% 30% at 50% -5%, color-mix(in srgb, ${model.primary} 7%, transparent) 0%, transparent 60%)`,
            }}
          />

          <ChatHeader
            title={active?.title ?? "Yangi suhbat"}
            modelId={modelId}
            onModelChange={handleModelChange}
            plan={plan}
            onOpenSidebar={() => setSidebarOpen(true)}
            dynamicTheme={dynamicTheme}
            onToggleDynamicTheme={() => setDynamicTheme(!dynamicTheme)}
            hasSources={theme.layout.showCitations && citations.length > 0}
            sourcesOpen={sourcesOpen}
            onToggleSources={() => setSourcesOpen((o) => !o)}
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
                    onSuggestion={(t) => inputRef.current?.setDraft(t)}
                    input={centered ? <div className="w-full">{inputEl}</div> : undefined}
                  />
                </AnimatePresence>
              ) : (
                <MessageList messages={messages} onRegenerate={regenerate} />
              )}

              {!centered && (
                <motion.div
                  layout
                  transition={{ duration: 0.3, ease: EASE }}
                  className="px-3 pb-3 pt-2 md:px-6 md:pb-5"
                >
                  {inputEl}
                </motion.div>
              )}
            </div>

            <AnimatePresence>
              {showSources && (
                <SourcesPanel
                  key="sources"
                  citations={citations}
                  query={lastUser?.content}
                  updatedAt={lastAssistant?.createdAt}
                  onClose={() => setSourcesOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <PricingDialog
          open={pricing.open}
          onClose={() => setPricing((p) => ({ ...p, open: false }))}
          currentPlan={plan.id}
          reason={pricing.reason}
          suggestedPlan={pricing.suggested}
        />
      </div>
    </ThemeProvider>
  );
}
