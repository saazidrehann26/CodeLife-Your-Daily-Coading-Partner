import {
  runCode,
  CONFIRMED_LANGUAGE_IDS
} from '../src/services/compilerService.js';

const cppPreamble = `/* === JUDGE0 C++ INSTRUMENTATION PREAMBLE === */
#include <iostream>
#include <string>
#include <streambuf>
#include <cstdio>
#include <cstdlib>
#include <unistd.h>

#define __NEED_INPUT__ "__NEED_INPUT__"

namespace __judge0_input_interceptor__ {
    static inline void __trigger_need_input__() {
        std::cout.flush();
        fflush(stdout);
        write(2, __NEED_INPUT__, 14);
        _exit(0);
    }

    class InterceptBuf : public std::streambuf {
        std::streambuf* orig;
        char ch;
    public:
        InterceptBuf(std::streambuf* o) : orig(o), ch(0) {}
    protected:
        virtual int_type underflow() override {
            int_type c = orig->sbumpc();
            if (c == traits_type::eof()) {
                __trigger_need_input__();
                return traits_type::eof();
            }
            ch = traits_type::to_char_type(c);
            setg(&ch, &ch, &ch + 1);
            return c;
        }
        virtual int_type uflow() override {
            int_type c = orig->sbumpc();
            if (c == traits_type::eof()) {
                __trigger_need_input__();
                return traits_type::eof();
            }
            return c;
        }
    };

    static struct Init {
        InterceptBuf* ib;
        Init() {
            ib = new InterceptBuf(std::cin.rdbuf());
            std::cin.rdbuf(ib);
        }
    } __init__;
}

#define scanf(...) ({ \\
    int __r = (scanf)(__VA_ARGS__); \\
    if (__r == EOF || feof(stdin)) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __r; \\
})

#define fscanf(stream, ...) ({ \\
    FILE *__s = (stream); \\
    int __r = (fscanf)(__s, __VA_ARGS__); \\
    if ((__s == stdin && __r == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __r; \\
})

#define getchar() ({ \\
    int __c = (getchar)(); \\
    if (__c == EOF || feof(stdin)) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define getc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (getc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgetc(stream) ({ \\
    FILE *__s = (stream); \\
    int __c = (fgetc)(__s); \\
    if ((__s == stdin && __c == EOF) || (__s == stdin && feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __c; \\
})

#define fgets(s, size, stream) ({ \\
    FILE *__s = (stream); \\
    char *__res = (fgets)(s, size, __s); \\
    if (!__res && (__s == stdin || feof(stdin))) { \\
        __judge0_input_interceptor__::__trigger_need_input__(); \\
    } \\
    __res; \\
})
#line 1
`;

const userCppCode = `#include <iostream>
#include <string>
using namespace std;
int main() {
    cout << "Enter line: ";
    string s;
    getline(cin, s);
    cout << "You entered: " << s << endl;
    return 0;
}
`;

async function test() {
  console.log("Testing full C++ preamble with getline on Judge0...");
  const res1 = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, cppPreamble + userCppCode, "");
  console.log("res1 stdout:", JSON.stringify(res1.stdout));
  console.log("res1 stderr:", JSON.stringify(res1.stderr));

  const res2 = await runCode(CONFIRMED_LANGUAGE_IDS.CPP, cppPreamble + userCppCode, "Hello World\n");
  console.log("res2 stdout:", JSON.stringify(res2.stdout));
  console.log("res2 stderr:", JSON.stringify(res2.stderr));
}

test().catch(console.error);
