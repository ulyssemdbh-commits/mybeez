import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface AlfredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  timestamp: Date;
}

interface AlfredChatProps {
  tenantSlug: string;
  checklistContext?: {
    total: number;
    checked: number;
    unchecked: number;
    uncheckedItems: string[];
  };
  className?: string;
}

export function AlfredChat({ tenantSlug, checklistContext, className }: AlfredChatProps) {
  const [messages, setMessages] = useState<AlfredMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: AlfredMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`/api/alfred/${encodeURIComponent(tenantSlug)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          context: checklistContext ? { checklist: checklistContext } : undefined,
        }),
      });

      const data = await res.json();

      const assistantMsg: AlfredMessage = {
        id: `alfred-${Date.now()}`,
        role: "assistant",
        content: data.text || data.error || "Erreur inconnue",
        provider: data.provider,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Impossible de joindre Alfred. Vérifiez votre connexion.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, isLoading, tenantSlug, checklistContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        data-testid="alfred-toggle"
        title="Parler à Alfred"
      >
        <span className="text-xl font-bold">A</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[360px] max-h-[500px] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden",
        className,
      )}
      data-testid="alfred-chat"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            A
          </div>
          <div>
            <div className="font-semibold text-sm">Alfred</div>
            <div className="text-xs opacity-80">Assistant myBeez</div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white/80 hover:text-white text-lg"
          data-testid="alfred-close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[340px]">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <p className="font-medium">Bonjour ! Je suis Alfred.</p>
            <p className="mt-1 text-xs">Posez-moi une question sur votre restaurant.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-foreground",
              )}
              data-testid={`alfred-msg-${msg.role}`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.provider && msg.provider !== "fallback" && (
                <p className="text-[10px] opacity-50 mt-1">via {msg.provider}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 text-sm">
              <span className="animate-pulse">Alfred réfléchit...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-2 flex gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Demandez à Alfred..."
          className="min-h-[40px] max-h-[80px] resize-none text-sm"
          rows={1}
          data-testid="alfred-input"
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 self-end"
          data-testid="alfred-send"
        >
          →
        </Button>
      </div>
    </div>
  );
}
