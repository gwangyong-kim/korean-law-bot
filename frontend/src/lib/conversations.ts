/**
 * localStorage 기반 대화 기록 관리
 */

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "law-bot-conversations";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadAll(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function getConversations(): Conversation[] {
  return loadAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | undefined {
  return loadAll().find((c) => c.id === id);
}

export function createConversation(): Conversation {
  const conv: Conversation = {
    id: generateId(),
    title: "새 대화",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = loadAll();
  all.push(conv);
  saveAll(all);
  return conv;
}

export function updateConversation(id: string, messages: Message[]) {
  const all = loadAll();
  const conv = all.find((c) => c.id === id);
  if (!conv) return;

  conv.messages = messages;
  conv.updatedAt = Date.now();

  // 첫 번째 유저 메시지를 제목으로 사용
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (firstUserMsg) {
    conv.title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
  }

  saveAll(all);
}

export function deleteConversation(id: string) {
  const all = loadAll().filter((c) => c.id !== id);
  saveAll(all);
}
