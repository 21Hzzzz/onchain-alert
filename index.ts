import { loadConfig } from "./src/config.ts";
import { runMonitor } from "./src/monitor.ts";

try {
  const config = await loadConfig();
  await runMonitor(config);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
