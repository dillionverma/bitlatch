#include <node_api.h>
#include <stdlib.h>
#include <string.h>
#include "Bridge.h"

// Only Node-API ownership/threading lives here. All Apple APIs live in Swift.
static void deliver(napi_env env, napi_value callback, void *context, void *data) {
  if (env) {
    napi_value value, receiver;
    napi_create_string_utf8(env, data, NAPI_AUTO_LENGTH, &value);
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, 1, &value, NULL);
  }
  free(data);
}

static void finish(void *context, const char *json) {
  napi_threadsafe_function callback = context;
  char *copy = strdup(json);
  if (napi_call_threadsafe_function(callback, copy, napi_tsfn_nonblocking) != napi_ok) free(copy);
  napi_release_threadsafe_function(callback, napi_tsfn_release);
}

static char *string(napi_env env, napi_value value) {
  size_t length;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) return NULL;
  char *text = malloc(length + 1);
  if (text) napi_get_value_string_utf8(env, value, text, length + 1, &length);
  return text;
}

static napi_value invoke(napi_env env, napi_callback_info info) {
  size_t count = 3;
  napi_value args[3], resource, undefined;
  napi_get_undefined(env, &undefined);
  napi_get_cb_info(env, info, &count, args, NULL, NULL);
  if (count != 3) { napi_throw_type_error(env, NULL, "Invalid AutoFill call"); return NULL; }
  char *operation = string(env, args[0]), *input = string(env, args[1]);
  if (!operation || !input) {
    free(operation); free(input);
    napi_throw_type_error(env, NULL, "Invalid AutoFill arguments"); return NULL;
  }
  napi_create_string_utf8(env, "Latch AutoFill", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function callback;
  if (napi_create_threadsafe_function(env, args[2], NULL, resource, 1, 1,
      NULL, NULL, NULL, deliver, &callback) == napi_ok)
    latch_invoke(operation, input, callback, finish);
  free(operation); free(input);
  return undefined;
}

NAPI_MODULE_INIT() {
  napi_value function;
  napi_create_function(env, "invoke", NAPI_AUTO_LENGTH, invoke, NULL, &function);
  napi_set_named_property(env, exports, "invoke", function);
  return exports;
}
