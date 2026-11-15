export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "purpose-pos-test", mode: "prototype" });
    }
    return env.ASSETS.fetch(request);
  }
};