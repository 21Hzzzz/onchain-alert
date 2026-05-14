export type EnvVars = Record<string, string | undefined>;

export async function loadDotEnvFile(path = ".env"): Promise<EnvVars> {
  let text: string;

  try {
    text = await Bun.file(path).text();
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }

    throw new Error(`Failed to read ${path}: ${formatError(error)}`);
  }

  return parseDotEnv(text);
}

export function parseDotEnv(text: string): EnvVars {
  const env: EnvVars = {};

  text.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      return;
    }

    const normalizedLine = trimmedLine.startsWith("export ")
      ? trimmedLine.slice("export ".length).trim()
      : trimmedLine;
    const equalsIndex = normalizedLine.indexOf("=");

    if (equalsIndex === -1) {
      throw new Error(`.env:${lineNumber}: expected KEY=value`);
    }

    const key = normalizedLine.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`.env:${lineNumber}: invalid environment variable name`);
    }

    env[key] = unquoteValue(normalizedLine.slice(equalsIndex + 1).trim());
  });

  return env;
}

export function mergeEnvFiles(
  fileEnv: EnvVars,
  runtimeEnv: EnvVars,
): EnvVars {
  return {
    ...fileEnv,
    ...runtimeEnv,
  };
}

function unquoteValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("code" in error || "errno" in error) &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
