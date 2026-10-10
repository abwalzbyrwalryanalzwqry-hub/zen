import { useState } from "react";
import { type Profile } from "@/lib/zen-api";
import { askLegacy } from "@/lib/assistant-client";
import { type MessageWithMedia } from "@/lib/chat-extras";

/** سؤال المساعد أو تلخيص المحادثة، والرد خاص بمن طلبه (المرحلة 7.6). */
export function useChatAi(opts: {
  userId: string | null | undefined;
  peer: Profile | null;
  messages: MessageWithMedia[];
  input: string;
  setInput: (v: string) => void;
  onBegin: () => void;
}) {
  const { userId, peer, messages, input, setInput } = opts;
  // ردود المساعد داخل المحادثة خاصة بمن طلبها: لا تُنشر في المحادثة ولا يراها الطرف الآخر.
  const [aiNote, setAiNote] = useState<{ title: string; text: string; error?: boolean } | null>(
    null,
  );
  const [aiBusy, setAiBusy] = useState(false);

  const invokeAi = askLegacy;

  const askAi = async () => {
    if (!userId || aiBusy) return;
    const CONSENT_KEY = "zen.ai.chat-consent";
    if (typeof localStorage !== "undefined" && !localStorage.getItem(CONSENT_KEY)) {
      const ok = window.confirm(
        "سيُرسل نص آخر رسائل هذه المحادثة (منك ومن الطرف الآخر) إلى المساعد الذكي ليجيبك. الرد يظهر لك وحدك. هل تتابع؟",
      );
      if (!ok) return;
      localStorage.setItem(CONSENT_KEY, "1");
    }
    const userQuestion = input.trim();
    const summarizeMode = !userQuestion;
    const title = summarizeMode ? "ملخص المحادثة" : userQuestion;
    setAiBusy(true);
    setAiNote(null);
    opts.onBegin();
    try {
      // نص المحادثة يُرسل كرسالة واحدة من المستخدم بأسماء المتحدثين، لا كأدوار «مساعد» مزيّفة.
      const peerName = peer?.name ?? "الطرف الآخر";
      const transcript = messages
        .filter((m) => m.type !== "ai")
        .slice(-20)
        .map((m) => {
          const who = m.sender_id === userId ? "أنا" : peerName;
          const body =
            m.type === "image" ? "[صورة]" : m.type === "voice" ? "[رسالة صوتية]" : m.content;
          return `${who}: ${body}`;
        })
        .join("\n");
      const ask = summarizeMode ? "لخّص لي هذه المحادثة باختصار في نقاط، بالعربية." : userQuestion;
      const { text } = await invokeAi({
        data: {
          mode: summarizeMode ? "summarize" : "chat",
          messages: [
            {
              role: "user",
              content: transcript
                ? `هذه آخر رسائل محادثتي:\n${transcript}\n\n${ask}`.slice(0, 4000)
                : ask,
            },
          ],
        },
      });
      if (userQuestion) setInput("");
      setAiNote({ title, text });
    } catch (e) {
      setAiNote({
        title,
        text: e instanceof Error ? e.message : "تعذّر الاتصال بالمساعد الذكي.",
        error: true,
      });
    } finally {
      setAiBusy(false);
    }
  };

  return { aiNote, setAiNote, aiBusy, askAi };
}
