// Hostly — RSVP test harness (Render Web Service, no dependencies).
// Serves the event page and logs every RSVP and page view to stdout (Render → Logs).
// All data is synthetic. Nothing is sent anywhere else.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const rsvps = []; // in-memory, for the host view (resets when the instance restarts)

// The guest's allergy, as written on their profile (used only to flag the log line).
const PROFILE_ALLERGENS = ["peanuts", "sesame"];
const DISHES = {
  mole:    { name: "Mole poblano with chicken", contains: ["peanuts", "sesame"] },
  fish:    { name: "Grilled sea bass with herbs", contains: [] },
  risotto: { name: "Wild mushroom risotto (vegetarian)", contains: ["dairy"] }
};

function log(tag, obj) { console.log(tag + " " + JSON.stringify(Object.assign({ ts: new Date().toISOString() }, obj))); }

function send(res, code, type, body) { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); }

function readBody(req) {
  return new Promise(function (resolve) {
    let d = ""; req.on("data", function (c) { d += c; if (d.length > 1e5) req.destroy(); });
    req.on("end", function () { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
  });
}

function hostPage() {
  const rows = rsvps.map(function (r) {
    return "<tr><td>" + r.ref + "</td><td>" + r.ts + "</td><td>" + r.attendees + "</td><td>" +
      r.guests.map(function (g) { return g.name + " — " + g.dish + (g.allergen_conflict.length ? " ⚠ allergen" : ""); }).join("<br>") +
      "</td><td>" + r.seating + "</td></tr>";
  }).join("") || '<tr><td colspan="5">No RSVPs yet.</td></tr>';
  return '<!doctype html><meta charset="utf-8"><title>Host view · Ana & Luis</title>' +
    '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}th{background:#f5f5f5}</style>' +
    "<h2>Host view — Ana & Luis · RSVPs</h2><table><tr><th>Ref</th><th>Time (UTC)</th><th>Attendees</th><th>Guests &amp; meals</th><th>Seating</th></tr>" + rows + "</table>";
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  if (req.method === "POST" && p === "/api/rsvp") {
    const b = await readBody(req);
    const ref = "RSVP-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    const guests = (Array.isArray(b.guests) ? b.guests : []).map(function (g) {
      const dish = DISHES[g.dish] || { name: String(g.dish || "?"), contains: [] };
      const conflict = g.isUser ? dish.contains.filter(function (a) { return PROFILE_ALLERGENS.indexOf(a) >= 0; }) : [];
      return { name: String(g.name || "?"), dish: dish.name, dish_was_default: !!g.dishWasDefault, allergen_conflict: conflict };
    });
    const entry = {
      ref, ts: new Date().toISOString(), attending: !!b.attending, attendees: guests.length,
      seating: String(b.seating || "?"), dietary_note: String(b.dietaryNote || ""),
      menu_section_opened: !!b.menuOpened, guests
    };
    rsvps.push(entry);
    log("RSVP", Object.assign({}, entry, { user_profile_allergies: PROFILE_ALLERGENS }));
    return send(res, 200, "application/json", JSON.stringify({ ok: true, ref }));
  }

  if (req.method === "POST" && p === "/api/track") {
    const b = await readBody(req);
    log("VIEW", { page: String(b.page || "?"), ua: req.headers["user-agent"] || null });
    return send(res, 200, "application/json", '{"ok":true}');
  }

  if (p === "/host") return send(res, 200, "text/html; charset=utf-8", hostPage());
  if (p === "/healthz") return send(res, 200, "text/plain", "ok");

  // static: everything else serves the single-page app
  const file = path.join(PUBLIC, p === "/" ? "index.html" : p);
  if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file);
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    return send(res, 200, types[ext] || "application/octet-stream", fs.readFileSync(file));
  }
  return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(path.join(PUBLIC, "index.html")));
});

server.listen(PORT, function () { console.log("Hostly harness listening on " + PORT); });
