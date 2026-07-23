"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AccountUser = {
  displayName: string;
  email: string;
};

type AccountSession = {
  status: "loading" | "authenticated" | "anonymous";
  user: AccountUser | null;
};

const AccountSessionContext = createContext<AccountSession>({
  status: "loading",
  user: null,
});

const SIGN_IN_PATH = "/account?mode=login&return_to=%2Fprogress";

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AccountSession>({ status: "loading", user: null });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("account lookup failed");
        return await response.json() as { user: AccountUser | null };
      })
      .then(({ user }) => setSession({
        status: user ? "authenticated" : "anonymous",
        user,
      }))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          setSession({ status: "anonymous", user: null });
        }
      });
    return () => controller.abort();
  }, []);

  const value = useMemo(() => session, [session]);
  return <AccountSessionContext.Provider value={value}>{children}</AccountSessionContext.Provider>;
}

export function useAccountSession() {
  return useContext(AccountSessionContext);
}

export function AccountControls({ mobile = false }: { mobile?: boolean }) {
  const { status, user } = useAccountSession();

  if (status === "loading") {
    return <span className="account-loading" aria-label="正在确认账号状态" />;
  }

  if (!user) {
    return <Link className={mobile ? "button button-primary" : "button button-small"} href={SIGN_IN_PATH}>登录 / 注册</Link>;
  }

  if (mobile) {
    return <>
      <div><b>{user.displayName}</b><small>{user.email}</small></div>
      <form className="account-logout" action="/api/auth/logout" method="post">
        <button className="button button-quiet" type="submit">退出账号</button>
      </form>
    </>;
  }

  return <>
    <span className="account-name" title={user.email}>{user.displayName}</span>
    <form className="account-logout" action="/api/auth/logout" method="post">
      <button className="account-link" type="submit">退出</button>
    </form>
  </>;
}

export function HomeAccountCta() {
  const { status, user } = useAccountSession();
  const loading = status === "loading";

  return <>
    <div className="hero-actions">
      <Link
        className="button button-primary"
        href={user ? "/theory" : "/account?mode=login&return_to=%2Ftheory"}
        aria-disabled={loading}
      >
        {loading ? "正在确认账号…" : user ? "继续理论练习" : "登录并开始练习"}
      </Link>
      <Link className="button button-quiet" href="/practical">浏览实操题库 <span aria-hidden>→</span></Link>
    </div>
    <p className="hero-note">
      {loading
        ? "题库内容已就绪，正在确认学习档案同步状态"
        : user
          ? "已登录 · 作答、评分、收藏与 Notebook 草稿会同步到学习档案"
          : "题目与答案可匿名浏览 · 作答、评分与多设备同步需账号登录"}
    </p>
  </>;
}
