"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Lock, Share2, Globe, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { VikingWatcher } from "@/components/watcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useApp } from "@/components/app-provider";
import { API_ENDPOINTS, SystemRoles } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, setTheme } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantCode, setTenantCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [isTypingPassword, setIsTypingPassword] = useState(false);
  const [isTenantValid, setIsTenantValid] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [tenantInfo, setTenantInfo] = useState<{ name: string } | null>(null);
  const [ssoConfigs, setSsoConfigs] = useState<{ oidc: boolean; feishu: boolean; ldap: boolean; dingtalk: boolean }>({ oidc: false, feishu: false, ldap: false, dingtalk: false });

  useEffect(() => {
    const savedTheme = localStorage.getItem("ov_theme");
    setTheme(savedTheme === null ? "starry" : savedTheme === "starry" ? "starry" : "neo");
  }, [setTheme]);

  useEffect(() => {
    const ssoTicket = searchParams.get("sso_ticket");
    if (!ssoTicket) return;
    (async () => {
      try {
        const result = await fetch(`${API_ENDPOINTS.AUTH.LOGIN}/sso/exchange`, {
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
        router.replace(data.user?.role === SystemRoles.SUPER_ADMIN ? "/platform/dashboard" : "/console/dashboard");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "SSO 登录失败");
      }
    })();
  }, [login, router, searchParams]);

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
      const res = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username, 
          password, 
          tenantCode 
        }),
      });

      const payload = await res.json();
      const data = payload.data ?? payload;
      if (!res.ok) throw new Error(payload.error?.message || payload.message || "登录凭证校验未通过");

      login(data.accessToken, data.user);
      toast.success("身份验证成功，欢迎进入维京知识系统", { id: toastId });
      router.replace(data.user?.role === SystemRoles.SUPER_ADMIN ? "/platform/dashboard" : "/console/dashboard");
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

      <div className="absolute top-6 right-6 z-20">
        <ThemeSwitcher align="right" />
      </div>

      <div className="w-full max-w-sm z-10">
        <div key={shakeKey} className="bg-[var(--bg-card)] p-10 relative transition-all duration-500 border border-[var(--border)] shadow-xl rounded-[var(--radius-base)] animate-auth-shake">
          
          <div className="flex justify-center mb-8 h-20">
            <VikingWatcher isClosed={isTypingPassword} isThinking={loading} size="md" />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold font-sans tracking-tight mb-2 text-[var(--text-primary)]">
              {tenantInfo?.name || "知识空间登录"}
            </h2>
            <p className="text-[var(--text-muted)] text-xs font-medium">
              {'// 企业加密知识通道'}
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
                  type="password"
                  required
                  value={password}
                  onFocus={() => setIsTypingPassword(true)}
                  onBlur={() => setIsTypingPassword(false)}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-4 border border-[var(--border)] font-sans text-sm font-bold bg-[var(--bg-input)] outline-none rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all"
                  placeholder="••••••••"
                />
                <Lock className="absolute right-4 top-4 text-[var(--text-primary)] opacity-30" size={18} />
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
                    onClick={() => window.location.assign(`${API_ENDPOINTS.AUTH.LOGIN}/sso/redirect/${tenantCode}/feishu`)}
                    className="w-full py-4 bg-[#3370FF] text-white border border-transparent rounded-[var(--radius-base)] hover:opacity-90 transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <Share2 size={18} strokeWidth={2.5} /> 飞书扫码一键登录
                  </button>
                )}
                {isTenantValid && ssoConfigs.dingtalk && (
                  <button 
                    type="button" 
                    onClick={() => window.location.assign(`${API_ENDPOINTS.AUTH.LOGIN}/sso/redirect/${tenantCode}/dingtalk`)}
                    className="w-full py-4 bg-[#007FFF] text-white border border-transparent rounded-[var(--radius-base)] hover:opacity-90 transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <LogIn size={18} strokeWidth={2.5} /> 钉钉账号关联登录
                  </button>
                )}
                {isTenantValid && ssoConfigs.oidc && (
                  <button 
                    type="button" 
                    onClick={() => window.location.assign(`${API_ENDPOINTS.AUTH.LOGIN}/sso/redirect/${tenantCode}/oidc`)}
                    className="w-full py-4 bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] rounded-[var(--radius-base)] hover:bg-[var(--bg-base)] transition-all font-bold text-xs flex items-center justify-center gap-3"
                  >
                    <Globe size={18} strokeWidth={2.5} /> 企业单点登录 (OIDC)
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
        
        <p className="mt-10 text-center font-sans text-xs font-medium text-[var(--text-muted)] leading-relaxed">
           OpenViking 知识管理平台 v2.3.0<br/>
           致力于企业级高性能知识中台构建
        </p>
      </div>
    </div>
  );
}
