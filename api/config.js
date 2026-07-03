// /api/config.js — Vercel serverless function
// Stores and returns the dashboard's shared config (widgets, mappings, order,
// layout, etc). The frontend GETs on load and POSTs on Save.
//
// STORAGE STRATEGY
// ────────────────
// This template uses Vercel KV (their managed Redis). If you don't want to use
// KV, swap the getStore / setStore calls at the bottom for another backend:
//   - Vercel Blob:    @vercel/blob   (simple JSON blob in object storage)
//   - Google Sheet:   write to a private "config" tab via the Sheets API
//   - Filesystem:     /tmp/config.json (will NOT persist across cold starts —
//                     only OK for local dev)
//
// Setup (Vercel KV):
//   1. In Vercel dashboard → your project → Storage → Create → KV
//   2. Vercel auto-adds KV_REST_API_URL and KV_REST_API_TOKEN env vars
//   3. Install the SDK:  npm i @vercel/kv
//
// ENV VARS
// ────────
// KV_REST_API_URL, KV_REST_API_TOKEN — auto-injected when you link a KV store
// DASHBOARD_TOKEN                    — optional shared secret; if set, requests
//                                       must pass Authorization: Bearer <token>

import { kv } from "@vercel/kv";

const CONFIG_KEY = "dashboard:config";

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

    if (req.method === "GET") {
      const config = await kv.get(CONFIG_KEY);
      return send(res, 200, { config: config || null });
    }

    if (req.method === "POST" || req.method === "PUT") {
      // Body may arrive as a parsed object or a raw string depending on how
      // Vercel's Node runtime handled it. Handle both.
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      if (!body || typeof body !== "object") {
        return send(res, 400, { error: "Body must be a JSON object with a 'config' field" });
      }
      const config = body.config !== undefined ? body.config : body;
      await kv.set(CONFIG_KEY, config);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return send(res, 500, { error: msg });
  }
}
