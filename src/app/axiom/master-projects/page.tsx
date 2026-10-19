import { redirect } from "next/navigation";

// Master Projects is no longer its own page — the master-project grouping now
// lives as a header on each project (assign/create a master, see the rollup +
// sibling builds there). Any old link lands on the Projects board instead.
export default function MasterProjectsRedirect() {
  redirect("/axiom/projects");
}
