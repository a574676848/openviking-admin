"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Share2, Globe, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { VikingWatcher } from "@/components/watcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useApp } from "@/components/app-provider";
import { API_ENDPOINTS, SystemRoles } from "@/lib/constants";
import { buildKnowledgeSiteIndexRoute } from "../console/knowledge-tree/knowledge-tree.constants";
import { getShellButtonClass, getShellTileClass } from "@/components/ui/shell-primitives";

export function resolvePostLoginRoute(
  nextRoute: string | null,
  role: string | undefined,
  mode: "site" | "console" = "console",
): string {
  if (nextRoute && nextRoute.startsWith("/")) {
    return nextRoute;
  }

  if (mode === "site") {
    return buildKnowledgeSiteIndexRoute();
  }

  return role === SystemRoles.SUPER_ADMIN
    ? "/platform/dashboard"
    : "/console/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, setTheme, theme } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tenantCode, setTenantCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [isTypingPassword, setIsTypingPassword] = useState(false);
  const [isTenantValid, setIsTenantValid] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [tenantInfo, setTenantInfo] = useState<{ name: string } | null>(null);
  const [ssoConfigs, setSsoConfigs] = useState<{ oidc: boolean; feishu: boolean; ldap: boolean; dingtalk: boolean }>({ oidc: false, feishu: false, ldap: false, dingtalk: false });
  const nextRoute = searchParams.get("next");
  const loginMode = searchParams.get("mode") === "site" || nextRoute?.startsWith("/site")
    ? "site"
    : "console";
  const loginTitle = tenantInfo?.name || (loginMode === "site" ? "知识空间登录" : "后台管理登录");
  const loginSubtitle =
    loginMode === "site"
      ? "// 进入知识空间与协作站点"
      : "// 进入后台治理与运维控制台";
  
  const isStarry = theme === 'starry';
  const shellTheme = isStarry ? 'starry' : 'neo';

  useEffect(() => {
    const savedTheme = localStorage.getItem("ov_theme");
    setTheme(savedTheme === null ? "starry" : savedTheme === "starry" ? "starry" : "neo");
  }, [setTheme]);

  useEffect(() => {
    const ssoTicket = searchParams.get("sso_ticket");
    if (!ssoTicket) return;
    (async () => {
      try {
        const result = await fetch(API_ENDPOINTS.AUTH.SSO_EXCHANGE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: ssoTicket }),
        });
        const payload = await result.json();
        const data = payload.data ?? payload;
        if (!result.ok) {
          throw new Error(payload.error?.message || payload.message || "SSO 票据交换失败");
        }
        login(data.accessToken, data.user);
        router.replace(resolvePostLoginRoute(nextRoute, data.user?.role, loginMode));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "SSO 登录失败");
      }
    })();
  }, [login, loginMode, nextRoute, router, searchParams]);

  async function checkTenant(code: string) {
    if (code.length < 2) return;
    try {
       const res = await fetch(`${API_ENDPOINTS.TENANTS}/check-auth/${code}`);
       if (res.ok) {
          const config = await res.json();
          setSsoConfigs(config);
          setIsTenantValid(true);
          setTenantInfo({ name: code.toUpperCase() === "OV" ? "OpenViking 总部节点" : "已识别租户授权空间" });
       } else {
          setIsTenantValid(false);
          setSsoConfigs({ oidc: false, feishu: false, ldap: false, dingtalk: false });
       }
    } catch {
       setIsTenantValid(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantCode.trim()) {
      return toast.error("请输入租户唯一标识码");
    }
    setLoading(true);
    const toastId = toast.loading("安全链路握手中...");

    try {
      const loginEndpoint = ssoConfigs.ldap
        ? API_ENDPOINTS.AUTH.SSO_LDAP(tenantCode)
        : API_ENDPOINTS.AUTH.LOGIN;
      const requestBody = ssoConfigs.ldap
        ? { username, password }
        : { username, password, tenantCode };
      const res = await fetch(loginEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = await res.json();
      const data = payload.data ?? payload;
      if (!res.ok) throw new Error(payload.error?.message || payload.message || "登录凭证校验未通过");

      login(data.accessToken, data.user);
      toast.success("身份验证成功，欢迎进入维京知识系统", { id: toastId });
      router.replace(resolvePostLoginRoute(nextRoute, data.user?.role, loginMode));
    } catch (err: unknown) {
      setShakeKey((value) => value + 1);
      toast.error(err instanceof Error ? err.message : "登录失败", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-transparent">
      {/* 极简网格 - 星智流光版 */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.05] theme-neo-only" 
        style={{ 
          backgroundImage: `radial-gradient(var(--brand) 1px, transparent 1px)`, 
          backgroundSize: "24px 24px" 
        }} 
      />

      {/* 粒子流明 - 星空主题版 */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.5] theme-starry-only vector-space-bg" 
        style={{ 
          backgroundImage: `linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)`, 
          backgroundSize: "64px 64px" 
        }} 
      />

      <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-3">
        <ThemeSwitcher align="right" />
        {loginMode === "site" ? (
          <a 
            href="/login" 
            className={getShellButtonClass(shellTheme, 'default', "h-11 px-4 min-w-[120px]")}
          >
            <div className={getShellTileClass(shellTheme, "p-1.5 bg-[var(--brand-muted)] text-[var(--brand)]")}>
              <ShieldCheck size={14} strokeWidth={2.5} />
            </div>
            <span className="text-xs font-bold whitespace-nowrap ml-1">进入后台管理</span>
          </a>
        ) : (
          <a 
            href="/login?mode=site&next=%2Fsite" 
            className={getShellButtonClass(shellTheme, 'default', "h-11 px-4 min-w-[120px]")}
          >
            <div className={getShellTileClass(shellTheme, "p-1.5 bg-[#00F0FF]/20 text-[#00F0FF]")}>
              <Globe size={14} strokeWidth={2.5} />
            </div>
            <span className="text-xs font-bold whitespace-nowrap ml-1">进入知识空间</span>
          </a>
        )}
      </div>

      <div className="w-full max-w-sm z-10">
        <div key={shakeKey} className="bg-[var(--bg-card)] p-10 relative transition-all duration-500 border border-[var(--border)] shadow-xl rounded-[var(--radius-base)] animate-auth-shake">
          
          <div className="flex justify-center mb-8 h-20">
            <VikingWatcher isClosed={isTypingPassword} isThinking={loading} size="md" />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold font-sans tracking-tight mb-2 text-[var(--text-primary)]">
              {loginTitle}
            </h2>
            <p className="text-[var(--text-muted)] text-xs font-medium">
              {loginSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">租户空间标识 (TENANT_CODE)</label>
              <div className="relative">
                <input
                  required
                  value={tenantCode}
                  onChange={(e) => {
                    setTenantCode(e.target.value);
                    if (e.target.value.length >= 2) checkTenant(e.target.value);
                  }}
                  className={`w-full px-4 py-4 border border-[var(--border)] font-sans text-sm font-bold bg-[var(--bg-input)] outline-none rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all ${isTenantValid ? "border-[var(--success)]" : ""}`}
                  placeholder="请输入租户 ID"
                />
                {isTenantValid && <ShieldCheck className="absolute right-4 top-4 text-[var(--success)]" size={18} />}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">
                {ssoConfigs.ldap ? "Windows 域账号 / LDAP ID" : "管理员用户名 / ACCOUNT"}
              </label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-4 border border-[var(--border)] font-sans text-sm font-bold bg-[var(--bg-input)] outline-none rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all"
                placeholder="请输入用户名"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">身份校验密钥 / SECRET</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onFocus={() => setIsTypingPassword(true)}
                  onBlur={() => setIsTypingPassword(false)}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-4 border border-[var(--border)] font-sans text-sm font-bold bg-[var(--bg-input)] outline-none rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-[var(--text-primary)] opacity-30 hover:opacity-60 transition-all focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-[var(--brand)] text-[var(--brand-text)] rounded-[var(--radius-base)] font-bold hover:opacity-90 transition-all disabled:opacity-30 flex items-center justify-center gap-3 shadow-lg shadow-[var(--brand)]/20"
              >
                <LogIn size={20} strokeWidth={2.5} />
                验证并进入系统
              </button>

              {/* SSO 扩展入口 */}
              {isTenantValid && (ssoConfigs.feishu || ssoConfigs.oidc || ssoConfigs.dingtalk) && (
                <div className="relative py-4">
                   <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-[var(--border)]/10"></div></div>
                   <div className="relative flex justify-center text-[9px] font-bold uppercase"><span className="bg-[var(--bg-card)] px-2 text-[var(--text-muted)]">或者使用企业集成登录</span></div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {isTenantValid && ssoConfigs.feishu && (
                  <button 
                    type="button" 
                    onClick={() => window.location.assign(API_ENDPOINTS.AUTH.SSO_REDIRECT(tenantCode, "feishu"))}
                    className="w-full py-4 bg-[#3370FF] text-white border border-transparent rounded-[var(--radius-base)] hover:opacity-90 transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <Share2 size={18} strokeWidth={2.5} /> 飞书扫码一键登录
                  </button>
                )}
                {isTenantValid && ssoConfigs.dingtalk && (
                  <button 
                    type="button" 
                    onClick={() => window.location.assign(API_ENDPOINTS.AUTH.SSO_REDIRECT(tenantCode, "dingtalk"))}
                    className="w-full py-4 bg-[#007FFF] text-white border border-transparent rounded-[var(--radius-base)] hover:opacity-90 transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <LogIn size={18} strokeWidth={2.5} /> 钉钉账号关联登录
                  </button>
                )}
                {isTenantValid && ssoConfigs.oidc && (
                  <button 
                    type="button" 
                    onClick={() => window.location.assign(API_ENDPOINTS.AUTH.SSO_REDIRECT(tenantCode, "oidc"))}
                    className="w-full py-4 bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] rounded-[var(--radius-base)] hover:bg-[var(--bg-base)] transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <Globe size={18} strokeWidth={2.5} /> 企业单点登录 (OIDC)
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
        
        <div className="mt-24 flex flex-col items-center gap-6 opacity-60 hover:opacity-100 transition-all duration-700">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-black tracking-[0.2em] text-[var(--text-primary)] uppercase">OpenViking Admin</span>
              <span className="h-3 w-px bg-[var(--border)]"></span>
              <span className="text-[12px] font-bold text-[var(--text-secondary)]">v2.3.0</span>
            </div>
            <div className="text-[12px] text-[var(--text-secondary)] font-bold tracking-[0.1em]">
              维京企业级高性能知识中台
            </div>
          </div>

          <div className="flex items-center gap-5 text-[11px] font-bold tracking-tight text-[var(--text-muted)]">
            <a 
              href="https://github.com/a574676848/openviking-admin" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[var(--brand)] transition-colors flex items-center gap-1.5"
            >
              代码仓库 (GitHub)
            </a>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]"></span>
            <span className="uppercase">Copyright © 2026 OpenViking Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
