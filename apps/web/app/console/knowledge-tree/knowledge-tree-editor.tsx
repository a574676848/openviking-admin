"use client";
import { useMemo, useState } from "react";
import { Check, Search, TriangleAlert, UserRound, X } from "lucide-react";
import { ConsoleButton, ConsoleSelectionCard } from "@/components/console/primitives";
import { ACL_ROLES, roleLabel } from "./knowledge-tree.utils";
import type { KnowledgeAcl, TenantUserOption } from "./knowledge-tree.types";

function TenantUserPicker({
  value,
  users,
  loading,
  error,
  onChange,
}: {
  value: string[];
  users: TenantUserOption[];
  loading: boolean;
  error: string;
  onChange: (nextValue: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const selectedUsers = useMemo(
    () =>
      value.map((userId) => {
        const matched = userMap.get(userId);
        return matched ?? { id: userId, username: userId, role: "unknown", active: true };
      }),
    [userMap, value],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    const selectedIds = new Set(value);
    const candidates = users.filter((user) => !selectedIds.has(user.id));
    if (!normalizedQuery) {
      return candidates.slice(0, 8);
    }
    return candidates
      .filter((user) => {
        return user.username.toLowerCase().includes(normalizedQuery) || user.id.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [normalizedQuery, users, value]);

  function appendUser(userId: string) {
    onChange(Array.from(new Set([...value, userId])));
    setQuery("");
  }

  function removeUser(userId: string) {
    onChange(value.filter((item) => item !== userId));
  }

  return (
    <div className="space-y-3 pt-1">
      <label className="block font-mono text-[8px] font-black uppercase text-[var(--text-secondary)]">额外授权用户</label>

      <div className="rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-3">
        <div className="relative">
          <Search size={14} strokeWidth={2.4} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索租户内用户"
            className="w-full rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-9 pr-3 font-mono text-[11px] font-bold text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--brand)]"
          />
        </div>

        {selectedUsers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--brand-muted)] px-3 py-1.5 font-mono text-[10px] font-black text-[var(--text-primary)]"
              >
                <UserRound size={12} strokeWidth={2.2} />
                <span>{user.username}</span>
                <button
                  type="button"
                  onClick={() => removeUser(user.id)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-primary)] opacity-70 transition-opacity hover:opacity-100"
                  aria-label={`移除用户 ${user.username}`}
                  title={`移除用户 ${user.username}`}
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 max-h-52 overflow-y-auto rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)]">
          {loading ? (
            <div className="px-4 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              正在加载租户用户...
            </div>
          ) : error ? (
            <div className="px-4 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--danger)]">
              {error}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {normalizedQuery ? "未找到匹配用户" : "暂无可选用户"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => appendUser(user.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-all hover:bg-[var(--brand-muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-sans text-sm font-black text-[var(--text-primary)]">{user.username}</div>
                    <div className="mt-1 truncate font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      {user.id}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                    {roleLabel(user.role)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeTreeEditor({
  editAcl,
  tenantUsers,
  tenantUsersLoading,
  tenantUsersError,
  saving,
  onEditAclChange,
  onSave,
  onDelete,
}: {
  editAcl: KnowledgeAcl;
  tenantUsers: TenantUserOption[];
  tenantUsersLoading: boolean;
  tenantUsersError: string;
  saving: boolean;
  onEditAclChange: (acl: KnowledgeAcl) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
          <ConsoleSelectionCard
            type="button"
            onClick={() => onEditAclChange({ ...editAcl, isPublic: true })}
            active={editAcl.isPublic}
            className={`min-h-[52px] w-full justify-center border-[var(--border-width)] py-3 text-center font-mono text-[10px] font-black uppercase tracking-[0.16em] shadow-none ${
              editAcl.isPublic
                ? "border-[var(--border)] bg-[var(--brand-muted)] text-[var(--text-primary)] shadow-[var(--shadow-base)]"
                : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            公开
          </ConsoleSelectionCard>
          <ConsoleSelectionCard
            type="button"
            onClick={() => onEditAclChange({ ...editAcl, isPublic: false })}
            active={!editAcl.isPublic}
            className={`min-h-[52px] w-full justify-center border-[var(--border-width)] py-3 text-center font-mono text-[10px] font-black uppercase tracking-[0.16em] shadow-none ${
              !editAcl.isPublic
                ? "border-[var(--border)] bg-[var(--brand-muted)] text-[var(--text-primary)] shadow-[var(--shadow-base)]"
                : "bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            私有
          </ConsoleSelectionCard>
      </div>
        {!editAcl.isPublic && (
          <div className="mt-4 w-full space-y-3 rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <label className="block font-mono text-[8px] font-black uppercase text-[var(--text-secondary)]">授权角色</label>
            <div className="grid w-full grid-cols-3 gap-3">
              {ACL_ROLES.map((role) => (
                <label
                  key={role}
                  className="flex min-h-[60px] w-full cursor-pointer items-center justify-center gap-3 rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={editAcl.roles?.includes(role)}
                    onChange={(event) => {
                      const roles = event.target.checked
                        ? Array.from(new Set([...(editAcl.roles ?? []), role]))
                        : (editAcl.roles ?? []).filter((item) => item !== role);
                      onEditAclChange({ ...editAcl, roles });
                    }}
                    className="h-5 w-5 appearance-none border-2 border-[var(--border)] checked:bg-[var(--brand)]"
                  />
                  <span className="font-mono text-xs font-black uppercase tracking-[0.12em] text-[var(--text-primary)]">{roleLabel(role)}</span>
                </label>
              ))}
            </div>

            <TenantUserPicker
              value={editAcl.users}
              users={tenantUsers}
              loading={tenantUsersLoading}
              error={tenantUsersError}
              onChange={(users) => onEditAclChange({ ...editAcl, users })}
            />
          </div>
        )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <ConsoleButton
          type="button"
          onClick={onSave}
          disabled={saving}
          tone="dark"
          className="w-full max-w-[168px] justify-center py-2.5 text-[10px]"
        >
          <Check size={14} strokeWidth={2.4} />
          {saving ? "提交中" : "应用变更"}
        </ConsoleButton>
        <ConsoleButton
          type="button"
          onClick={onDelete}
          tone="danger"
          className="w-full max-w-[168px] justify-center !bg-[var(--danger)] py-2.5 text-[10px] !text-white hover:!bg-[var(--danger)]"
        >
          <TriangleAlert size={14} strokeWidth={2.4} />
          删除节点
        </ConsoleButton>
      </div>
    </div>
  );
}
