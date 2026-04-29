import { useState, useRef, useEffect } from 'react';
import api from '../../lib/api';
import { Send, Bot, User as UserIcon, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is the most likely root cause?',
  'What should we check first?',
  'Who should be paged?',
  'Draft a customer-facing status update.',
];

export default function IncidentChat({ incidentId }: { incidentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { data } = await api.post(`/ai/incidents/${incidentId}/chat`, {
        message: userMsg.content,
        history: messages,
      });
      setMessages([...next, { role: 'assistant', content: data.data.reply }]);
    } catch {
      toast.error('AI chat failed');
      setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl flex flex-col h-[500px]">
      <div className="flex items-center gap-2 p-3 border-b">
        <Sparkles className="w-4 h-4 text-purple-600" />
        <h3 className="font-semibold text-gray-900">War Room AI Chat</h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-3">Ask anything about this incident.</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs bg-gray-50 hover:bg-gray-100 border rounded p-2 text-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-purple-700" />
              </div>
            )}
            <div className={`text-sm whitespace-pre-wrap rounded-lg px-3 py-2 max-w-[80%] ${
              m.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-blue-700" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-700" />
            </div>
            <div className="bg-gray-100 text-gray-500 rounded-lg px-3 py-2 text-sm italic">
              thinking…
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
          placeholder="Ask the AI…"
          disabled={sending}
          className="flex-1 border rounded px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 rounded disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
