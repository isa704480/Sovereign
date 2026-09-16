"use client";
/* eslint-disable react-hooks/refs -- SpeechSynthesis is driven from user callbacks, not render */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

function hasTTS() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Strip markdown to plain speech-friendly text. */
function toSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " kod bloki. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>#|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function pickVoice(lang = "uz"): SpeechSynthesisVoice | null {
  if (!hasTTS()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("ru")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    voices[0] ??
    null
  );
}

export interface UseTTS {
  supported: boolean;
  speakingId: string | null;
  toggle: (id: string, text: string) => void;
  stop: () => void;
}

/** Browser text-to-speech. One utterance at a time, keyed by message id. */
export function useTTS(): UseTTS {
  const supported = useSyncExternalStore(
    () => () => {},
    hasTTS,
    () => false,
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  idRef.current = speakingId;

  useEffect(() => {
    if (!hasTTS()) return;
    // Preload voices (some browsers populate async).
    window.speechSynthesis.getVoices();
  }, []);

  const stop = useCallback(() => {
    if (hasTTS()) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const toggle = useCallback(
    (id: string, text: string) => {
      if (!hasTTS()) return;
      if (idRef.current === id) {
        stop();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(toSpeech(text));
      const v = pickVoice("uz");
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = 1;
      u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      u.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [stop],
  );

  return { supported, speakingId, toggle, stop };
}
