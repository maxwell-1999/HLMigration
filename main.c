#include <sched.h>
#include <unistd.h>
#include <stdbool.h> // Include this for `true` and `false`

int main() {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(0, &cpuset); // Bind to core 0

    if (sched_setaffinity(getpid(), sizeof(cpu_set_t), &cpuset) != 0) {
        perror("sched_setaffinity");
    }
    bool cond= true;

    while (cond) {
        // Infinite loop
    }
    return 0;
}
