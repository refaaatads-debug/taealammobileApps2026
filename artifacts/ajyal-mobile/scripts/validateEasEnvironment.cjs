const REQUIRED_EAS_VARIABLES = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function getMissingEasVariables(environment) {
  return REQUIRED_EAS_VARIABLES.filter((name) => {
    const value = environment[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

if (require.main === module) {
  const missing = getMissingEasVariables(process.env);
  if (missing.length > 0) {
    console.error(
      `[EAS] Missing required build environment variable names: ${missing.join(", ")}. `
      + "Add them to the selected Expo EAS environment (Preview or Production); values are not printed.",
    );
    process.exitCode = 1;
  } else {
    console.log("[EAS] Required Supabase build variables are present.");
  }
}

module.exports = { getMissingEasVariables };
