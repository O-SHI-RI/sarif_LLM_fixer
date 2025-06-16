#include <stdint.h>
#include <stdio.h>

void example(void) {
    uint32_t a = 1000;
    int8_t b = -1;

    if (a > b) {
    }

    void* ptr;
    int* iptr = (int*)ptr;

    char buffer[100];
    sprintf(buffer, "Value: %u", a);
}