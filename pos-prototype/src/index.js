const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

async function tokenFor(pin, env) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.POS_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = btoa(JSON.stringify({ sub: "staff", exp: Date.now() + 12 * 60 * 60 * 1000 }));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return payload + "." + btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function authorized(request, env) {
  const value = request.headers.get("authorization") || "";
  const [payload, signature] = value.replace(/^Bearer\s+/i, "").split(".");
  if (!payload || !signature) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.POS_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const bytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(payload));
    return valid && JSON.parse(atob(payload)).exp > Date.now();
  } catch { return false; }
}
function safeOrder(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length) throw new Error("An order must contain at least one item.");
  const allowed = ["Dine-in", "Takeout", "Uber Eats"];
  if (!allowed.includes(body.orderType)) throw new Error("Invalid order type.");
  if (body.orderType === "Dine-in" && !Number.isInteger(Number(body.tableNumber))) throw new Error("A table is required for dine-in.");
  const items = body.items.map(x => {
    const quantity = Number(x.quantity), price = Number(x.unitPrice);
    if (!x.name || !["FOOD", "BAR"].includes(x.type) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !Number.isInteger(price) || price < 0 || price > 100000) throw new Error("Invalid order item.");
    return { type: x.type, name: String(x.name).slice(0,120), quantity, unitPrice: price, modifiers: String(x.modifiers || "").slice(0,300), instructions: String(x.instructions || "").slice(0,500) };
  });
  const subtotal = items.reduce((sum, x) => sum + x.quantity * x.unitPrice, 0);
  if (!Number.isSafeInteger(subtotal)) throw new Error("Order total is invalid.");
  return { items, subtotal };
}
export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return json({ ok: true, service: "purpose-pos-test", mode: "test" });
  if (url.pathname === "/api/login" && request.method === "POST") {
    if (!env.POS_STAFF_PIN || !env.POS_SESSION_SECRET) return json({ error: "Staff login is not configured yet." }, 503);
    const body = await request.json().catch(() => ({}));
    if (String(body.pin || "") !== env.POS_STAFF_PIN) return json({ error: "Incorrect staff PIN." }, 401);
    return json({ token: await tokenFor(body.pin, env), expiresIn: 43200 });
  }
  if (url.pathname.startsWith("/api/")) {
    // Test-only Worker: API is intentionally open because the prototype has no PIN login.
    if (!env.DB) return json({ error: "Order database is not configured." }, 503);
    if (url.pathname === "/api/orders" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      let safe;
      try { safe = safeOrder(body); } catch (e) { return json({ error: e.message }, 400); }
      const id = crypto.randomUUID();
      const next = await env.DB.prepare("SELECT COALESCE(MAX(order_number),0)+1 AS n FROM orders").first();
      const orderNumber = Number(next.n);
      const statements = [env.DB.prepare("INSERT INTO orders (id,order_number,order_type,table_number,customer_reference,waiter_name,subtotal_mxn,notes) VALUES (?,?,?,?,?,?,?,?)").bind(id,orderNumber,body.orderType,body.orderType === "Dine-in" ? Number(body.tableNumber) : null,String(body.customerReference || "").slice(0,120),String(body.waiterName || "").slice(0,80),safe.subtotal,String(body.notes || "").slice(0,500))];
      for (const item of safe.items) statements.push(env.DB.prepare("INSERT INTO order_items (order_id,item_type,item_name,quantity,unit_price_mxn,modifiers,special_instructions) VALUES (?,?,?,?,?,?,?)").bind(id,item.type,item.name,item.quantity,item.unitPrice,item.modifiers,item.instructions));
      await env.DB.batch(statements);
      return json({ ok: true, id, orderNumber, subtotalMxn: safe.subtotal }, 201);
    }
    if (url.pathname === "/api/orders" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT id,order_number,order_type,table_number,customer_reference,waiter_name,status,subtotal_mxn,created_at FROM orders ORDER BY created_at DESC LIMIT 100").all();
      return json({ orders: rows.results || [] });
    }
    const statusMatch = url.pathname.match(/^\/api\/orders\/([0-9a-f-]+)\/status$/i);
    if (statusMatch && request.method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const allowed = ["new","preparing","ready","collected","paid","void"];
      if (!allowed.includes(body.status)) return json({ error: "Invalid status." }, 400);
      const result = await env.DB.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?").bind(body.status,statusMatch[1]).run();
      return result.meta.changes ? json({ ok: true }) : json({ error: "Order not found." }, 404);
    }
    return json({ error: "Not found." }, 404);
  }
  return env.ASSETS.fetch(request);
 }
};
