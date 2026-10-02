"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Minimal operational staff management form.
 * No visual polish by design: the goal is to enable a real smoke test.
 *
 * SECURITY: the client only ever chooses firstName, lastName, email, role and
 * outlet at creation time, and later a status toggle or a role change. The
 * role change sends exactly { staffId, roleId }; organizationId, creator
 * identity, status, permissions and platform flags are derived server-side and
 * are never sent from here. The server re-validates everything (authorization,
 * tenant ownership of both staff and role, platform-role refusal, last active
 * OWNER invariant).
 */

type StaffRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  status: string;
  outletName: string | null;
  roleNames: string[];
};

type RoleOption = { id: string; name: string; description: string | null };
type OutletOption = { id: string; name: string; isActive: boolean };

export function StaffManager({
  viewerId,
  initialStaff,
  roles,
  outlets,
}: {
  viewerId: string;
  initialStaff: StaffRow[];
  roles: RoleOption[];
  outlets: OutletOption[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  /** staffId of the row whose role is being changed right now, if any. */
  const [changingId, setChangingId] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setMessage(null);
    setWarnings([]);

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName: lastName || null,
          email,
          roleId,
          outletId,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Gagal membuat staff.");
      }

      setMessage({
        kind: "ok",
        text: `Staff ${payload.data.staff.email} dibuat dengan akun Supabase Auth. HANSAN tidak menampilkan atau menyimpan password.`,
      });
      setWarnings(payload.data.warnings ?? []);
      setFirstName("");
      setLastName("");
      setEmail("");
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Gagal membuat staff.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(staffId: string, currentStatus: string) {
    setMessage(null);
    const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, status: nextStatus }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Gagal memperbarui status staff.");
      }

      setMessage({ kind: "ok", text: `Status staff diubah menjadi ${nextStatus}.` });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Gagal memperbarui status staff.",
      });
    }
  }

  async function handleChangeRole(staffId: string, roleId: string) {
    if (!roleId || changingId) return;

    setChangingId(staffId);
    setMessage(null);

    try {
      // Exactly { staffId, roleId }: the server derives the organization, the
      // actor and every authorization fact from the session.
      const response = await fetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, roleId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Gagal mengubah role staff.");
      }

      const assignedRole = (payload.data.staff.roleNames ?? []).join(", ") || "no role";
      setMessage({
        kind: "ok",
        text: `Role ${payload.data.staff.email} diubah menjadi ${assignedRole}.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Gagal mengubah role staff.",
      });
      // Re-render from the server so the select shows the stored role again.
      router.refresh();
    } finally {
      setChangingId(null);
    }
  }

  const fieldClass =
    "w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-sm text-white outline-none focus:border-emerald-400";

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Create staff</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            First name
            <input
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Last name (optional)
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
        </div>

        <label className="block text-xs text-slate-400">
          Email (Supabase Auth identity)
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Role
            <select
              required
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            >
              {roles.length === 0 && <option value="">No role available</option>}
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            Outlet
            <select
              required
              value={outletId}
              onChange={(event) => setOutletId(event.target.value)}
              className={`mt-1 ${fieldClass}`}
            >
              {outlets.length === 0 && <option value="">No outlet available</option>}
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id} disabled={!outlet.isActive}>
                  {outlet.name}
                  {outlet.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || roles.length === 0 || outlets.length === 0}
          className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 text-sm font-bold disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Create staff"}
        </button>

        {roles.length === 0 && (
          <p className="text-xs text-amber-300">
            This organization has no tenant role yet, so no staff can be created.
          </p>
        )}
      </form>

      {message && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            message.kind === "ok"
              ? "border-emerald-800 bg-emerald-900/20 text-emerald-200"
              : "border-rose-800 bg-rose-900/20 text-rose-200"
          }`}
        >
          <p>{message.text}</p>
          {warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-amber-200">
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-white">Staff ({initialStaff.length})</h2>

        {initialStaff.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No staff yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {initialStaff.map((staff) => {
              // The role the server assigned, matched against the option list.
              // Zero or several roles => no single current option; the select
              // then shows the current name(s) as a placeholder and any chosen
              // role replaces all of them.
              const currentRoleOption =
                staff.roleNames.length === 1
                  ? roles.find((role) => role.name === staff.roleNames[0])
                  : undefined;

              return (
                <li
                  key={staff.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 px-3 py-2"
                >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">
                    {staff.firstName}
                    {staff.lastName ? ` ${staff.lastName}` : ""}{" "}
                    <span className="text-slate-400">({staff.email})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {staff.roleNames.join(", ") || "no role"} ·{" "}
                    {staff.outletName ?? "no outlet"} ·{" "}
                    <span
                      className={
                        staff.status === "ACTIVE" ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      {staff.status}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Role for ${staff.firstName}`}
                    disabled={changingId === staff.id || roles.length === 0}
                    value={currentRoleOption?.id ?? ""}
                    onChange={(event) => handleChangeRole(staff.id, event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
                  >
                    {!currentRoleOption && (
                      <option value="">{staff.roleNames.join(", ") || "no role"}</option>
                    )}
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={staff.id === viewerId}
                    onClick={() => handleToggleStatus(staff.id, staff.status)}
                    className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-40"
                  >
                    {staff.id === viewerId
                      ? "This is you"
                      : staff.status === "ACTIVE"
                        ? "Deactivate"
                        : "Activate"}
                  </button>
                </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
