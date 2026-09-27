import { errorSummary, isDatabaseUnavailable } from "@/db";
import { recordServerEvent } from "@/lib/analytics-server";

/**
 * 数据库超时/断连时给客户端的统一应答。
 *
 * 必须是 503 而不是 500：连接池是 `max: 1`，一次超时意味着这个函数实例刚把连接
 * 换掉，下一次请求大概率就能成功。500 会让浏览器把它当成缺陷放弃重试，而
 * `TheoryPractice` 的答题同步正是靠 `Retry-After` 决定退避节奏的。
 */
export function databaseUnavailable(operation: string, cause: unknown, message = "数据暂时无法读取，请稍后重试"): Response {
  const code = operation.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  console.error("Database unavailable", { operation, ...errorSummary(cause) });
  recordServerEvent({ event_name: "business.operation_failed", operation, reason_code: isDatabaseUnavailable(cause) ? "database_unavailable" : "internal_error" });
  return Response.json(
    { error: message, code },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } },
  );
}

/**
 * 给路由处理函数套一层：数据库够不着就转成可重试的 503，其余异常原样抛出。
 *
 * 之所以包整个处理函数而不是单个查询，是因为 `requireApiUser()` 自己也要查库
 * （`account.session.lookup`）——只包业务查询的话，会话查询超时仍然漏成 500。
 */
export function withDatabaseErrors<Args extends unknown[]>(
  operation: string,
  handler: (...args: Args) => Promise<Response>,
  message?: string,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (cause) {
      if (!isDatabaseUnavailable(cause)) throw cause;
      return databaseUnavailable(operation, cause, message);
    }
  };
}
