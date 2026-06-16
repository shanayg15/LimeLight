import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listSubjects } from "@/lib/actions/subjects";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real authorization check (proxy.ts is only an optimistic edge redirect).
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const subjects = await listSubjects();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={user.email ?? ""}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive }))}
        />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
