import axios, { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachSessionRenewal,
  fetchWithSessionRenewal,
  setSessionRenewer,
} from "@/shared/auth/sessionHttp";

const HEADER = "x-session-token";

const storage = new Map<string, string>();

const fakeLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
};

/**
 * Backend falso: responde 200 si `accepts` da por buena la sesión y
 * `failStatus` si no. Apunta la sesión que llegó en cada llamada.
 */
const makeClient = (
  accepts: (session: string) => boolean,
  failStatus = 401,
) => {
  const seen: string[] = [];

  const client = axios.create({
    adapter: async (config) => {
      const session = String(config.headers.get(HEADER) ?? "");
      seen.push(session);

      const response: AxiosResponse = {
        data: "ok",
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };

      if (accepts(session)) return response;

      throw new AxiosError("Rechazada", AxiosError.ERR_BAD_REQUEST, config, null, {
        ...response,
        status: failStatus,
      });
    },
  });

  attachSessionRenewal(client, HEADER);

  return { client, seen };
};

const get = (client: ReturnType<typeof makeClient>["client"], session: string) =>
  client.get("/recurso", { headers: { [HEADER]: session } });

/** Renovación que deja `next` como sesión vigente, como hará la de verdad. */
const renewTo = (next: string, delayMs = 0) =>
  vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    storage.set("sessionId", next);
    return true;
  });

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", fakeLocalStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionRenewer();
});

describe("attachSessionRenewal", () => {
  it("sin forma de renovar, el 401 llega al servicio sin reintentos", async () => {
    storage.set("sessionId", "caducada");
    const { client, seen } = makeClient(() => false);

    await expect(get(client, "caducada")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(seen).toEqual(["caducada"]);
  });

  it("renueva y reintenta con la sesión nueva en la misma cabecera", async () => {
    storage.set("sessionId", "caducada");
    const renew = renewTo("fresca");
    setSessionRenewer(renew);
    const { client, seen } = makeClient((session) => session === "fresca");

    const { data } = await get(client, "caducada");

    expect(data).toBe("ok");
    expect(renew).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["caducada", "fresca"]);
  });

  it("varios 401 a la vez comparten una sola renovación", async () => {
    storage.set("sessionId", "caducada");
    const renew = renewTo("fresca", 10);
    setSessionRenewer(renew);
    const { client } = makeClient((session) => session === "fresca");

    const results = await Promise.all([
      get(client, "caducada"),
      get(client, "caducada"),
      get(client, "caducada"),
    ]);

    expect(results.map(({ data }) => data)).toEqual(["ok", "ok", "ok"]);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("nunca reintenta más de una vez", async () => {
    storage.set("sessionId", "caducada");
    const renew = renewTo("fresca");
    setSessionRenewer(renew);
    const { client, seen } = makeClient(() => false);

    await expect(get(client, "caducada")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["caducada", "fresca"]);
  });

  // Es el caso del login: un 401 ahí es una contraseña equivocada.
  it("no intenta renovar una petición que no llevaba sesión", async () => {
    const renew = renewTo("fresca");
    setSessionRenewer(renew);
    const { client, seen } = makeClient(() => false);

    await expect(get(client, "")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(renew).not.toHaveBeenCalled();
    expect(seen).toEqual([""]);
  });

  it("si la sesión cambió por el camino, reintenta con ella sin renovar", async () => {
    storage.set("sessionId", "vieja");
    const renew = renewTo("fresca");
    setSessionRenewer(renew);
    const { client, seen } = makeClient((session) => {
      // Mientras la petición iba de camino se volvió a entrar en otra pestaña.
      if (session === "vieja") storage.set("sessionId", "nueva");
      return session === "nueva";
    });

    await get(client, "vieja");

    expect(renew).not.toHaveBeenCalled();
    expect(seen).toEqual(["vieja", "nueva"]);
  });

  it("deja pasar sin tocar los errores que no son 401", async () => {
    storage.set("sessionId", "valida");
    const renew = renewTo("fresca");
    setSessionRenewer(renew);
    const { client, seen } = makeClient(() => false, 500);

    await expect(get(client, "valida")).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(renew).not.toHaveBeenCalled();
    expect(seen).toEqual(["valida"]);
  });

  it("una renovación fallida no bloquea la siguiente", async () => {
    storage.set("sessionId", "caducada");
    const renew = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockImplementationOnce(renewTo("fresca"));
    setSessionRenewer(renew);
    const { client } = makeClient((session) => session === "fresca");

    await expect(get(client, "caducada")).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(get(client, "caducada")).resolves.toMatchObject({ data: "ok" });
    expect(renew).toHaveBeenCalledTimes(2);
  });
});

describe("fetchWithSessionRenewal", () => {
  const stubFetch = (accepts: (session: string) => boolean) => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const session = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(null, { status: accepts(session) ? 200 : 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("renueva y reintenta con la sesión nueva, conservando la petición", async () => {
    storage.set("sessionId", "caducada");
    setSessionRenewer(renewTo("fresca"));
    const fetchMock = stubFetch((session) => session === "fresca");

    const response = await fetchWithSessionRenewal("/incidents/7/start", {
      method: "POST",
      headers: { Authorization: "caducada" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, retried] = fetchMock.mock.calls[1];
    expect(url).toBe("/incidents/7/start");
    expect(retried?.method).toBe("POST");
    expect(new Headers(retried?.headers).get("authorization")).toBe("fresca");
  });

  it("sin forma de renovar devuelve el 401 tal cual, para el servicio", async () => {
    storage.set("sessionId", "caducada");
    const fetchMock = stubFetch(() => false);

    const response = await fetchWithSessionRenewal("/incidents/7", {
      headers: { Authorization: "caducada" },
    });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
