const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { rateLimit } = require("express-rate-limit");
const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use("/internal", (_req, res) =>
  res
    .status(404)
    .json({
      error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta no encontrada" },
    }),
);
app.get("/health", async (_req, res) => {
  let e2eAislado = false;
  if (process.env.NODE_ENV === "test"
      && process.env.E2E_ISOLATED_DATABASE === "true"
      && /^unibe_test(?:_[a-z0-9_]+)?$/.test(process.env.E2E_TEST_DATABASE_PREFIX || "")) {
    const healthChecks = [
      ["IDENTIDAD_URL", "http://identidad:4001"],
      ["ELECCIONES_URL", "http://elecciones:4002"],
      ["VOTACION_URL", "http://votacion:4003"],
      ["RESULTADOS_URL", "http://resultados:4004"],
    ];
    try {
      const results = await Promise.all(healthChecks.map(async ([env, fallback]) => {
        const base = (process.env[env] || fallback).replace(/\/$/, "");
        const response = await fetch(`${base}/health`);
        if (!response.ok) return false;
        const payload = await response.json();
        return payload?.data?.e2eAislado === true;
      }));
      e2eAislado = results.every(Boolean);
    } catch {
      e2eAislado = false;
    }
  }
  res.json({ data: { estado: "ok", servicio: "gateway", e2eAislado } });
});
const limite = (name, fallback) =>
  Math.max(1, Number(process.env[name]) || fallback);
const respuestaLimite = (codigo, mensaje, windowMs) => (req, res) => {
  const resetTime = req.rateLimit?.resetTime;
  const expiresAt = resetTime instanceof Date ? resetTime.getTime() : Date.now() + windowMs;
  const reintentarEnSegundos = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
  res.setHeader("Retry-After", String(reintentarEnSegundos));
  return res.status(429).json({
    error: {
      codigo,
      mensaje,
      detalles: { reintentarEnSegundos },
    },
  });
};
app.use(
  rateLimit({
    windowMs: 60000,
    limit: limite("LIMITE_GENERAL", 300),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    handler: respuestaLimite(
      "DEMASIADAS_PETICIONES",
      "Demasiadas peticiones. Intenta de nuevo más tarde.",
      60000,
    ),
  }),
);
app.use(
  "/api/v1/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limite("LIMITE_LOGIN", 20),
    standardHeaders: true,
    legacyHeaders: false,
    handler: respuestaLimite(
      "DEMASIADOS_INTENTOS",
      "Demasiados intentos fallidos. Por seguridad, intenta de nuevo más tarde.",
      15 * 60 * 1000,
    ),
  }),
);
app.use(
  "/api/v1/auth/solicitudes-recuperacion",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limite("LIMITE_RECUPERACION", 10),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/v1/auth/restablecer-contrasena",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limite("LIMITE_RESTABLECER", 20),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/v1/votacion",
  rateLimit({
    windowMs: 60000,
    limit: limite("LIMITE_VOTACION", 60),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
const targets = [
  ["/api/v1/auth", "IDENTIDAD_URL", "http://identidad:4001"],
  ["/api/v1/usuarios", "IDENTIDAD_URL", "http://identidad:4001"],
  ["/api/v1/admin/solicitudes-recuperacion", "IDENTIDAD_URL", "http://identidad:4001"],
  ["/internal/usuarios", "IDENTIDAD_URL", "http://identidad:4001"],
  ["/api/v1/elecciones", "ELECCIONES_URL", "http://elecciones:4002"],
  ["/internal/elecciones", "ELECCIONES_URL", "http://elecciones:4002"],
  ["/api/v1/votacion", "VOTACION_URL", "http://votacion:4003"],
  ["/internal/votacion", "VOTACION_URL", "http://votacion:4003"],
  ["/api/v1/resultados", "RESULTADOS_URL", "http://resultados:4004"],
];
for (const [prefix, env, fallback] of targets) {
  app.use(
    prefix,
    createProxyMiddleware({
      target: process.env[env] || fallback,
      changeOrigin: true,
      pathRewrite: (path) => `${prefix}${path}`,
      proxyTimeout: 10000,
      on: {
        error: (_err, _req, res) => {
          if (!res.headersSent)
            res.writeHead(503, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: {
                codigo: "SERVICIO_NO_DISPONIBLE",
                mensaje: "El servicio solicitado no está disponible",
              },
            }),
          );
        },
      },
    }),
  );
}
app.use((req, res) =>
  res
    .status(404)
    .json({
      error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta no encontrada" },
    }),
);
app.listen(process.env.PORT || 3000, () => console.log("Gateway listo"));
