#include <Security/SecTask.h>

typedef void (*LatchReply)(void *context, const char *json);
void latch_invoke(const char *operation, const char *input, void *context, LatchReply reply);
