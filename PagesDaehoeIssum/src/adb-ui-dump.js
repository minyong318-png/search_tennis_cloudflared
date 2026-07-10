export async function readFreshUiValues({
  runAdb,
  decode,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  retries = 3,
  remotePath = "/sdcard/tt-window.xml"
}) {
  let lastError = new Error("ADB UI dump returned no values");
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await runAdb("shell", "rm", "-f", remotePath);
      await runAdb("shell", "timeout", "12", "uiautomator", "dump", remotePath);
      const { stdout } = await runAdb("exec-out", "cat", remotePath);
      const values = decode(stdout);
      if (values.length) return values;
      lastError = new Error("ADB UI dump returned no values");
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await wait(800);
  }
  throw lastError;
}
