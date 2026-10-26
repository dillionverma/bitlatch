#include <Security/Security.h>
#include <stdbool.h>
#include <sys/types.h>

typedef struct {
  char key[64];
  char identifier[256];
  bool named;
} LatchLauncher;

// The requirement names the relay's launcher, or with requirement_names_parent the
// launcher's own parent, for hosts such as Raycast that run extensions in a child runtime.
bool latch_find_launcher(pid_t relay, SecRequirementRef _Nullable requirement,
                         bool requirement_names_parent, LatchLauncher *_Nonnull launcher);
