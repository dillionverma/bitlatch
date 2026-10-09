#include "VerifiedSocket.h"

#include <Security/Security.h>
#include <bsm/libbsm.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

typedef struct {
  int fd;
  pid_t pid;
  audit_token_t audit;
} AcceptedPeer;

typedef struct {
  int listen_fd;
  char *path;
  dev_t path_device;
  ino_t path_inode;
  SecRequirementRef requirement;
  pthread_t thread;
  atomic_bool stopped;
  atomic_int references;
  napi_threadsafe_function callback;
} VerifiedListener;

static void release_listener(VerifiedListener *listener) {
  if (atomic_fetch_sub(&listener->references, 1) != 1) return;
  if (listener->requirement) CFRelease(listener->requirement);
  free(listener->path);
  free(listener);
}

static void deliver_peer(napi_env env, napi_value callback, void *context, void *data) {
  VerifiedListener *listener = context;
  AcceptedPeer *peer = data;
  bool adopted = false;
  if (env && !atomic_load(&listener->stopped)) {
    napi_value args[3], receiver, result;
    char audit_hex[sizeof(audit_token_t) * 2 + 1];
    const uint8_t *bytes = (const uint8_t *)&peer->audit;
    for (size_t i = 0; i < sizeof(audit_token_t); i++)
      snprintf(audit_hex + i * 2, 3, "%02x", bytes[i]);
    if (napi_create_int32(env, peer->fd, &args[0]) == napi_ok &&
        napi_create_int32(env, peer->pid, &args[1]) == napi_ok &&
        napi_create_string_utf8(env, audit_hex, NAPI_AUTO_LENGTH, &args[2]) == napi_ok &&
        napi_get_undefined(env, &receiver) == napi_ok &&
        napi_call_function(env, receiver, callback, 3, args, &result) == napi_ok)
      napi_get_value_bool(env, result, &adopted);
  }
  if (!adopted) close(peer->fd);
  free(peer);
}

static void callback_finished(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  release_listener(data);
}

static bool verify_peer(int fd, SecRequirementRef requirement, AcceptedPeer *peer) {
  socklen_t length = sizeof(peer->audit);
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &peer->audit, &length) != 0 ||
      length != sizeof(peer->audit)) return false;

  CFDataRef token = CFDataCreate(kCFAllocatorDefault, (const UInt8 *)&peer->audit,
                                 sizeof(peer->audit));
  if (!token) return false;
  const void *keys[] = {kSecGuestAttributeAudit};
  const void *values[] = {token};
  CFDictionaryRef attributes = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
                                                   &kCFTypeDictionaryKeyCallBacks,
                                                   &kCFTypeDictionaryValueCallBacks);
  SecCodeRef code = NULL;
  bool valid = attributes &&
               SecCodeCopyGuestWithAttributes(NULL, attributes, kSecCSDefaultFlags, &code) == errSecSuccess &&
               SecCodeCheckValidity(code, kSecCSDefaultFlags, requirement) == errSecSuccess;
  if (code) CFRelease(code);
  if (attributes) CFRelease(attributes);
  CFRelease(token);
  if (valid) peer->pid = audit_token_to_pid(peer->audit);
  return valid;
}

static void *accept_peers(void *argument) {
  VerifiedListener *listener = argument;
  struct pollfd ready = {.fd = listener->listen_fd, .events = POLLIN};
  while (!atomic_load(&listener->stopped)) {
    int polled = poll(&ready, 1, 100);
    if (polled <= 0) continue;
    if (!(ready.revents & POLLIN)) break;
    while (!atomic_load(&listener->stopped)) {
      int fd = accept(listener->listen_fd, NULL, NULL);
      if (fd < 0) {
        if (errno == EINTR) continue;
        break;
      }
      if (fcntl(fd, F_SETFD, FD_CLOEXEC) != 0) {
        close(fd);
        continue;
      }
      AcceptedPeer *peer = calloc(1, sizeof(*peer));
      if (!peer) {
        close(fd);
        continue;
      }
      peer->fd = fd;
      if (!verify_peer(fd, listener->requirement, peer) ||
          napi_call_threadsafe_function(listener->callback, peer, napi_tsfn_nonblocking) != napi_ok) {
        close(fd);
        free(peer);
      }
    }
  }
  return NULL;
}

static void stop_listener(VerifiedListener *listener) {
  if (atomic_exchange(&listener->stopped, true)) return;
  pthread_join(listener->thread, NULL);
  close(listener->listen_fd);
  struct stat current;
  if (lstat(listener->path, &current) == 0 &&
      current.st_dev == listener->path_device && current.st_ino == listener->path_inode)
    unlink(listener->path);
  napi_release_threadsafe_function(listener->callback, napi_tsfn_release);
}

static void finalize_listener(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  VerifiedListener *listener = data;
  stop_listener(listener);
  release_listener(listener);
}

static char *copy_string(napi_env env, napi_value value, size_t maximum) {
  size_t length;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok ||
      length == 0 || length > maximum) return NULL;
  char *copy = malloc(length + 1);
  if (!copy) return NULL;
  if (napi_get_value_string_utf8(env, value, copy, length + 1, &length) != napi_ok ||
      strlen(copy) != length) {
    free(copy);
    return NULL;
  }
  return copy;
}

static SecRequirementRef signing_requirement(const char *allowed_identifier) {
  for (const char *part = allowed_identifier; *part; part++)
    if (!((*part >= 'a' && *part <= 'z') || (*part >= 'A' && *part <= 'Z') ||
          (*part >= '0' && *part <= '9') || *part == '.' || *part == '-')) return NULL;
  SecCodeRef self = NULL;
  CFDictionaryRef info = NULL;
  SecRequirementRef requirement = NULL;
  if (SecCodeCopySelf(kSecCSDefaultFlags, &self) != errSecSuccess) return NULL;
  if (SecCodeCheckValidity(self, kSecCSDefaultFlags, NULL) == errSecSuccess &&
      SecCodeCopySigningInformation(self, kSecCSSigningInformation, &info) == errSecSuccess) {
    CFStringRef self_identifier = CFDictionaryGetValue(info, kSecCodeInfoIdentifier);
    CFStringRef self_team = CFDictionaryGetValue(info, kSecCodeInfoTeamIdentifier);
    if (self_identifier && CFEqual(self_identifier, CFSTR("app.latch.vault")) &&
        self_team && CFGetTypeID(self_team) == CFStringGetTypeID()) {
      CFStringRef identifier = CFStringCreateWithCString(kCFAllocatorDefault, allowed_identifier,
                                                         kCFStringEncodingUTF8);
      if (identifier) {
        CFStringRef text = CFStringCreateWithFormat(
            kCFAllocatorDefault, NULL,
            CFSTR("anchor apple generic and identifier \"%@\" and certificate leaf[subject.OU] = \"%@\""),
            identifier, self_team);
        if (text) {
          SecRequirementCreateWithString(text, kSecCSDefaultFlags, &requirement);
          CFRelease(text);
        }
        CFRelease(identifier);
      }
    }
  }
  if (info) CFRelease(info);
  CFRelease(self);
  return requirement;
}

static napi_value start_verified_socket(napi_env env, napi_callback_info info) {
  size_t count = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &count, args, NULL, NULL);
  napi_valuetype callback_type;
  if (count != 3 || napi_typeof(env, args[2], &callback_type) != napi_ok ||
      callback_type != napi_function) {
    napi_throw_type_error(env, NULL, "Expected socket path, client identifier, and callback");
    return NULL;
  }
  char *path = copy_string(env, args[0], sizeof(((struct sockaddr_un *)0)->sun_path) - 1);
  char *identifier = copy_string(env, args[1], 255);
  SecRequirementRef requirement = identifier ? signing_requirement(identifier) : NULL;
  free(identifier);
  if (!path || !requirement) {
    free(path);
    if (requirement) CFRelease(requirement);
    napi_throw_error(env, NULL, "A signed Bitlatch app and exact client identifier are required");
    return NULL;
  }
  VerifiedListener *listener = calloc(1, sizeof(*listener));
  if (!listener) goto failure;
  listener->path = path;
  listener->requirement = requirement;
  listener->listen_fd = -1;
  atomic_init(&listener->references, 1);
  atomic_init(&listener->stopped, false);
  listener->listen_fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (listener->listen_fd < 0 || fcntl(listener->listen_fd, F_SETFD, FD_CLOEXEC) != 0 ||
      fcntl(listener->listen_fd, F_SETFL, O_NONBLOCK) != 0) goto listener_failure;
  struct sockaddr_un address = {.sun_family = AF_UNIX};
  memcpy(address.sun_path, path, strlen(path) + 1);
  if (bind(listener->listen_fd, (struct sockaddr *)&address, sizeof(address)) != 0)
    goto listener_failure;
  struct stat bound;
  if (lstat(path, &bound) != 0 || !S_ISSOCK(bound.st_mode)) goto listener_failure;
  listener->path_device = bound.st_dev;
  listener->path_inode = bound.st_ino;
  if (chmod(path, 0600) != 0 || listen(listener->listen_fd, 16) != 0) goto listener_failure;
  napi_value name;
  if (napi_create_string_utf8(env, "Bitlatch verified socket", NAPI_AUTO_LENGTH, &name) != napi_ok ||
      napi_create_threadsafe_function(env, args[2], NULL, name, 64, 1, listener,
                                      callback_finished, listener, deliver_peer,
                                      &listener->callback) != napi_ok) goto listener_failure;
  atomic_fetch_add(&listener->references, 1);
  if (pthread_create(&listener->thread, NULL, accept_peers, listener) != 0) {
    napi_release_threadsafe_function(listener->callback, napi_tsfn_release);
    goto listener_failure;
  }
  napi_value handle;
  if (napi_create_external(env, listener, finalize_listener, NULL, &handle) == napi_ok)
    return handle;
  stop_listener(listener);
  release_listener(listener);
  napi_throw_error(env, NULL, "Could not create verified socket handle");
  return NULL;

listener_failure:
  if (listener->listen_fd >= 0) close(listener->listen_fd);
  struct stat current;
  if (listener->path_inode && lstat(path, &current) == 0 &&
      current.st_dev == listener->path_device && current.st_ino == listener->path_inode)
    unlink(path);
  release_listener(listener);
  napi_throw_error(env, NULL, "Could not start verified socket");
  return NULL;

failure:
  free(path);
  CFRelease(requirement);
  napi_throw_error(env, NULL, "Could not allocate verified socket");
  return NULL;
}

static napi_value stop_verified_socket(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1], undefined;
  napi_get_cb_info(env, info, &count, args, NULL, NULL);
  VerifiedListener *listener = NULL;
  if (count != 1 || napi_get_value_external(env, args[0], (void **)&listener) != napi_ok) {
    napi_throw_type_error(env, NULL, "Expected verified socket handle");
    return NULL;
  }
  stop_listener(listener);
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_status latch_register_verified_socket(napi_env env, napi_value exports) {
  napi_value start, stop;
  napi_status status = napi_create_function(env, "startVerifiedSocket", NAPI_AUTO_LENGTH,
                                             start_verified_socket, NULL, &start);
  if (status != napi_ok) return status;
  status = napi_create_function(env, "stopVerifiedSocket", NAPI_AUTO_LENGTH,
                                stop_verified_socket, NULL, &stop);
  if (status != napi_ok) return status;
  status = napi_set_named_property(env, exports, "startVerifiedSocket", start);
  if (status != napi_ok) return status;
  return napi_set_named_property(env, exports, "stopVerifiedSocket", stop);
}
