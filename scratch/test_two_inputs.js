import {
  C_INSTRUMENTATION_PREAMBLE,
  CPP_INSTRUMENTATION_PREAMBLE,
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const cCode = `#include <stdio.h>
int main() {
    int a, b;
    printf("num1:");
    scanf("%d", &a);
    printf("num2:");
    scanf("%d", &b);
    printf("Sum: %d\\n", a + b);
    return 0;
}`;

async function runTest() {
  console.log("=== Testing C code ===");
  const prepared = prepareSourceForExecution(CONFIRMED_LANGUAGE_IDS.C, cCode);
  
  // Run 1: stdin ""
  console.log("\n--- Run 1 (stdin '') ---");
  const res1 = await runCode(CONFIRMED_LANGUAGE_IDS.C, prepared, "");
  console.log("res1 stdout:", JSON.stringify(res1.stdout));
  console.log("res1 stderr:", JSON.stringify(res1.stderr));
  console.log("res1 status:", res1.status);
  console.log("res1 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.C, res1));

  // Run 2: stdin "2\n"
  console.log("\n--- Run 2 (stdin '2\\n') ---");
  const res2 = await runCode(CONFIRMED_LANGUAGE_IDS.C, prepared, "2\n");
  console.log("res2 stdout:", JSON.stringify(res2.stdout));
  console.log("res2 stderr:", JSON.stringify(res2.stderr));
  console.log("res2 status:", res2.status);
  console.log("res2 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.C, res2));

  // Run 3: stdin "2\n3\n"
  console.log("\n--- Run 3 (stdin '2\\n3\\n') ---");
  const res3 = await runCode(CONFIRMED_LANGUAGE_IDS.C, prepared, "2\n3\n");
  console.log("res3 stdout:", JSON.stringify(res3.stdout));
  console.log("res3 stderr:", JSON.stringify(res3.stderr));
  console.log("res3 status:", res3.status);
  console.log("res3 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.C, res3));
}

runTest().catch(console.error);
