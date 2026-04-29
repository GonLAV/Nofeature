import { useState, useEffect, useRef, FormEvent } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../store/auth.store';
import api from '../lib/api';

interface Message {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

interface WarRoomChatProps {
  incidentId: string;
  // New messages pushed via SSE arrive through this prop
  liveMessage?: Message | null;
}

export default function WarRoomChat({ incidentId, liveMessage }: WarRoomChatProps) {
  const user = useAuthStore(s => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    api
      .get<{ data: Message[] }>(`/warroom/incidents/${incidentId}/messages`)
      .then(r => setMessages(r.data.data))
      .catch(() => {});
  }, [incidentId]);

  // Append live messages from SSE
  useEffect(() => {
    if (!liveMessage) return;
    setMessages(prev => {
      if (prev.some(m => m.id === liveMessage.id)) return prev;
      return [...prev, liveMessage];
    });
  }, [liveMessage]);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    try {
      await api.post(`/warroom/incidents/${incidentId}/messages`, { content });
      // The SSE broadcast will add the message to state via liveMessage prop
    } catch {
      setInput(content); // restore on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border flex flex-col" style={{ height: '420px' }}>
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <MessageSquare size={16} className="text-blue-600" />
        <span className="font-semibold text-sm">War Room Chat</span>
        <span className="ml-auto text-xs text-gray-400">{messages.length} messages</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-8">
            No messages yet — start coordinating
          </p>
        )}
        {messages.map(msg => {
          const isMe = msg.user_id === user?.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-xs lg:max-w-sm px-3 py-2 rounded-2xl text-sm ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-xs text-gray-400 mt-0.5">
                {isMe ? 'You' : msg.user_name} ·{' '}
                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="px-3 py-3 border-t flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          className="flex-1 border rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="bg-blue-600 text-white rounded-full p-2 hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
