// Chat slide-over content. Renders tool_calls under each assistant reply —
// that's what makes this visibly multi-agent, not a plain chat box.
import { useState } from "react";
import Icon from "../components/icons";
import { askPulse } from "../lib/api";
import type { ChatReply } from "../lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ChatReply["tool_calls"];
  mode?: ChatReply["mode"];
}

export default function AskPulse() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await askPulse(message, history);
      setTurns((t) => [...t, { role: "assistant", content: res.reply, toolCalls: res.tool_calls, mode: res.mode }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel" style={{ height: "100%" }}>
      <div className="chat-messages">
        {turns.length === 0 && <p className="muted">Ask PULSE about any brand, run, or signal.</p>}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "chat-message self" : "chat-message"}>
            {t.role === "assistant" && t.mode === "rate_limited" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--haldi)" }}>
                <Icon name="rateLimited" size={14} /> Rate limited — try again shortly.
              </div>
            ) : (
              <div>{t.content}</div>
            )}
            {t.toolCalls && t.toolCalls.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {t.toolCalls.map((tc, j) => (
                  <span key={j} className="pill" data-tone="neutral" title={JSON.stringify(tc.args)}>
                    {tc.tool}: {tc.result_summary}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <p className="muted">PULSE is thinking…</p>}
        {error && <div className="error-banner">{error}</div>}
      </div>
      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Ask PULSE…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={sending}
        />
        <button className="btn-pill btn-run" onClick={send} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
