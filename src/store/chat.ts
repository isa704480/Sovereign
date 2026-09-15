"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL_ID, MODEL_BY_ID } from "@/config/models";

export type Role = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "done" | "error";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  modelId?: string;
  citations?: string[];
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
}

interface ChatState {
  conversations: Record<string, Conversation>;
  order: string[];
  activeId: string | null;
  /** Model selected for the next message (per active conversation or new chat). */
  modelId: string;
  research: boolean;
  sidebarOpen: boolean;
  /** "Model atmosferasi": re-skin the dashboard when the model changes. */
  dynamicTheme: boolean;

  setModel: (id: string) => void;
  setResearch: (on: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setDynamicTheme: (on: boolean) => void;
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
      dynamicTheme: true,

      setModel: (modelId) => {
        if (!MODEL_BY_ID[modelId]) return;
        const { activeId, conversations } = get();
        const research = MODEL_BY_ID[modelId].category === "research" ? true : get().research;
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
      setDynamicTheme: (dynamicTheme) => set({ dynamicTheme }),

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
        conversations: s.conversations,
        order: s.order,
        activeId: s.activeId,
        modelId: s.modelId,
        research: s.research,
        sidebarOpen: s.sidebarOpen,
        dynamicTheme: s.dynamicTheme,
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
