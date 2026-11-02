import {
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS,
  DEBUG
} from '../src/services/compilerService.js';

const cCode = `#include <stdio.h>
int main() {
    int a, b;
    printf("Num1:");
    scanf("%d", &a);
    printf("Num2:");
    scanf("%d", &b);
    printf("Sum: %d\\n", a + b);
    return 0;
}`;

async function runTask6Test() {
  console.log("=================================================");
  console.log("TASK 6: Exact Test Flow with Num1: and Num2:");
  console.log("=================================================");

  const prepared = prepareSourceForExecution(CONFIRMED_LANGUAGE_IDS.C, cCode);
  const inputs = [];
  let programOutputShown = "";
  let displayedStdoutLength = 0;
  let runCount = 0;
  let terminalScreen = "";

  const steps = [
    { typeInput: null, description: "Run 1 (initial empty stdin)" },
    { typeInput: "2", description: "Run 2 (after typing 2)" },
    { typeInput: "3", description: "Run 3 (after typing 3)" }
  ];

  for (const step of steps) {
    if (step.typeInput !== null) {
      terminalScreen += step.typeInput + "\n";
      inputs.push(step.typeInput);
    }

    runCount += 1;
    const stdinPayload = inputs.length > 0 ? inputs.join("\n") + "\n" : "";

    const result = await runCode(CONFIRMED_LANGUAGE_IDS.C, prepared, stdinPayload, {
      cpu_time_limit: 2,
      memory_limit: 128000
    });

    const rawStdout = result.stdout || "";
    const normalizedStdout = rawStdout.replace(/\r\n/g, "\n");
    const prevOutput = programOutputShown;

    if (!normalizedStdout.startsWith(prevOutput)) {
      console.error(`DIVERGENCE ERROR on call #${runCount}!`);
      process.exit(1);
    }

    const delta = normalizedStdout.slice(prevOutput.length);
    terminalScreen += delta;
    programOutputShown = normalizedStdout;
    displayedStdoutLength = normalizedStdout.length;

    const { isWaiting } = checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.C, result);

    const logEntry = {
      call: `[Judge0 Call #${runCount}]`,
      language: "C (GCC 9.2.0)",
      stdinSent: stdinPayload,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      exitCode: result.exit_code,
      considered: isWaiting ? "WAITING" : "FINISHED",
      reason: isWaiting ? "__NEED_INPUT__ marker in stderr -> waiting for input" : "Normal exit (status 3: Accepted)",
      programOutputShownBefore: prevOutput,
      programOutputShownAfter: programOutputShown,
      displayedStdoutLength
    };

    console.log(`\n-------------------------------------------------`);
    console.log(`STEP: ${step.description}`);
    console.log(`-------------------------------------------------`);
    console.log(JSON.stringify(logEntry, null, 2));

    if (!isWaiting) {
      const exitCode = result.exit_code !== undefined && result.exit_code !== null ? result.exit_code : 0;
      const timeStr = result.time ? `${result.time} s` : "0.00 s";
      terminalScreen += `\nProcess returned ${exitCode} | time: ${timeStr}\n`;
    }
  }

  console.log(`\n=================================================`);
  console.log(`FINAL TERMINAL SCREEN:`);
  console.log(`=================================================`);
  console.log(terminalScreen.trim());
}

runTask6Test().catch(console.error);
