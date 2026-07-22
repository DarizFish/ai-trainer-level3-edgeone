"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

export default function AccountForm({ initialMode, returnTo }: { initialMode: "login" | "register"; returnTo: string }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (mode === "register" && password !== String(form.get("confirmPassword") || "")) {
      setError("两次输入的密码不一致");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: form.get("displayName"), email: form.get("email"), password }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error || `账号服务暂时不可用（${response.status}）`);
        setBusy(false);
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setError("无法连接账号服务，请检查网络后重试");
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    if (returnTo !== "/") url.searchParams.set("return_to", returnTo);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    window.setTimeout(() => emailRef.current?.focus(), 0);
  }

  return (
    <section className="account-shell">
      <div className="account-intro" aria-live="polite">
        <p className="eyebrow">学习账号</p>
        <h1>{mode === "register" ? "创建你的备考账号" : "继续你的备考进度"}</h1>
        <p>{mode === "register" ? "用一个常用邮箱保存理论作答、错题、收藏、实操评分与 Notebook 草稿。当前版本无需邮箱验证码。" : "登录后可跨设备同步作答、错题、收藏、实操评分与 Notebook 草稿。题目浏览和本机实验仍可匿名使用。"}</p>
        <Link className="text-link" href="/">暂不登录，返回首页</Link>
      </div>
      <div className="account-card">
        <div className="account-tabs" role="tablist" aria-label="账号操作">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
        </div>
        <form className="account-form" onSubmit={submit} key={mode}>
          {mode === "register" && <label>昵称（选填）<input className="field" name="displayName" autoComplete="name" maxLength={60} placeholder="用于学习档案显示" /></label>}
          <label>邮箱<input ref={emailRef} className="field" name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label>密码<input className="field" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} required placeholder={mode === "login" ? "输入密码" : "至少 8 个字符"} /></label>
          {mode === "register" && <label>确认密码<input className="field" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required placeholder="再次输入密码" /></label>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录账号" : "创建账号"}</button>
        </form>
        <p className="account-notice">当前版本不发送邮箱验证码。请确认邮箱拼写正确；暂不支持自助找回密码。</p>
      </div>
    </section>
  );
}
