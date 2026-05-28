import mysql from "mysql2/promise";

function mysqlConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    connectTimeout: 8000,
  };
}

/**
 * Espera a que MySQL acepte conexiones (útil tras `docker run` en CI/CD).
 */
export async function waitForMysql({
  maxAttempts = Number(process.env.DB_CONNECT_RETRIES) || 30,
  delayMs = Number(process.env.DB_CONNECT_DELAY_MS) || 2000,
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const conn = await mysql.createConnection(mysqlConfig());
      await conn.ping();
      await conn.end();
      if (attempt > 1) {
        console.log(`[playface-api] MySQL listo (intento ${attempt}/${maxAttempts})`);
      }
      return;
    } catch (err) {
      lastError = err;
      console.warn(
        `[playface-api] MySQL no disponible (${attempt}/${maxAttempts}): ${err.message}`,
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
