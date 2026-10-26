-- Axiom → Hone: every Tracker task (from the Tracker, Projects, the
-- Assistant or lead intake) is sent to Hone when it's created or changed.
--   Assigned to a team member  → straight onto that person's Hone list
--                                (matched by their email in Settings → Team)
--   Unassigned                 → a suggestion in Hone, waiting for approval
--   Marked done here           → checked off in Hone
-- Deleting a task here does nothing in Hone (Hone never deletes).
--
-- Needs: the pg_net extension, and the Hone integration key stored in Vault
-- under the name 'hone_integration_key' (made in Hone → Settings →
-- Integrations; added separately so it never sits in this file).

create extension if not exists pg_net;

create or replace function public.send_task_to_hone()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_email text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'hone_integration_key';
  if v_key is null then
    return new;  -- not connected to Hone
  end if;
  if new.assignee is not null then
    select m->>'email' into v_email
    from public.settings s, jsonb_array_elements(s.team_members::jsonb) m
    where m->>'name' = new.assignee
    limit 1;
  end if;
  -- Fire-and-forget: a slow or unreachable Hone never holds up Axiom.
  perform net.http_post(
    url := 'https://hone.relicon.app/api/v1/tasks',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'external_id', 'axiom-task-' || new.id,
      'title', new.title,
      'notes', coalesce(new.description, ''),
      'due_date', coalesce(new.due_date::text, ''),
      'priority', case new.priority when 'high' then 'high' when 'low' then 'low' else 'normal' end,
      'assignee_email', coalesce(v_email, ''),
      'status', case when new.status = 'done' then 'done' else 'open' end,
      'url', 'https://relicbuilt.com/axiom/tracker?tab=tasks'
    )
  );
  return new;
end;
$$;

revoke all on function public.send_task_to_hone() from public, anon, authenticated;

drop trigger if exists tasks_to_hone on public.tasks;
create trigger tasks_to_hone
after insert or update of title, description, due_date, priority, assignee, status on public.tasks
for each row execute function public.send_task_to_hone();
