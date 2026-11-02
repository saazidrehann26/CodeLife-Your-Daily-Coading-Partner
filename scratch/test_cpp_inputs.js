import {
  CPP_INSTRUMENTATION_PREAMBLE,
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const cppCode = `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cout << "num1:";
    cin >> a;
    cout << "num2:";
    cin >> b;
    cout << "Sum: " << (a + b) << endl;
    return 0;
}`;

async function runTest() {
  console.log("=== Testing C++ code ===");
  const prepared = prepareSourceForExecution(CONFIRMED_LANGUAGE_IDS.CPP, cppCode);
  
  // Run 1: stdin ""
  console.log("\n--- Run 1 (stdin '') ---");
  const res1 = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, prepared, "");
  console.log("res1 stdout:", JSON.stringify(res1.stdout));
  console.log("res1 stderr:", JSON.stringify(res1.stderr));
  console.log("res1 status:", res1.status);
  console.log("res1 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.CPP, res1));

  // Run 2: stdin "2\n"
  console.log("\n--- Run 2 (stdin '2\\n') ---");
  const res2 = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, prepared, "2\n");
  console.log("res2 stdout:", JSON.stringify(res2.stdout));
  console.log("res2 stderr:", JSON.stringify(res2.stderr));
  console.log("res2 status:", res2.status);
  console.log("res2 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.CPP, res2));

  // Run 3: stdin "2\n3\n"
  console.log("\n--- Run 3 (stdin '2\\n3\\n') ---");
  const res3 = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, prepared, "2\n3\n");
  console.log("res3 stdout:", JSON.stringify(res3.stdout));
  console.log("res3 stderr:", JSON.stringify(res3.stderr));
  console.log("res3 status:", res3.status);
  console.log("res3 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.CPP, res3));
}

runTest().catch(console.error);
