"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Lock } from "lucide-react";
import { toast } from "sonner";
import { VikingWatcher } from "@/components/watcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { API_ENDPOINTS, SystemRoles } from "@/lib/constants";
import { writeSessionToken } from "@/lib/session";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isTypingPassword, setIsTypingPassword] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem("ov_theme") || "swiss";
    document.documentElement.setAttribute("data-theme", "neo");
    document.documentElement.classList.toggle("theme-swiss", savedTheme === "swiss");
  }, []);

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

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "登录凭证校验未通过");

      writeSessionToken(data.accessToken);
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[var(--bg-base)]">
      {/* 蓝图网格 */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-10" 
        style={{ backgroundImage: "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)", backgroundSize: "32px 32px" }} 
      />

      <div className="absolute top-6 right-6 z-20">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-sm z-10">
        <div key={shakeKey} className="bg-[var(--bg-card)] p-10 relative transition-all duration-500 border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] rounded-none border-dashed animate-auth-shake">
          
          <div className="flex justify-center mb-8 h-20">
            <VikingWatcher isClosed={isTypingPassword} isThinking={loading} size="md" />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-black font-sans tracking-tighter uppercase mb-1 text-black">
              平台管控控制台
            </h2>
            <p className="text-[var(--text-secondary)] text-[10px] font-mono tracking-widest uppercase font-black opacity-60">
              {'// 核心系统最高权限接入'}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-black tracking-widest uppercase">
                管理员用户名 / ACCOUNT
              </label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-4 border-[var(--border-width)] border-[var(--border)] font-mono text-sm font-black bg-[var(--bg-elevated)] outline-none shadow-[var(--shadow-base)] focus:shadow-none transition-all"
                placeholder="请输入用户名"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-black tracking-widest uppercase">身份校验密钥 / SECRET</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onFocus={() => setIsTypingPassword(true)}
                  onBlur={() => setIsTypingPassword(false)}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-4 border-[var(--border-width)] border-[var(--border)] font-mono text-sm font-black bg-[var(--bg-elevated)] outline-none shadow-[var(--shadow-base)] focus:shadow-none transition-all"
                  placeholder="••••••••"
                />
                <Lock className="absolute right-4 top-4 text-black opacity-30" size={18} />
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-black text-white border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] font-black uppercase tracking-[0.3em] hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-30 flex items-center justify-center gap-3"
              >
                <LogIn size={20} strokeWidth={3} />
                验证并进入系统
              </button>
            </div>
          </form>
        </div>
        
        <p className="mt-10 text-center font-mono text-[9px] font-black uppercase text-[var(--text-muted)] tracking-[0.2em] leading-relaxed">
           OpenViking 知识管理平台 v2.3.0<br/>
           致力于企业级高性能知识中台构建
        </p>
      </div>
    </div>
  );
}
