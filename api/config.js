// /api/config.js — Vercel serverless function
// Stores and returns the dashboard's shared config (widgets, mappings, order,
// layout, etc.). The frontend GETs on load and POSTs on Save.
//
// STORAGE: Upstash Redis via Vercel Marketplace.
// Setup (one-time per Vercel project):
//   1. In Vercel project → Storage tab → find "Upstash for Redis" → Install
//   2. Create a free Upstash account (or log in), pick free tier, connect to project
//   3. Vercel auto-injects UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
//   4. Redeploy so the new env vars are picked up
//
// ENV VARS (auto-set by Upstash Marketplace integration):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Optional:
//   DASHBOARD_TOKEN — shared secret; if set, requests must pass
//                     Authorization: Bearer <token> OR ?token=<token>

import { Redis } from "@upstash/redis";

const CONFIG_KEY = "dashboard:config";

// Lazily instantiate — env vars must be present at request time, not module load.
let _redis = null;
function getRedis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. " +
      "Install the Upstash for Redis integration from Vercel Marketplace and redeploy."
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

function send(res, status, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(obj));
}

function isAuthorized(req) {
  const required = process.env.DASHBOARD_TOKEN;
  if (!required) return true; // gate disabled
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const queryToken = req.query && req.query.token;
  return bearer === required || queryToken === required;
}

export default async function handler(req, res) {
  try {
    if (!isAuthorized(req)) {
      return send(res, 401, { error: "Unauthorized" });
    }

    const redis = getRedis();

    if (req.method === "GET") {
      const config = await redis.get(CONFIG_KEY);
      return send(res, 200, { config: config || null });
    }

    if (req.method === "POST" || req.method === "PUT") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      if (!body || typeof body !== "object") {
        return send(res, 400, { error: "Body must be a JSON object with a 'config' field" });
      }
      const config = body.config !== undefined ? body.config : body;
      await redis.set(CONFIG_KEY, config);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return send(res, 500, { error: msg });
  }
}
