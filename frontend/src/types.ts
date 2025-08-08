export interface Message {
  id: string;
  role: string; // "user", "assistant", or artifact roles
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  folder?: string;
  messages: Message[];
}
