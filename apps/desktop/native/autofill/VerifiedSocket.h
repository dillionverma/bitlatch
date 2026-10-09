#include <node_api.h>

// Callback: (fd, verifiedPid, auditTokenHex) => boolean. Return true only after
// a Socket adopts fd; all other results leave ownership with native code.
napi_status latch_register_verified_socket(napi_env env, napi_value exports);
