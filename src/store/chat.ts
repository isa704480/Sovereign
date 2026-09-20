"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTO_MODEL_ID, DEFAULT_MODEL_ID, MODEL_BY_ID } from "@/config/models";
import { DEFAULT_ENABLED_SKILLS } from "@/config/skills";
import type { Attachment } from "@/lib/chat/attachments";

/** A skill the user wrote in the Skills market; kept on this device. */
export interface CustomSkill {
  id: string;
  name: string;
  instructions: string;
}

/** Custom skill ids carry this prefix so they never collide with catalog ids. */
export const CUSTOM_SKILL_PREFIX = "custom:";

export interface RouteInfo {
  reason: string;
  steps: { modelId: string; kind: string; purpose: string }[];
}

export interface VerifierIssue {
  fact: string;
  verdict: "correct" | "suspicious" | "unverifiable";
  note?: string;
}

export interface CacheInfo {
  model: string;
  similarity: number;
}

export type Role = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "done" | "error";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  modelId?: string;
  citations?: string[];
  /** Skill ids that were active for this answer. */
  skills?: string[];
  /** User attachments (images / files) shown with the message and sent to the model. */
  attachments?: Attachment[];
  /** Auto-mode routing decision shown above the answer. */
  route?: RouteInfo;
  /** Ids of models actually used (Auto pipeline). */
  usedModels?: string[];
  /** Semantic-cache hit (javob keshdan qaytarilgan bo'lsa). */
  cache?: CacheInfo;
  /** Sahifalar — model javob berishdan oldin o'qib chiqqan havolalar. */
  reading?: string[];
  /** Model band bo'lgani uchun avtomatik almashtirilgan yo'nalishlar. */
  switched?: { from: string; to: string; reason: string }[];
  /** Verifier tomonidan topilgan shubhali faktlar. */
  verifier?: VerifierIssue[];
  createdAt: string;
  status?: MessageStatus;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  research: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Loyiha (papka) — bo'lmasa umumiy ro'yxatda. */
  projectId?: string | null;
}

/** Loyiha: suhbatlar papkasi + shu loyihadagi har bir suhbatga qo'shiladigan ko'rsatma. */
export interface Project {
  id: string;
  name: string;
  /** System promptga qo'shiladi: "bu loyiha Next.js 16, o'zbek tilida javob ber" kabi. */
  instructions: string;
  createdAt: string;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
  /** Model selected for the next message (per active conversation or new chat). */
  modelId: string;
  research: boolean;
  sidebarOpen: boolean;
  /** User-enabled SOVEREIGN skills (auto-detected ones are added per message). */
  enabledSkills: string[];
  /** Skills the user wrote themselves; ids are prefixed with CUSTOM_SKILL_PREFIX. */
  customSkills: CustomSkill[];
  /** Mask PII in the outgoing prompt (Blind Prompting). */
  blindPrompting: boolean;
  /** File list of the opened Cowork folder, sent with each request (names only). */
  coworkOutline: string | null;
  /** Loyihalar va hozir ochiq turgan loyiha (yangi suhbat shu loyihaga tushadi). */
  projects: Project[];
  activeProjectId: string | null;
  /** Chat matn o'lchami. */
  fontSize: "sm" | "md" | "lg";
  /** Xabar zichligi. */
  density: "compact" | "comfortable";
  /** Enter yuboradi (default) yoki Ctrl+Enter yuboradi. */
  enterToSend: boolean;
  /** Streaming tezligi — "natural" (bo'lakli) yoki "instant" (darhol butun). */
  streamingSpeed: "natural" | "instant";
  /** Reduced motion — foydalanuvchi animatsiya kamayishini xohlaydi. */
  reducedMotion: boolean;
  /** Suhbat javobi kelganda avtomatik pastga scroll. */
  autoScroll: boolean;

  setModel: (id: string) => void;
  setResearch: (on: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSkill: (id: string) => void;
  addCustomSkill: (skill: { name: string; instructions: string }) => string;
  removeCustomSkill: (id: string) => void;
  setBlindPrompting: (on: boolean) => void;
  setCoworkOutline: (text: string | null) => void;
  createProject: (name: string) => string;
  updateProject: (id: string, patch: Partial<Pick<Project, "name" | "instructions">>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  moveToProject: (conversationId: string, projectId: string | null) => void;
  setFontSize: (v: "sm" | "md" | "lg") => void;
  setDensity: (v: "compact" | "comfortable") => void;
  setEnterToSend: (on: boolean) => void;
  setStreamingSpeed: (v: "natural" | "instant") => void;
  setReducedMotion: (on: boolean) => void;
  setAutoScroll: (on: boolean) => void;
  newChat: () => void;
  select: (id: string | null) => void;
  createConversation: (modelId: string, research: boolean) => Conversation;
  appendMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  setTitle: (conversationId: string, title: string) => void;
  remove: (conversationId: string) => void;
  mergeFromServer: (list: Conversation[]) => void;
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

const now = () => new Date().toISOString();

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: {},
      order: [],
      activeId: null,
      modelId: DEFAULT_MODEL_ID,
      research: false,
      sidebarOpen: true,
      enabledSkills: DEFAULT_ENABLED_SKILLS,
      customSkills: [],
      blindPrompting: false,
      coworkOutline: null,
      projects: [],
      activeProjectId: null,
      fontSize: "md",
      density: "comfortable",
      enterToSend: true,
      streamingSpeed: "natural",
      reducedMotion: false,
      autoScroll: true,

      setFontSize: (fontSize) => set({ fontSize }),
      setDensity: (density) => set({ density }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
      setStreamingSpeed: (streamingSpeed) => set({ streamingSpeed }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setAutoScroll: (autoScroll) => set({ autoScroll }),

      setModel: (modelId) => {
        if (modelId !== AUTO_MODEL_ID && !MODEL_BY_ID[modelId]) return;
        const { activeId, conversations } = get();
        const research = MODEL_BY_ID[modelId]?.category === "research" ? true : get().research;
        if (activeId && conversations[activeId]) {
          set({
            modelId,
            research,
            conversations: {
              ...conversations,
              [activeId]: { ...conversations[activeId], modelId, research, updatedAt: now() },
            },
          });
        } else {
          set({ modelId, research });
        }
      },
      setResearch: (research) => set({ research }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSkill: (id) =>
        set((s) => ({
          enabledSkills: s.enabledSkills.includes(id)
            ? s.enabledSkills.filter((x) => x !== id)
            : [...s.enabledSkills, id],
        })),
      setBlindPrompting: (blindPrompting) => set({ blindPrompting }),
      setCoworkOutline: (coworkOutline) => set({ coworkOutline }),

      createProject: (name) => {
        const id = uuid();
        set((s) => ({
          projects: [...s.projects, { id, name: name.trim().slice(0, 60) || "Loyiha", instructions: "", createdAt: now() }],
          activeProjectId: id,
        }));
        return id;
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, ...patch, name: (patch.name ?? p.name).slice(0, 60), instructions: (patch.instructions ?? p.instructions).slice(0, 4000) }
              : p,
          ),
        })),
      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
          // Suhbatlar o'chmaydi — umumiy ro'yxatga qaytadi.
          conversations: Object.fromEntries(
            Object.entries(s.conversations).map(([cid, c]) => [cid, c.projectId === id ? { ...c, projectId: null } : c]),
          ),
        })),
      setActiveProject: (activeProjectId) => set({ activeProjectId, activeId: null }),
      moveToProject: (conversationId, projectId) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return {};
          return { conversations: { ...s.conversations, [conversationId]: { ...c, projectId } } };
        }),

      addCustomSkill: ({ name, instructions }) => {
        const id = uuid().slice(0, 8);
        set((s) => ({
          customSkills: [...s.customSkills, { id, name: name.slice(0, 40), instructions: instructions.slice(0, 2000) }].slice(-20),
        }));
        return id;
      },
      removeCustomSkill: (id) =>
        set((s) => ({
          customSkills: s.customSkills.filter((k) => k.id !== id),
          enabledSkills: s.enabledSkills.filter((x) => x !== `${CUSTOM_SKILL_PREFIX}${id}`),
        })),

      newChat: () => set({ activeId: null }),
      select: (id) => {
        const c = id ? get().conversations[id] : null;
        set({ activeId: c ? id : null, ...(c ? { modelId: c.modelId, research: c.research } : {}) });
      },

      createConversation: (modelId, research) => {
        const c: Conversation = {
          id: uuid(),
          title: "Yangi suhbat",
          modelId,
          research,
          createdAt: now(),
          updatedAt: now(),
          messages: [],
          // Loyiha ochiq bo'lsa yangi suhbat shu loyihaga tushadi.
          projectId: get().activeProjectId,
        };
        set((s) => ({
          conversations: { ...s.conversations, [c.id]: c },
          order: [c.id, ...s.order],
          activeId: c.id,
        }));
        return c;
      },

      appendMessage: (conversationId, message) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return {};
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: { ...c, messages: [...c.messages, message], updatedAt: now() },
            },
            order: [conversationId, ...s.order.filter((id) => id !== conversationId)],
          };
        }),

      updateMessage: (conversationId, messageId, patch) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return {};
          return {
            conversations: {
              ...s.conversations,
              [conversationId]: {
                ...c,
                messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
              },
            },
          };
        }),

      setTitle: (conversationId, title) =>
        set((s) => {
          const c = s.conversations[conversationId];
          if (!c) return {};
          return { conversations: { ...s.conversations, [conversationId]: { ...c, title, updatedAt: now() } } };
        }),

      remove: (conversationId) =>
        set((s) => {
          const rest = { ...s.conversations };
          delete rest[conversationId];
          return {
            conversations: rest,
            order: s.order.filter((id) => id !== conversationId),
            activeId: s.activeId === conversationId ? null : s.activeId,
          };
        }),

      mergeFromServer: (list) =>
        set((s) => {
          const conversations = { ...s.conversations };
          for (const c of list) {
            const local = conversations[c.id];
            // Keep whichever side is newer; local streaming state always wins.
            if (!local || new Date(c.updatedAt) > new Date(local.updatedAt)) {
              conversations[c.id] = { ...c, messages: c.messages.map((m) => ({ ...m, status: "done" as const })) };
            }
          }
          const order = Object.values(conversations)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map((c) => c.id);
          return { conversations, order };
        }),
    }),
    {
      name: "sovereign.chat",
      skipHydration: true,
      partialize: (s) => ({
        // Strip heavy attachment payloads (data URLs / extracted text) from
        // localStorage — keep only lightweight metadata for display after reload.
        conversations: Object.fromEntries(
          Object.entries(s.conversations).map(([id, c]) => [
            id,
            {
              ...c,
              messages: c.messages.map((m) =>
                m.attachments?.length
                  ? {
                      ...m,
                      attachments: m.attachments.map((a) => ({
                        id: a.id,
                        name: a.name,
                        mime: a.mime,
                        size: a.size,
                        kind: a.kind,
                      })),
                    }
                  : m,
              ),
            },
          ]),
        ),
        order: s.order,
        activeId: s.activeId,
        modelId: s.modelId,
        research: s.research,
        sidebarOpen: s.sidebarOpen,
        enabledSkills: s.enabledSkills,
        customSkills: s.customSkills,
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        blindPrompting: s.blindPrompting,
      }),
    },
  ),
);

const subscribeHydration = (cb: () => void) => useChat.persist.onFinishHydration(cb);
const getHydrated = () => useChat.persist.hasHydrated();
const getServerHydrated = () => false;

export function useChatHydrated(): boolean {
  useEffect(() => {
    void useChat.persist.rehydrate();
  }, []);
  return useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
}

/** Groups conversation ids by day buckets for the sidebar. */
export function groupByDate(order: string[], conversations: Record<string, Conversation>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  week.setDate(today.getDate() - 7);

  const groups: { label: string; ids: string[] }[] = [
    { label: "Bugun", ids: [] },
    { label: "Kecha", ids: [] },
    { label: "Bu hafta", ids: [] },
    { label: "Oldinroq", ids: [] },
  ];
  for (const id of order) {
    const c = conversations[id];
    if (!c) continue;
    const d = new Date(c.updatedAt);
    if (d >= today) groups[0].ids.push(id);
    else if (d >= yesterday) groups[1].ids.push(id);
    else if (d >= week) groups[2].ids.push(id);
    else groups[3].ids.push(id);
  }
  return groups.filter((g) => g.ids.length);
}
