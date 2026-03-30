"use client";

import { useEffect, useState, useCallback } from "react";
import { axiom } from "@/lib/axiom-supabase";
import { useAuth } from "@/components/axiom/AuthProvider";
import { Task } from "@/types/axiom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const priorityColors: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

export default function MyTasksPage() {
  const { userEmail } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const { data } = await axiom.from("tasks").select("*").order("created_at", { ascending: false });
    if (data) {
      // Filter to tasks assigned to current user (match by first name or email)
      const mine = data.filter((t: Task) => {
        if (!t.assignee) return false;
        return t.assignee.toLowerCase() === userEmail.split("@")[0].toLowerCase() ||
               t.assignee.toLowerCase().includes(userEmail.split("@")[0].toLowerCase());
      });
      setTasks(mine);
    }
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  const active = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold">My Tasks</h1>
        <p className="text-muted text-sm mt-1">{active.length} active &middot; {done.length} completed</p>
      </div>

      {active.length === 0 && done.length === 0 ? (
        <div className="bg-card border border-border p-8 text-center">
          <p className="text-muted">No tasks assigned to you.</p>
          <Link href="/axiom/tasks" className="text-accent text-sm hover:underline mt-2 inline-block">
            View all tasks
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Active</h2>
              <div className="space-y-2">
                {active.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Completed</h2>
              <div className="space-y-2">
                {done.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const isOverdue = task.due_date && task.status !== "done" && new Date(task.due_date) < new Date();
  return (
    <div className={cn("bg-card border border-border p-4 flex items-center gap-4", task.status === "done" && "opacity-60")}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: priorityColors[task.priority] }} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", task.status === "done" && "line-through")}>{task.title}</p>
        {task.description && <p className="text-xs text-muted truncate mt-0.5">{task.description}</p>}
      </div>
      {task.due_date && (
        <span className={cn("text-xs whitespace-nowrap flex items-center gap-1", isOverdue ? "text-red-400" : "text-muted")}>
          {isOverdue && <AlertTriangle size={10} />}
          {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
      <span className="text-xs px-2 py-0.5 border border-border text-muted rounded">{task.status.replace("_", " ")}</span>
    </div>
  );
}
