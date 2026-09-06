export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getAppConfig } = await import("./lib/config");
    getAppConfig();
  }
}
