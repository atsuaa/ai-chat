import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";

const CLIENT_ID_COOKIE = "client_id";
const CLIENT_ID_MAX_AGE = 60 * 60 * 24 * 365; // 1年間保持(会話データ自体はTTLで24時間後に失効)

export const clientIdMiddleware = createMiddleware<{
  Variables: { clientId: string };
}>(async (c, next) => {
  let clientId = getCookie(c, CLIENT_ID_COOKIE);

  if (!clientId) {
    clientId = crypto.randomUUID();
    setCookie(c, CLIENT_ID_COOKIE, clientId, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: CLIENT_ID_MAX_AGE,
    });
  }

  c.set("clientId", clientId);
  await next();
});
