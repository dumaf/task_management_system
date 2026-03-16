import { useState, useRef, useEffect } from 'react';

interface Status {
  id: number;
  name: string;
}

interface Task {
  id: number;
  title: string;
  description: string;
  status: { id: number };
}

interface ChatSidebarProps {
  columns: Status[];
  tasks: Task[];
  fetchBoardData: () => Promise<void>;
}

// ─── Action types returned by Gemini ────────────────────────────────────────
interface ConfirmCreateAction {
  action: 'confirm_create';
  task: { title: string; description: string; statusName: string };
}
interface ConfirmDeleteAction {
  action: 'confirm_delete';
  taskId: number;
  taskTitle: string;
}
interface ConfirmStatusChangeAction {
  action: 'confirm_status_change';
  taskId: number;
  taskTitle: string;
  newStatusName: string;
}
interface ConfirmCreateStatusAction {
  action: 'confirm_create_status';
  statusName: string;
}
interface MessageAction {
  action: 'message';
  text: string;
}

type BotAction =
  | ConfirmCreateAction
  | ConfirmDeleteAction
  | ConfirmStatusChangeAction
  | ConfirmCreateStatusAction
  | MessageAction;

// ─── Chat message shape ──────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  action?: BotAction;
  /** has the user already acted on a confirmation card? */
  resolved?: boolean;
}

// ─── Thin API helpers ────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('token') ?? '';

const apiHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

const apiPost = (url: string, body: object) =>
  fetch(url, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body) });

const apiPut = (url: string, body: object) =>
  fetch(url, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify(body) });

const apiDelete = (url: string) =>
  fetch(url, { method: 'DELETE', headers: apiHeaders() });

// ─── Confirmation card ───────────────────────────────────────────────────────
function ConfirmCard({
  action,
  onConfirm,
  onCancel,
  resolved,
}: {
  action: BotAction;
  onConfirm: () => void;
  onCancel: () => void;
  resolved: boolean;
}) {
  if (action.action === 'message') return null;

  let title = '';
  let rows: { label: string; value: string }[] = [];

  if (action.action === 'confirm_create') {
    title = '✦ Create task?';
    rows = [
      { label: 'Title', value: action.task.title },
      { label: 'Description', value: action.task.description || '—' },
      { label: 'Status', value: action.task.statusName },
    ];
  } else if (action.action === 'confirm_delete') {
    title = '✦ Delete task?';
    rows = [{ label: 'Task', value: action.taskTitle }];
  } else if (action.action === 'confirm_status_change') {
    title = '✦ Change status?';
    rows = [
      { label: 'Task', value: action.taskTitle },
      { label: 'New status', value: action.newStatusName },
    ];
  } else if (action.action === 'confirm_create_status') {
    title = '✦ Create status?';
    rows = [{ label: 'Status name', value: action.statusName }];
  }

  return (
    <div className="chat-confirm-card">
      <div className="chat-confirm-card__title">{title}</div>
      <div className="chat-confirm-card__rows">
        {rows.map((r) => (
          <div key={r.label} className="chat-confirm-card__row">
            <span className="chat-confirm-card__label">{r.label}</span>
            <span className="chat-confirm-card__value">{r.value}</span>
          </div>
        ))}
      </div>
      {!resolved && (
        <div className="chat-confirm-card__actions">
          <button
            className="chat-confirm-card__btn chat-confirm-card__btn--confirm"
            onClick={onConfirm}
          >
            Confirm
          </button>
          <button
            className="chat-confirm-card__btn chat-confirm-card__btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      )}
      {resolved && (
        <div className="chat-confirm-card__resolved">Action completed</div>
      )}
    </div>
  );
}

// ─── Main sidebar component ──────────────────────────────────────────────────
export default function ChatSidebar({ fetchBoardData }: ChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: 'Hi! I can create, delete, or update tasks for you. Just tell me what you\'d like to do.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Build the conversation history in the format Gemini expects
  const buildHistory = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        parts:
          m.role === 'user'
            ? m.text ?? ''
            : m.action
            ? JSON.stringify(m.action)
            : m.text ?? '',
      }));

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          message: text,
          history: buildHistory(nextMessages),
        }),
      });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();
      const botAction: BotAction = data.response;

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        action: botAction,
        text: botAction.action === 'message' ? botAction.text : undefined,
        resolved: false,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'bot',
          text: 'Sorry, something went wrong. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveMessage = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, resolved: true } : m))
    );
  };

  const addSystemMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'bot', text },
    ]);
  };

  const handleConfirm = async (msg: ChatMessage) => {
    if (!msg.action || msg.action.action === 'message') return;
    resolveMessage(msg.id);

    const action = msg.action;

    try {
      if (action.action === 'confirm_create') {
        const res = await apiPost('/tasks', {
          title: action.task.title,
          description: action.task.description,
          statusName: action.task.statusName,
        });
        if (res.ok) {
          await fetchBoardData();
          addSystemMessage(`✓ Task "${action.task.title}" created successfully.`);
        } else {
          addSystemMessage('❌ Failed to create the task. Please try again.');
        }
      } else if (action.action === 'confirm_delete') {
        const res = await apiDelete(`/tasks/${action.taskId}`);
        if (res.ok || res.status === 204) {
          await fetchBoardData();
          addSystemMessage(`✓ Task "${action.taskTitle}" deleted.`);
        } else {
          addSystemMessage('❌ Failed to delete the task. Please try again.');
        }
      } else if (action.action === 'confirm_status_change') {
        const res = await apiPut(`/tasks/${action.taskId}`, {
          statusName: action.newStatusName,
        });
        if (res.ok) {
          await fetchBoardData();
          addSystemMessage(
            `✓ Moved "${action.taskTitle}" to "${action.newStatusName}".`
          );
        } else {
          addSystemMessage('❌ Failed to update the task status. Please try again.');
        }
      } else if (action.action === 'confirm_create_status') {
        const res = await apiPost('/statuses', { name: action.statusName });
        if (res.ok || res.status === 201 || res.status === 200) {
          await fetchBoardData();
          addSystemMessage(`✓ Status "${action.statusName}" created.`);
        } else {
          addSystemMessage('❌ Failed to create the status. Please try again.');
        }
      }
    } catch (err) {
      console.error(err);
      addSystemMessage('❌ Something went wrong. Please try again.');
    }
  };

  const handleCancel = (msg: ChatMessage) => {
    resolveMessage(msg.id);
    addSystemMessage('Action cancelled.');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* ── styles injected once ─────────────────────────────────────────── */}
      <style>{`
        /* Toggle button */
        .chat-toggle-btn {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 1000;
          width: 52px;
          height: 52px;
          border: 2px solid #1e293b;
          background: #fff;
          box-shadow: 3px 3px 0 #1e293b;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: box-shadow 0.15s, transform 0.15s;
          padding: 0;
        }
        .chat-toggle-btn:hover {
          box-shadow: 5px 5px 0 #1e293b;
          transform: translate(-1px, -1px);
        }
        .chat-toggle-btn img {
          width: 28px;
          height: 28px;
        }

        /* Sidebar panel */
        .chat-sidebar {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: 380px;
          max-width: 95vw;
          z-index: 999;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-left: 2px solid #1e293b;
          box-shadow: -4px 0 0 #c8c8c0;
          transform: translateX(100%);
          transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chat-sidebar.is-open {
          transform: translateX(0);
        }

        /* Header */
        .chat-sidebar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1.5px solid #e2e8f0;
          flex-shrink: 0;
        }
        .chat-sidebar__header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .chat-sidebar__header-left img {
          width: 22px;
          height: 22px;
        }
        .chat-sidebar__title {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
          letter-spacing: -0.01em;
        }
        .chat-sidebar__close {
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          font-size: 20px;
          line-height: 1;
          padding: 2px 6px;
          transition: color 0.15s;
        }
        .chat-sidebar__close:hover {
          color: #1e293b;
        }

        /* Messages area */
        .chat-sidebar__messages {
          flex: 1;
          overflow-y: auto;
          padding: 18px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Individual message */
        .chat-msg {
          display: flex;
          flex-direction: column;
          max-width: 88%;
        }
        .chat-msg--user {
          align-self: flex-end;
          align-items: flex-end;
        }
        .chat-msg--bot {
          align-self: flex-start;
          align-items: flex-start;
        }
        .chat-msg__bubble {
          padding: 9px 13px;
          font-size: 13px;
          line-height: 1.55;
          border: 1.5px solid #e2e8f0;
        }
        .chat-msg--user .chat-msg__bubble {
          background: #1e293b;
          color: #fff;
          border-color: #1e293b;
        }
        .chat-msg--bot .chat-msg__bubble {
          background: #f8fafc;
          color: #334155;
        }

        /* Typing indicator */
        .chat-typing {
          align-self: flex-start;
          padding: 10px 14px;
          background: #f1f5f9;
          border: 1.5px solid #e2e8f0;
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .chat-typing__dot {
          width: 6px;
          height: 6px;
          background: #94a3b8;
          border-radius: 50%;
          animation: chat-bounce 1.2s ease-in-out infinite;
        }
        .chat-typing__dot:nth-child(2) { animation-delay: 0.2s; }
        .chat-typing__dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes chat-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }

        /* Confirmation card */
        .chat-confirm-card {
          background: #fff;
          border: 1.5px solid #1e293b;
          box-shadow: 3px 3px 0 #c8c8c0;
          padding: 14px;
          font-size: 13px;
          width: 100%;
        }
        .chat-confirm-card__title {
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 10px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .chat-confirm-card__rows {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-bottom: 14px;
        }
        .chat-confirm-card__row {
          display: flex;
          gap: 8px;
        }
        .chat-confirm-card__label {
          color: #64748b;
          font-size: 12px;
          min-width: 72px;
          flex-shrink: 0;
        }
        .chat-confirm-card__value {
          color: #1e293b;
          font-size: 12px;
          font-weight: 600;
          word-break: break-word;
        }
        .chat-confirm-card__actions {
          display: flex;
          gap: 8px;
        }
        .chat-confirm-card__btn {
          flex: 1;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid;
          transition: opacity 0.15s;
        }
        .chat-confirm-card__btn:hover { opacity: 0.85; }
        .chat-confirm-card__btn--confirm {
          background: #1e293b;
          color: #fff;
          border-color: #1e293b;
        }
        .chat-confirm-card__btn--cancel {
          background: #fff;
          color: #64748b;
          border-color: #cbd5e1;
        }
        .chat-confirm-card__resolved {
          font-size: 11px;
          color: #64748b;
          font-style: italic;
        }

        /* Input area */
        .chat-sidebar__footer {
          border-top: 1.5px solid #e2e8f0;
          padding: 14px 16px;
          flex-shrink: 0;
        }
        .chat-sidebar__input-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .chat-sidebar__input {
          flex: 1;
          padding: 9px 12px;
          background: #fff;
          border: 1.5px solid #cbd5e1;
          font-size: 13px;
          color: #1e293b;
          resize: none;
          font-family: inherit;
          line-height: 1.5;
          transition: border-color 0.15s;
          min-height: 38px;
          max-height: 100px;
        }
        .chat-sidebar__input:focus {
          outline: none;
          border-color: #1e293b;
        }
        .chat-sidebar__input::placeholder {
          color: #94a3b8;
        }
        .chat-sidebar__send {
          padding: 9px 14px;
          background: #1e293b;
          color: #fff;
          border: 1.5px solid #1e293b;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
          box-shadow: 2px 2px 0 #0f172a;
          flex-shrink: 0;
        }
        .chat-sidebar__send:hover:not(:disabled) {
          background: #334155;
        }
        .chat-sidebar__send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .chat-sidebar__hint {
          margin-top: 7px;
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>

      {/* ── Toggle button ────────────────────────────────────────────────── */}
      <button
        className="chat-toggle-btn"
        onClick={() => setIsOpen((o) => !o)}
        title="Open AI Assistant"
        aria-label="Toggle AI chat assistant"
      >
        <img src="/favicon.svg" alt="AI assistant" />
      </button>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className={`chat-sidebar${isOpen ? ' is-open' : ''}`} role="complementary" aria-label="AI chat assistant">
        {/* Header */}
        <div className="chat-sidebar__header">
          <div className="chat-sidebar__header-left">
            <img src="/favicon.svg" alt="" />
            <span className="chat-sidebar__title">AI Assistant</span>
          </div>
          <button
            className="chat-sidebar__close"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="chat-sidebar__messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-msg chat-msg--${msg.role}`}
            >
              {/* Plain text bubble */}
              {msg.text && (
                <div className="chat-msg__bubble">{msg.text}</div>
              )}

              {/* Confirmation card (bot only, non-message actions) */}
              {msg.role === 'bot' && msg.action && msg.action.action !== 'message' && (
                <ConfirmCard
                  action={msg.action}
                  onConfirm={() => handleConfirm(msg)}
                  onCancel={() => handleCancel(msg)}
                  resolved={msg.resolved ?? false}
                />
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="chat-typing">
              <div className="chat-typing__dot" />
              <div className="chat-typing__dot" />
              <div className="chat-typing__dot" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-sidebar__footer">
          <div className="chat-sidebar__input-row">
            <textarea
              className="chat-sidebar__input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create, update, or delete tasks…"
              rows={1}
              disabled={isLoading}
            />
            <button
              className="chat-sidebar__send"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              Send
            </button>
          </div>
          <div className="chat-sidebar__hint">Press Enter to send · Shift+Enter for new line</div>
        </div>
      </div>
    </>
  );
}
