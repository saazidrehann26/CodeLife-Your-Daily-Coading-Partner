import {
  CPP_INSTRUMENTATION_PREAMBLE,
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

async function testCase(name, code, stdinSteps) {
  console.log(`\n=========================================`);
  console.log(`TEST: ${name}`);
  const prepared = prepareSourceForExecution(CONFIRMED_LANGUAGE_IDS.CPP, code);

  let currentStdin = "";
  for (let step = 0; step < stdinSteps.length; step++) {
    currentStdin = stdinSteps[step];
    console.log(`\n--- Step ${step + 1} (stdin: ${JSON.stringify(currentStdin)}) ---`);
    const res = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, prepared, currentStdin);
    const waiting = checkWaitingForInput(CONFIRMED_LANGUAGE_IDS.CPP, res);
    console.log(`stdout: ${JSON.stringify(res.stdout)}`);
    console.log(`stderr: ${JSON.stringify(res.stderr)}`);
    console.log(`exit_code: ${res.exit_code}, status: ${res.status?.id} (${res.status?.description})`);
    console.log(`isWaiting: ${waiting.isWaiting}`);
  }
}

async function main() {
  // Test 1: cin >> a and cin >> b
  await testCase(
    "cin >> a then cin >> b",
    `#include <iostream>
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
    ["", "2\n", "2\n3\n"]
  );

  // Test 2: getline(cin, str)
  await testCase(
    "getline(cin, str)",
    `#include <iostream>
#include <string>
using namespace std;
int main() {
    string s1, s2;
    cout << "Enter line 1: ";
    getline(cin, s1);
    cout << "Enter line 2: ";
    getline(cin, s2);
    cout << "Lines: " << s1 << " & " << s2 << endl;
    return 0;
}`,
    ["", "hello\n", "hello\nworld\n"]
  );

  // Test 3: cin.get()
  await testCase(
    "cin.get()",
    `#include <iostream>
using namespace std;
int main() {
    cout << "Char 1: ";
    char c1 = cin.get();
    cout << "Char 2: ";
    char c2 = cin.get();
    cout << "Got: " << c1 << " and " << c2 << endl;
    return 0;
}`,
    ["", "x", "xy"]
  );
}

main().catch(console.error);
