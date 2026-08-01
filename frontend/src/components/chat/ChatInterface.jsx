import React, { useState, useRef, useEffect } from 'react';
import { GraducationCap, Loader2 } from 'lucide-react';
import DocumentSelector from '../document/DocumentSelector';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { sendQuery } from '../../services/api';

export default function ChatInterface({ documents, selectedDocs, setSelectedDocs }) {
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "Hello! I'm ScholarsMate. Ask me questions about your uploaded research papers.",
      sources: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setLoading(true);

    try {
      const result = await sendQuery(userMessage, selectedDocs);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: result.answer,
          sources: result.sources_used || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ Generation failed. Please check backend connection.',
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-zinc-950 h-full relative overflow-hidden">
      {/* Top Header Bar with Extracted Document Selector */}
      <div className="px-6 py-2.5 bg-zinc-950 border-b border-zinc-800/60 flex items-center justify-between shrink-0 z-20">
        <DocumentSelector
          documents={documents}
          selectedDocs={selectedDocs}
          setSelectedDocs={setSelectedDocs}
        />
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((msg, idx) => (
          <ChatMessage key={idx} message={msg} />
        ))}

        {loading && (
          <div className="flex gap-4">
            <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl px-5 py-4 flex items-center gap-3 text-zinc-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span>Synthesizing source-locked evidence...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Extracted Floating Chat Input */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </main>
  );
}