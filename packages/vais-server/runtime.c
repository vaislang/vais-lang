// Minimal Vais server runtime — provides external functions declared with X F
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>

// str_len(s: str) -> i64
// The compiler extracts the i8* pointer and passes it directly
long long str_len(const char* s) {
    if (!s) return 0;
    return (long long)strlen(s);
}

// sleep_ms(ms: i64)
void sleep_ms(long long ms) {
    usleep((unsigned int)(ms * 1000));
}
