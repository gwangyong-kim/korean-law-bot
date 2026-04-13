"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { extractAssistantText } from "@/lib/ui-message-parts";

export default function TestChat() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Chat Test (인증 없음)</h1>
      <p>Status: <strong>{status}</strong></p>
      {error && <p style={{ color: "red" }}>Error: {error.message}</p>}

      <div style={{ border: "1px solid #ccc", padding: 10, minHeight: 200, marginBottom: 10 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <strong>{m.role}:</strong> {extractAssistantText(m)}
          </div>
        ))}
        {messages.length === 0 && <p style={{ color: "#999" }}>메시지 없음</p>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          placeholder="질문 입력..."
          style={{ flex: 1, padding: 8 }}
        />
        <button
          onClick={() => {
            if (input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          style={{ padding: "8px 16px" }}
        >
          전송
        </button>
      </div>

      <pre style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
        {JSON.stringify(messages, null, 2)}
      </pre>
    </div>
  );
}
