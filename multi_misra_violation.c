#include <stdint.h>
#include <stdio.h>

void example(void) {
    uint32_t a = 1000;
    int8_t b = -1;

    if (a > b) { // MISRA 10.1: Signed/unsigned comparison
        // do something
    }

    void* ptr;
    int* iptr = (int*)ptr; // MISRA 11.3: Cast from void* to object pointer

    char buffer[100];
    sprintf(buffer, "Value: %u", a); // MISRA 21.6: Use of sprintf is discouraged
}
