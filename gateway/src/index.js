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
app.get("/health", (_req, res) =>
  res.json({ data: { estado: "ok", servicio: "gateway" } }),
);
const limite = (name, fallback) =>
  Math.max(1, Number(process.env[name]) || fallback);
app.use(
  rateLimit({
    windowMs: 60000,
    limit: limite("LIMITE_GENERAL", 300),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
  }),
);
app.use(
  "/api/v1/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limite("LIMITE_LOGIN", 20),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/v1/auth/solicitudes-recuperacion",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: limite("LIMITE_RECUPERACION", 60),
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
