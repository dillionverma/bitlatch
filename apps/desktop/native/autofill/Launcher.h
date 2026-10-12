#include <Security/Security.h>
#include <stdbool.h>
#include <sys/types.h>

typedef struct {
  char key[64];
  char identifier[256];
  bool named;
} LatchLauncher;

bool latch_find_launcher(pid_t relay, SecRequirementRef _Nullable requirement,
                         LatchLauncher *_Nonnull launcher);
