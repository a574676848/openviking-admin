"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Lock } from "lucide-react";
import { toast } from "sonner";
import { VikingWatcher } from "@/components/watcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useApp } from "@/components/app-provider";
import { API_ENDPOINTS, SystemRoles } from "@/lib/constants";
import {
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPanel,
} from "@/components/ui/platform-primitives";

export default function PlatformLoginPage() {
  const router = useRouter();
  const { login, setTheme } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTypingPassword, setIsTypingPassword] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem("ov_theme");
    setTheme(savedTheme === null ? "starry" : savedTheme === "starry" ? "starry" : "neo");
  }, [setTheme]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const toastId = toast.loading("安全链路握手中...");

    try {
      const res = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username, 
          password
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
        <PlatformPanel
          key={shakeKey}
          className="relative rounded-[var(--radius-base)] border border-[var(--border)] p-10 shadow-xl transition-all duration-500 animate-auth-shake"
        >
          
          <div className="flex justify-center mb-8 h-20">
            <VikingWatcher isClosed={isTypingPassword} isThinking={loading} size="md" />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold font-sans tracking-tight mb-2 text-[var(--text-primary)]">
              平台管控控制台
            </h2>
            <p className="text-[var(--text-muted)] text-xs font-medium">
              {'// 核心系统最高权限接入'}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <PlatformField label="管理员用户名 / ACCOUNT" className="space-y-2">
              <PlatformInput
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--bg-elevated)] px-4 py-4 text-sm font-bold rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all"
                placeholder="请输入用户名"
              />
            </PlatformField>

            <PlatformField label="身份校验密钥 / SECRET" className="space-y-2">
              <div className="relative">
                <PlatformInput
                  type="password"
                  required
                  value={password}
                  onFocus={() => setIsTypingPassword(true)}
                  onBlur={() => setIsTypingPassword(false)}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--bg-elevated)] px-4 py-4 text-sm font-bold rounded-[var(--radius-base)] focus:ring-2 focus:ring-[var(--brand)] transition-all"
                  placeholder="••••••••"
                />
                <Lock className="absolute right-4 top-4 text-black opacity-30" size={18} />
              </div>
            </PlatformField>

            <div className="pt-4 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-[var(--brand)] text-[var(--brand-text)] rounded-[var(--radius-base)] font-bold hover:opacity-90 transition-all disabled:opacity-30 flex items-center justify-center gap-3 shadow-lg shadow-[var(--brand)]/20"
              >
                <LogIn size={20} strokeWidth={2.5} />
                验证并进入系统
              </button>
            </div>
          </form>
        </PlatformPanel>
        
        <p className="mt-10 text-center font-sans text-xs font-medium text-[var(--text-muted)] leading-relaxed">
           OpenViking 知识管理平台 v2.3.0<br/>
           致力于企业级高性能知识中台构建
        </p>
      </div>
    </div>
  );
}
