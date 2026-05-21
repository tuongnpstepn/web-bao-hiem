/**
 * Backend Node.js thuần (http) — deploy Render
 * API: POST /api/consultation
 */
const http = require("http");

const PORT = process.env.PORT || 3000;
const MAX_BODY_BYTES = 1e6;

// CORS: cho phép frontend Vercel (*.vercel.app) và tùy chọn qua biến môi trường
const VERCEL_ORIGIN_PATTERN = /^https:\/\/[\w.-]+\.vercel\.app$/;

function getExtraAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.CORS_ALLOW_ALL === "true") return true;
  if (VERCEL_ORIGIN_PATTERN.test(origin)) return true;
  return getExtraAllowedOrigins().includes(origin);
}

/** Middleware CORS — gắn header trước mọi phản hồi */
function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowOrigin =
    origin && isOriginAllowed(origin) ? origin : "*";

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  return headers;
}

function sendJson(req, res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...applyCors(req, res),
  });
  res.end(JSON.stringify(data));
}

function getPathname(url) {
  if (!url) return "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Payload quá lớn"));
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON không hợp lệ"));
      }
    });

    req.on("error", reject);
  });
}

function validateConsultation(data) {
  const errors = [];
  const fullName =
    typeof data.fullName === "string" ? data.fullName.trim() : "";
  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const insuranceType =
    typeof data.insuranceType === "string" ? data.insuranceType.trim() : "";

  if (!fullName) errors.push("fullName là bắt buộc");
  if (!phone) errors.push("phone là bắt buộc");
  if (!email) errors.push("email là bắt buộc");
  if (!insuranceType) errors.push("insuranceType là bắt buộc");

  const allowed = ["car", "health", "home"];
  if (insuranceType && !allowed.includes(insuranceType)) {
    errors.push("insuranceType không hợp lệ");
  }

  return {
    ok: errors.length === 0,
    errors,
    payload: { fullName, phone, email, insuranceType },
  };
}

const server = http.createServer(async (req, res) => {
  const pathname = getPathname(req.url);

  try {
    // Preflight CORS (trình duyệt từ Vercel gọi POST cross-origin)
    if (req.method === "OPTIONS") {
      res.writeHead(204, applyCors(req, res));
      return res.end();
    }

    // Health check cho Render
    if (req.method === "GET" && (pathname === "/" || pathname === "/api/health")) {
      return sendJson(req, res, 200, { ok: true, service: "shieldcare-api" });
    }

    if (req.method === "POST" && pathname === "/api/consultation") {
      let data;
      try {
        data = await readJsonBody(req);
      } catch (err) {
        const msg = err.message === "Payload quá lớn" ? err.message : "Dữ liệu JSON không hợp lệ";
        return sendJson(req, res, 400, { success: false, error: msg });
      }

      const { ok, errors, payload } = validateConsultation(data);
      if (!ok) {
        return sendJson(req, res, 400, { success: false, errors });
      }

      console.log("[consultation]", new Date().toISOString(), payload);
      return sendJson(req, res, 200, { success: true });
    }

    return sendJson(req, res, 404, { success: false, error: "Không tìm thấy API" });
  } catch (err) {
    console.error("[server-error]", err);
    if (!res.headersSent) {
      sendJson(req, res, 500, { success: false, error: "Lỗi máy chủ nội bộ" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server chạy tại cổng ${PORT}`);
});
