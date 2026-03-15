import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

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

interface KanbanBoardProps {
  onLogout: () => void;
}

export default function KanbanBoard({ onLogout }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Status[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(null);

  const [newStatusName, setNewStatusName] = useState('');
  const [isCreatingStatus, setIsCreatingStatus] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const apiPost = async (url: string, body: object) => {
    return fetch(`http://localhost:3000${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
  };

  const apiPut = async (url: string, body: object) => {
    return fetch(`http://localhost:3000${url}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
  };

  const apiDelete = async (url: string) => {
    return fetch(`http://localhost:3000${url}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
  };

  const fetchBoardData = async () => {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
      const [statusesRes, tasksRes] = await Promise.all([
        fetch('http://localhost:3000/statuses', { headers }),
        fetch('http://localhost:3000/tasks', { headers }),
      ]);

      if (statusesRes.status === 401 || tasksRes.status === 401) {
        onLogout();
        return;
      }

      if (statusesRes.ok && tasksRes.ok) {
        let dbStatuses: Status[] = await statusesRes.json();
        const dbTasks: Task[] = await tasksRes.json();

        if (dbStatuses.length === 0) {
          const defaultStatuses = ['To Do', 'In Progress', 'Done'];
          for (const name of defaultStatuses) {
            const res = await apiPost('/statuses', { name });
            if (res.ok) {
              const created = await res.json();
              dbStatuses.push(created);
            }
          }
        }

        const nameToCanonical: Record<string, Status> = {};
        const uniqueStatuses: Status[] = [];
        for (const status of dbStatuses) {
          const key = status.name.toLowerCase();
          if (!nameToCanonical[key]) {
            nameToCanonical[key] = status;
            uniqueStatuses.push(status);
          }
        }

        const normalizedTasks = dbTasks.map((task) => {
          const statusName = task.status?.id ? dbStatuses.find((s) => s.id === task.status.id)?.name : undefined;
          if (statusName) {
            const canonical = nameToCanonical[statusName.toLowerCase()];
            if (canonical && canonical.id !== task.status.id) {
              return { ...task, status: { id: canonical.id } };
            }
          }
          return task;
        });

        setColumns(uniqueStatuses);
        setTasks(normalizedTasks);

        if (uniqueStatuses.length > 0 && selectedStatusId === null) {
          setSelectedStatusId(uniqueStatuses[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoardData();
  }, []);

  const addNewTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || selectedStatusId === null) return;

    try {
      const res = await apiPost('/tasks', {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim(),
        statusId: selectedStatusId,
      });

      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDesc('');
        await fetchBoardData();
      } else {
        alert('Failed to create task');
      }
    } catch (error) {
      alert('Error creating task');
    }
  };

  const addNewStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusName.trim()) return;

    setIsCreatingStatus(true);
    try {
      const res = await apiPost('/statuses', { name: newStatusName.trim() });
      if (res.ok) {
        const created: Status = await res.json();
        setColumns((prev) => {
          if (prev.some((s) => s.name.toLowerCase() === created.name.toLowerCase())) return prev;
          return [...prev, created];
        });
        setSelectedStatusId(created.id);
        setNewStatusName('');
      } else {
        alert('Failed to create status');
      }
    } catch (error) {
      alert('Error creating status');
    } finally {
      setIsCreatingStatus(false);
    }
  };

  const deleteTask = async (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await apiDelete(`/tasks/${id}`);
  };

  const moveTaskToStatus = async (taskId: number, statusId: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: { id: statusId } } : t))
    );
    await apiPut(`/tasks/${taskId}`, { statusId });
  };

  const getTasksByStatusId = (statusId: number) =>
    tasks.filter((t) => t.status?.id === statusId);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const taskId = parseInt(draggableId, 10);
    const newStatusId = parseInt(destination.droppableId, 10);
    await moveTaskToStatus(taskId, newStatusId);
  };

  const deleteStatus = async (statusId: number) => {
    const confirm = window.confirm('Delete this status? This cannot be undone.');
    if (!confirm) return;

    const res = await apiDelete(`/statuses/${statusId}`);
    if (res.ok) {
      setColumns((prev) => {
        const next = prev.filter((s) => s.id !== statusId);
        if (selectedStatusId === statusId) {
          setSelectedStatusId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
      setTasks((prev) => prev.filter((t) => t.status?.id !== statusId));
    } else {
      const text = await res.text();
      alert(`Unable to delete status: ${text}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0f0ec] flex items-center justify-center">
        <div className="text-slate-500 text-sm font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f0ec] p-8 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-10">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
          Project Tasks
        </h1>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Add Task Form */}
      <div className="max-w-7xl mx-auto mb-6">
        <form
          onSubmit={addNewTask}
          className="bg-white p-6 border border-slate-300 shadow-[3px_3px_0_#c8c8c0]"
        >
          <h2 className="text-base font-semibold text-slate-700 mb-4">Add New Task</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title"
              className="px-3 py-2.5 bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-600 text-sm transition-colors"
              required
            />
            <input
              type="text"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              placeholder="Task description"
              className="px-3 py-2.5 bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-600 text-sm transition-colors"
            />
            <select
              value={selectedStatusId || ''}
              onChange={(e) => setSelectedStatusId(parseInt(e.target.value, 10))}
              className="px-3 py-2.5 bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-slate-600 text-sm transition-colors"
              required
            >
              <option value="">Select status</option>
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="mt-4 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-sm font-semibold text-white transition-all shadow-[2px_2px_0_#1e1e1e]"
          >
            Add Task
          </button>
        </form>

        {/* Add Status Form */}
        <form
          onSubmit={addNewStatus}
          className="bg-white p-6 border border-slate-300 shadow-[3px_3px_0_#c8c8c0] mt-5"
        >
          <h2 className="text-base font-semibold text-slate-700 mb-4">Add Custom Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={newStatusName}
              onChange={(e) => setNewStatusName(e.target.value)}
              placeholder="Status name"
              className="px-3 py-2.5 bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-600 text-sm transition-colors"
              required
            />
            <button
              type="submit"
              disabled={!newStatusName.trim() || isCreatingStatus}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all shadow-[2px_2px_0_#1e1e1e] disabled:shadow-none"
            >
              {isCreatingStatus ? 'Creating...' : 'Add Status'}
            </button>
          </div>
        </form>
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="max-w-7xl mx-auto flex overflow-x-auto gap-6 items-start pb-8">
          {columns.map((column) => {
            const tasksInColumn = getTasksByStatusId(column.id);
            return (
              <Droppable droppableId={column.id.toString()} key={column.id}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-col w-80 shrink-0"
                  >
                    {/* Tab header — flat rectangular, hard border, no rounding */}
                    <div className="flex items-center justify-between bg-white border border-b-0 border-slate-300 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-slate-800 text-sm">{column.name}</h2>
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 font-medium border border-slate-300">
                          {tasksInColumn.length}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteStatus(column.id)}
                        disabled={tasksInColumn.length > 0}
                        className="text-xs text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Column body — the "page" */}
                    <div
                      className="flex flex-col gap-3 min-h-[200px] p-3 bg-white border border-slate-300 shadow-[4px_4px_0_#c8c8c0]"
                    >
                      {tasksInColumn.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id.toString()} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="bg-white p-4 border border-slate-300 shadow-[3px_3px_0_#b0b0a8] hover:shadow-[4px_4px_0_#909088] transition-shadow"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-slate-800 leading-snug break-words text-sm">
                                    {task.title}
                                  </h3>
                                  {task.description && (
                                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => deleteTask(task.id)}
                                  className="ml-2 p-1 text-slate-300 hover:text-red-400 transition-colors"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-200">
                                <label className="text-xs text-slate-400 shrink-0">Move to:</label>
                                <select
                                  value={task.status.id}
                                  onChange={(e) => moveTaskToStatus(task.id, parseInt(e.target.value, 10))}
                                  className="flex-1 px-2 py-1 bg-slate-50 border border-slate-300 text-slate-700 text-xs focus:outline-none focus:border-slate-500 transition-colors"
                                >
                                  {columns.map((colOption) => (
                                    <option key={colOption.id} value={colOption.id}>
                                      {colOption.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
