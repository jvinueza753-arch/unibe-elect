const fs = require("node:fs");
const path = require("node:path");
const { generateKeyPairSync } = require("node:crypto");
const priv = process.env.JWT_PRIVATE_KEY_PATH || "/keys/private/private.pem";
const pub = process.env.JWT_PUBLIC_KEY_PATH || "/keys/public/public.pem";
fs.mkdirSync(path.dirname(priv), { recursive: true });
fs.mkdirSync(path.dirname(pub), { recursive: true });
if (fs.existsSync(priv) && fs.existsSync(pub)) {
  console.log("Claves JWT existentes; no se regeneran.");
  process.exit(0);
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
fs.writeFileSync(priv, privateKey, { mode: 0o600 });
fs.writeFileSync(pub, publicKey, { mode: 0o644 });
console.log("Claves JWT generadas.");
