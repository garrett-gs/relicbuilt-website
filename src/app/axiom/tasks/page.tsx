import { redirect } from "next/navigation";

// /axiom/tasks used to host both the task Kanban and the Notes side panel.
// Both moved into /axiom/tracker (Tasks tab + Notes tab respectively).
// Anyone landing here from a bookmark or activity-log link gets pushed
// to the Tracker's Tasks tab automatically.
export default function TasksRedirect() {
  redirect("/axiom/tracker?tab=tasks");
}
