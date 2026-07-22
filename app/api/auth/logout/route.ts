import { clearSessionCookie, deleteSession, isSecureRequest } from "@/lib/account-auth";

export async function POST(request: Request) {
  await deleteSession(request.headers.get("cookie"));
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/", request.url).toString(),
      "set-cookie": clearSessionCookie(isSecureRequest(request)),
    },
  });
}
