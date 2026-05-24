/**
 * script.js — Backend Express (Render / local)
 * - Phục vụ file tĩnh (index.html, admin.html...)
 * - API đăng nhập admin + quản lý khách hàng (SQLite)
 * - Giữ API tư vấn công khai: POST /api/consultation
 */
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

const db = require("./database");
const { validateCustomerBody, validateCustomerRequest } = require("./validators");

const app = express();
const PORT = process.env.PORT || 3000;

// Thông tin admin (không đưa ra frontend)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "baohiem@mo";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "shieldcare-bao-hiem-mo-to-session-2026";

const VERCEL_ORIGIN_PATTERN = /^https:\/\/[\w.-]+\.vercel\.app$/;

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.CORS_ALLOW_ALL === "true") return true;
  if (VERCEL_ORIGIN_PATTERN.test(origin)) return true;
  const extra = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

// CORS — cho phép frontend Vercel gọi API (có cookie khi cần)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "1mb" }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// Phục vụ HTML/CSS/JS tĩnh tại thư mục gốc project
app.use(express.static(path.join(__dirname)));

/** Middleware: chỉ admin đã đăng nhập */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, error: "Chưa đăng nhập hoặc phiên hết hạn." });
}

/** Kiểm tra đăng nhập (admin frontend gọi khi load trang) */
app.get("/api/auth/status", (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

/** Đăng nhập admin (nhận field admin hoặc email để tương thích) */
app.post("/login", (req, res) => {
  const adminUser =
    typeof req.body.admin === "string"
      ? req.body.admin.trim()
      : typeof req.body.email === "string"
        ? req.body.email.trim()
        : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!adminUser || !password) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập Admin và mật khẩu." });
  }

  if (adminUser === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: "Đăng nhập thành công." });
  }

  return res.status(401).json({ success: false, error: "Admin hoặc mật khẩu không đúng." });
});

/** Đăng xuất */
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: "Không thể đăng xuất." });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true, message: "Đã đăng xuất." });
  });
});

/** Danh sách khách hàng + lọc + tìm kiếm */
app.get("/customers", requireAuth, async (req, res) => {
  try {
    const filter = req.query.filter || "all";
    const search = req.query.search || "";

    let list = await db.getAllCustomers();
    list = db.attachTrangThai(list);
    list = db.filterByTrangThai(list, filter);
    list = db.filterBySearch(list, search);

    res.json({ success: true, data: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi tải danh sách khách hàng." });
  }
});

/** Thêm khách hàng */
app.post("/customers", requireAuth, async (req, res) => {
  try {
    const { ok, errors, data } = validateCustomerBody(req.body, db.parseDateOnly);
    if (!ok) {
      return res.status(400).json({ success: false, errors });
    }

    const existed = await db.getCustomerByBienSo(data.bienSo);
    if (existed) {
      return res.status(400).json({ success: false, error: "Biển số đã tồn tại." });
    }

    const created = await db.createCustomer(data);
    res.status(201).json({
      success: true,
      data: { ...created, trangThai: db.getTrangThai(created.ngayHetHan) },
    });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return res.status(400).json({ success: false, error: "Biển số đã tồn tại." });
    }
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi thêm khách hàng." });
  }
});

/** Sửa khách hàng */
app.put("/customers/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "ID không hợp lệ." });
    }

    const current = await db.getCustomerById(id);
    if (!current) {
      return res.status(404).json({ success: false, error: "Không tìm thấy khách hàng." });
    }

    const { ok, errors, data } = validateCustomerBody(req.body, db.parseDateOnly);
    if (!ok) {
      return res.status(400).json({ success: false, errors });
    }

    const existed = await db.getCustomerByBienSo(data.bienSo, id);
    if (existed) {
      return res.status(400).json({ success: false, error: "Biển số đã tồn tại." });
    }

    const updated = await db.updateCustomer(id, data);
    res.json({
      success: true,
      data: { ...updated, trangThai: db.getTrangThai(updated.ngayHetHan) },
    });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      return res.status(400).json({ success: false, error: "Biển số đã tồn tại." });
    }
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi cập nhật khách hàng." });
  }
});

/** Xóa khách hàng */
app.delete("/customers/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "ID không hợp lệ." });
    }

    const deleted = await db.deleteCustomer(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Không tìm thấy khách hàng." });
    }

    res.json({ success: true, message: "Đã xóa khách hàng." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi xóa khách hàng." });
  }
});

/** Khách gửi yêu cầu bảo hiểm xe (công khai) */
app.post("/customer-request", async (req, res) => {
  try {
    const { ok, errors, data } = validateCustomerRequest(req.body, db.sanitizeText);
    if (!ok) {
      return res.status(400).json({ success: false, errors });
    }

    const created = await db.createCustomerRequest(data);
    console.log("[customer-request]", created);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Không lưu được yêu cầu." });
  }
});

/** Admin: danh sách yêu cầu khách */
app.get("/customer-requests", requireAuth, async (req, res) => {
  try {
    const statusFilter = req.query.status || "all";
    const search = req.query.search || "";

    let list = await db.getAllCustomerRequests();
    list = db.filterRequestsByStatus(list, statusFilter);
    list = db.filterRequestsBySearch(list, search);

    res.json({ success: true, data: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi tải yêu cầu." });
  }
});

/** Admin: xóa yêu cầu */
app.delete("/customer-requests/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "ID không hợp lệ." });
    }
    const deleted = await db.deleteCustomerRequest(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Không tìm thấy yêu cầu." });
    }
    res.json({ success: true, message: "Đã xóa yêu cầu." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Lỗi khi xóa yêu cầu." });
  }
});

/** Health check */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "shieldcare-api" });
});

// Khởi động server sau khi tạo database
async function startServer() {
  try {
    await db.initDatabase();
    app.listen(PORT, () => {
      console.log(`Server chạy tại http://localhost:${PORT}`);
      console.log(`Trang admin: http://localhost:${PORT}/admin.html`);
    });
  } catch (err) {
    console.error("Không khởi động được server:", err);
    process.exit(1);
  }
}

startServer();
