import { SupabaseClient } from "@supabase/supabase-js";
import { CustomWork } from "@/types/axiom";

export type TentativeItem = {
  id: string;
  project_name?: string;
  client_name?: string;
  start_date?: string;
  due_date?: string;
  status?: string;
  labor_items?: { hours?: number }[];
};

export interface CalendarData {
  projects: CustomWork[];
  estimateHoursById: Record<string, number>;
  tentatives: TentativeItem[];
  tentativeHours: Record<string, number>;
}

/**
 * Load everything the Build Calendar renders for one entity: confirmed
 * projects (custom_work with dates), the labor-hours map used to span a
 * project back from its due date, and unapproved estimates with a build
 * window ("tentative"). Same query for the internal (anon) and public
 * (service-role) views, so the calendar looks identical either way.
 */
export async function loadCalendarData(client: SupabaseClient, entity: string): Promise<CalendarData> {
  const [projectsRes, estimatesRes, tentativesRes] = await Promise.all([
    client.from("custom_work").select("*").eq("entity", entity).order("due_date"),
    client.from("estimates")
      .select("custom_work_id, labor_items, change_order_for_id")
      .not("custom_work_id", "is", null)
      .is("change_order_for_id", null),
    client.from("estimates")
      .select("id, project_name, client_name, start_date, due_date, labor_items, status")
      .eq("entity", entity)
      .is("custom_work_id", null)
      .is("change_order_for_id", null),
  ]);

  const projects = ((projectsRes.data || []) as CustomWork[]).filter((p) => p.start_date || p.due_date);

  const estimateHoursById: Record<string, number> = {};
  for (const e of (estimatesRes.data || []) as { custom_work_id: string; labor_items?: { hours?: number }[] }[]) {
    const hours = (e.labor_items || []).reduce((s, it) => s + (Number(it?.hours) || 0), 0);
    if (hours > 0) estimateHoursById[e.custom_work_id] = hours;
  }

  const tentatives = ((tentativesRes.data || []) as TentativeItem[]).filter((t) => t.start_date || t.due_date);
  const tentativeHours: Record<string, number> = {};
  for (const t of tentatives) {
    const hours = (t.labor_items || []).reduce((s, it) => s + (Number(it?.hours) || 0), 0);
    if (hours > 0) tentativeHours[t.id] = hours;
  }

  return { projects, estimateHoursById, tentatives, tentativeHours };
}
