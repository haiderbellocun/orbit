import type { Response } from "express";
import { ORBIT_SESSION_TTL_SECONDS } from "./sessionPolicy";

export const ORBIT_SESSION_COOKIE = "orbit_session";

type SameSite = "lax" | "strict" | "none";

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function sameSitePolicy(): SameSite {
  const configured = (process.env.SESSION_COOKIE_SAME_SITE ?? "").trim().toLowerCase();
  if (configured === "lax" || configured === "strict" || configured === "none") {
    return configured;
  }
  return isProduction() ? "none" : "lax";
}

export function setOrbitSessionCookie(res: Response, token: string): void {
  const sameSite = sameSitePolicy();
  res.cookie(ORBIT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction() || sameSite === "none",
    sameSite,
    path: "/",
    maxAge: ORBIT_SESSION_TTL_SECONDS * 1000,
  });
}

export function clearOrbitSessionCookie(res: Response): void {
  const sameSite = sameSitePolicy();
  res.clearCookie(ORBIT_SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction() || sameSite === "none",
    sameSite,
    path: "/",
  });
}
