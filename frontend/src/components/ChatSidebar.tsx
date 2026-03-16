import { useState, useRef, useEffect } from 'react';
import './ChatSidebar.css';

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
      {/* ── Toggle button — only visible when sidebar is closed ─────────── */}
      {!isOpen && (
        <button
          className="chat-toggle-btn"
          onClick={() => setIsOpen(true)}
          title="Open AI Assistant"
          aria-label="Open AI chat assistant"
        >
          <img src="/favicon.svg" alt="AI assistant" />
        </button>
      )}

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
