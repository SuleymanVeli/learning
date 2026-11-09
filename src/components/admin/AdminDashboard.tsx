"use client";

import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";

export function AdminDashboard() {
  return (
    <RoleGate role="admin">
      {(user) => (
        <DashboardShell
          name={user.name}
          role="admin"
          avatar={user.avatar}
          canManageTeachers={user.canManageTeachers}
        >
          <div aria-hidden="true" />
        </DashboardShell>
      )}
    </RoleGate>
  );
}
