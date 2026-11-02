import {
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const pyCode = `a = int(input("num1:"))
b = int(input("num2:"))
print(f"Sum: {a + b}")
`;

async function runTest() {
  console.log("=== Testing Python code ===");
  const prepared = prepareSourceForExecution(CONFIRMED_LANGUAGE_IDS.PYTHON, pyCode);
  
  // Run 1: stdin ""
  console.log("\n--- Run 1 (stdin '') ---");
  const res1 = await runCode(CONFIRMED_LANGUAGE_IDS.PYTHON, prepared, "");
  console.log("res1 stdout:", JSON.stringify(res1.stdout));
  console.log("res1 stderr:", JSON.stringify(res1.stderr));
  console.log("res1 status:", res1.status);
  console.log("res1 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.PYTHON, res1));

  // Run 2: stdin "2\n"
  console.log("\n--- Run 2 (stdin '2\\n') ---");
  const res2 = await runCode(CONFIRMED_LANGUAGE_IDS.PYTHON, prepared, "2\n");
  console.log("res2 stdout:", JSON.stringify(res2.stdout));
  console.log("res2 stderr:", JSON.stringify(res2.stderr));
  console.log("res2 status:", res2.status);
  console.log("res2 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.PYTHON, res2));

  // Run 3: stdin "2\n3\n"
  console.log("\n--- Run 3 (stdin '2\\n3\\n') ---");
  const res3 = await runCode(CONFIRMED_LANGUAGE_IDS.PYTHON, prepared, "2\n3\n");
  console.log("res3 stdout:", JSON.stringify(res3.stdout));
  console.log("res3 stderr:", JSON.stringify(res3.stderr));
  console.log("res3 status:", res3.status);
  console.log("res3 waiting:", checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.PYTHON, res3));
}

runTest().catch(console.error);
