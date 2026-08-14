import { redirect } from "next/navigation";

// The public lead-capture form was retired — project inquiries now go
// through the contact flow. Keep this route as a permanent redirect so any
// existing links (bookmarks, old emails) still land somewhere useful.
export default function LeadsRedirect() {
  redirect("/contact");
}
