import {
  runCode,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const testCode = `/* === JUDGE0 C INSTRUMENTATION PREAMBLE === */
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>

#define __NEED_INPUT__ "__NEED_INPUT__"

static inline void __trigger_need_input__(void) {
    fflush(stdout);
    write(2, __NEED_INPUT__, 14);
    _exit(0);
}

#define scanf(...) ({ \\
    int __r = (scanf)(__VA_ARGS__); \\
    if (__r == EOF || feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __r; \\
})

#define fscanf(stream, ...) ({ \\
    FILE *__s = (stream); \\
    int __r = (fscanf)(__s, __VA_ARGS__); \\
    if ((__s == stdin && __r == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __r; \\
})

#define getchar() ({ \\
    int __c = (getchar)(); \\
    if (__c == EOF || feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define getc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (getc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgetc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (fgetc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgets(s, size, stream) ({ \\
    FILE *__s = (stream); \\
    char *__res = (fgets)(s, size, __s); \\
    if (!__res && (__s == stdin || feof(stdin))) { \\
        __trigger_need_input__(); \\
    } \\
    __res; \\
})

#define gets(s) ({ \\
    char *__res = (gets)(s); \\
    if (!__res && feof(stdin)) { \\
        __trigger_need_input__(); \\
    } \\
    __res; \\
})
#line 1

#include <stdio.h>
int main() {
    int a, b;
    printf("Enter a: ");
    fscanf(stdin, "%d", &a);
    printf("Enter b: ");
    int c = getchar();
    if (c == '\\n') c = getchar();
    printf("a = %d, c = %c\\n", a, c);
    return 0;
}
`;

async function test() {
  console.log("Testing full C preamble with fscanf and getchar on Judge0...");
  const res1 = await runCode(CONFIRMED_LANGUAGE_IDS.C, testCode, "");
  console.log("res1 stdout:", JSON.stringify(res1.stdout));
  console.log("res1 stderr:", JSON.stringify(res1.stderr));
  console.log("res1 status:", res1.status);

  const res2 = await runCode(CONFIRMED_LANGUAGE_IDS.C, testCode, "42\nx\n");
  console.log("res2 stdout:", JSON.stringify(res2.stdout));
  console.log("res2 stderr:", JSON.stringify(res2.stderr));
  console.log("res2 status:", res2.status);
}

test().catch(console.error);
