import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    })
  : null;

if (redis) {
  redis.on("connect", () => {
    console.log("✅ Redis conectado");
  });

  redis.on("error", (error) => {
    console.error("❌ Redis error:", error.message);
  });
} else {
  console.warn("⚠️ REDIS_URL no configurado. Rate limit usará memoria.");
}