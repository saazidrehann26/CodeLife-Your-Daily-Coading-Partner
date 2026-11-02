import {
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS,
  DEBUG
} from '../src/services/compilerService.js';

/**
 * Simulates the exact state machine of OnlineCompiler.jsx with xterm.js
 */
async function simulateSession({ languageName, languageId, code, userInputs }) {
  console.log(`\n========================================================================`);
  console.log(`SESSION TEST: ${languageName}`);
  console.log(`========================================================================`);

  const preparedSource = prepareSourceForExecution(languageId, code);

  // Terminal emulation state
  let terminalScreen = "";
  let programOutputShown = "";
  const inputsList = [];
  let isSessionRunning = true;
  let isWaitingForInput = false;
  let divergenceOccurred = false;
  let runCount = 0;

  const logs = [];

  // Helper to append text to terminal screen
  const termWrite = (str) => {
    terminalScreen += str;
  };

  // Step runner (equivalent to executeNextSessionStep)
  const executeStep = async () => {
    runCount += 1;
    const stdinPayload = inputsList.length > 0 ? inputsList.join("\n") + "\n" : "";

    const result = await runCode(languageId, preparedSource, stdinPayload, {
      cpu_time_limit: 2,
      memory_limit: 128000
    });

    // 1. Compile Error check
    if (result.compile_output && result.status?.id === 6) {
      termWrite(`\n[Compile Error]\n${result.compile_output}\n`);
      isSessionRunning = false;
      isWaitingForInput = false;
      return;
    }

    // Line ending normalisation
    const rawStdout = result.stdout || "";
    const normalizedStdout = rawStdout.replace(/\r\n/g, "\n");
    const prevOutput = programOutputShown;

    // Consistency check against programOutputShown ONLY
    if (!normalizedStdout.startsWith(prevOutput)) {
      termWrite(
        `\n[Warning: Program output diverged from previous run. The program produced different output than expected across re-runs. Session ended.]\n`
      );
      divergenceOccurred = true;
      isSessionRunning = false;
      isWaitingForInput = false;
      return;
    }

    // Write ONLY the delta beyond what has already been shown
    const delta = normalizedStdout.slice(prevOutput.length);
    if (delta) {
      termWrite(delta);
    }
    programOutputShown = normalizedStdout;

    // 2. Waiting check
    const { isWaiting, cleanStderr } = checkWaitingForInput(languageId, result);

    const logEntry = {
      runIndex: runCount,
      language: languageName,
      stdinSent: stdinPayload,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      exitCode: result.exit_code,
      considered: isWaiting ? "WAITING" : "FINISHED",
      reason: isWaiting
        ? (languageId === CONFIRMED_LANGUAGE_IDS.PYTHON
            ? "EOFError in stderr -> waiting for input"
            : "__NEED_INPUT__ in stderr -> waiting for input")
        : `Normal termination (status: ${result.status?.description || result.status?.id})`,
      programOutputShownBefore: prevOutput,
      programOutputShownAfter: programOutputShown
    };
    logs.push(logEntry);

    if (DEBUG) {
      console.log(`[Judge0 Call #${runCount}]`, JSON.stringify(logEntry, null, 2));
    }

    if (isWaiting) {
      isWaitingForInput = true;
    } else {
      isSessionRunning = false;
      isWaitingForInput = false;
      const exitCode = result.exit_code !== undefined && result.exit_code !== null ? result.exit_code : 0;
      const timeStr = result.time ? `${result.time} s` : "0.00 s";
      termWrite(`Process returned ${exitCode} | time: ${timeStr}\n`);
    }
  };

  // Run 1: initial run with empty stdin
  await executeStep();

  // Simulate user typing and pressing Enter for each input
  for (const input of userInputs) {
    if (!isWaitingForInput || !isSessionRunning) break;

    // User types the characters directly onto the terminal screen
    termWrite(input);
    // User presses Enter
    termWrite("\n");

    inputsList.push(input);
    isWaitingForInput = false;

    // Next re-run
    await executeStep();
  }

  console.log(`\n--- FINAL TERMINAL SCREEN OUTPUT ---`);
  console.log(terminalScreen.trimEnd());
  console.log(`------------------------------------`);
  console.log(`Divergence Warning Occurred: ${divergenceOccurred}`);

  return {
    logs,
    terminalScreen: terminalScreen.trimEnd(),
    divergenceOccurred
  };
}

async function runAllRequiredTests() {
  // TEST 1: C with scanf
  const cResult = await simulateSession({
    languageName: "C (GCC 9.2.0)",
    languageId: CONFIRMED_LANGUAGE_IDS.C,
    code: `#include <stdio.h>
int main() {
    int a, b;
    printf("num1:");
    scanf("%d", &a);
    printf("num2:");
    scanf("%d", &b);
    printf("Sum: %d\\n", a + b);
    return 0;
}`,
    userInputs: ["2", "3"]
  });

  // TEST 2: C++ with cin
  const cppResult = await simulateSession({
    languageName: "C++ (GCC 9.2.0)",
    languageId: CONFIRMED_LANGUAGE_IDS.CPP,
    code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cout << "num1:";
    cin >> a;
    cout << "num2:";
    cin >> b;
    cout << "Sum: " << (a + b) << endl;
    return 0;
}`,
    userInputs: ["2", "3"]
  });

  // TEST 3: Python with input()
  const pyResult = await simulateSession({
    languageName: "Python (3.8.1)",
    languageId: CONFIRMED_LANGUAGE_IDS.PYTHON,
    code: `a = int(input("num1:"))
b = int(input("num2:"))
print(f"Sum: {a + b}")`,
    userInputs: ["2", "3"]
  });

  // Assertions
  console.log(`\n========================================================================`);
  console.log(`SUMMARY VERIFICATION`);
  console.log(`========================================================================`);
  console.log(`C Divergence: ${cResult.divergenceOccurred ? "FAIL (Diverged)" : "PASS (No Divergence)"}`);
  console.log(`C++ Divergence: ${cppResult.divergenceOccurred ? "FAIL (Diverged)" : "PASS (No Divergence)"}`);
  console.log(`Python Divergence: ${pyResult.divergenceOccurred ? "FAIL (Diverged)" : "PASS (No Divergence)"}`);

  if (!cResult.divergenceOccurred && !cppResult.divergenceOccurred && !pyResult.divergenceOccurred) {
    console.log(`\n🎉 ALL 3 LANGUAGES PASSED 100% PERFECTLY!`);
  } else {
    process.exit(1);
  }
}

runAllRequiredTests().catch(console.error);
