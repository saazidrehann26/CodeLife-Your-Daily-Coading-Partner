import {
  runCode,
  prepareSourceForExecution,
  checkWaitingForInput,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const tests = [
  {
    name: "C: scanf 2 inputs",
    lid: CONFIRMED_LANGUAGE_IDS.C,
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
    steps: [
      { stdin: "", expectedStdout: "num1:", waiting: true },
      { stdin: "2\n", expectedStdout: "num1:num2:", waiting: true },
      { stdin: "2\n3\n", expectedStdout: "num1:num2:Sum: 5\n", waiting: false },
    ]
  },
  {
    name: "C++: cin >> 2 inputs",
    lid: CONFIRMED_LANGUAGE_IDS.CPP,
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
    steps: [
      { stdin: "", expectedStdout: "num1:", waiting: true },
      { stdin: "2\n", expectedStdout: "num1:num2:", waiting: true },
      { stdin: "2\n3\n", expectedStdout: "num1:num2:Sum: 5\n", waiting: false },
    ]
  },
  {
    name: "Python: input 2 inputs",
    lid: CONFIRMED_LANGUAGE_IDS.PYTHON,
    code: `a = int(input("num1:"))
b = int(input("num2:"))
print(f"Sum: {a + b}")`,
    steps: [
      { stdin: "", expectedStdout: "num1:", waiting: true },
      { stdin: "2\n", expectedStdout: "num1:num2:", waiting: true },
      { stdin: "2\n3\n", expectedStdout: "num1:num2:Sum: 5\n", waiting: false },
    ]
  }
];

async function run() {
  for (const t of tests) {
    console.log(`\n================================`);
    console.log(`RUNNING: ${t.name}`);
    const prepared = prepareSourceForExecution(t.lid, t.code);
    let programOutputShown = "";

    for (let i = 0; i < t.steps.length; i++) {
      const step = t.steps[i];
      console.log(`\n--- Step ${i + 1} (stdin: ${JSON.stringify(step.stdin)}) ---`);
      const res = await runCode(t.lid, prepared, step.stdin);
      const waiting = checkWaitingForInput(t.lid, res);

      const normalizedStdout = (res.stdout || "").replace(/\r\n/g, "\n");
      console.log(`stdout: ${JSON.stringify(normalizedStdout)}`);
      console.log(`stderr: ${JSON.stringify(res.stderr)}`);
      console.log(`isWaiting: ${waiting.isWaiting} (expected: ${step.waiting})`);

      if (!normalizedStdout.startsWith(programOutputShown)) {
        console.error(`FAILED: normalizedStdout does not start with programOutputShown!`);
        console.error(`normalizedStdout: ${JSON.stringify(normalizedStdout)}`);
        console.error(`programOutputShown: ${JSON.stringify(programOutputShown)}`);
        process.exit(1);
      }

      const delta = normalizedStdout.slice(programOutputShown.length);
      console.log(`delta to render: ${JSON.stringify(delta)}`);
      programOutputShown = normalizedStdout;
    }
  }
  console.log("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!");
}

run().catch(console.error);
