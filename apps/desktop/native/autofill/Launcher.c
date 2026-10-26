#include "Launcher.h"

#include <libproc.h>
#include <stdio.h>
#include <sys/socket.h>
#include <sys/proc_info.h>
#include <unistd.h>

typedef struct {
  uint32_t type;
  uint64_t own;
  uint64_t peer;
} Endpoint;

// Browsers connect a relay's stdio with pipes. Node, which runs Raycast extensions, uses
// Unix socket pairs.
static bool endpoint(pid_t pid, int fd, Endpoint *result) {
  struct pipe_fdinfo pipe;
  if (proc_pidfdinfo(pid, fd, PROC_PIDFDPIPEINFO, &pipe, sizeof(pipe)) == sizeof(pipe)) {
    *result = (Endpoint){PROX_FDTYPE_PIPE, pipe.pipeinfo.pipe_handle,
                         pipe.pipeinfo.pipe_peerhandle};
    return result->peer != 0;
  }
  struct socket_fdinfo unix_socket;
  if (proc_pidfdinfo(pid, fd, PROC_PIDFDSOCKETINFO, &unix_socket, sizeof(unix_socket)) ==
          sizeof(unix_socket) &&
      unix_socket.psi.soi_family == AF_UNIX && unix_socket.psi.soi_kind == SOCKINFO_UN) {
    *result = (Endpoint){PROX_FDTYPE_SOCKET, unix_socket.psi.soi_pcb,
                         unix_socket.psi.soi_proto.pri_un.unsi_conn_pcb};
    return result->peer != 0;
  }
  return false;
}

static bool feeds_stdio(pid_t relay, pid_t parent) {
  Endpoint input, output;
  if (!endpoint(relay, STDIN_FILENO, &input) || !endpoint(relay, STDOUT_FILENO, &output))
    return false;
  struct proc_fdinfo fds[4096];
  int bytes = proc_pidinfo(parent, PROC_PIDLISTFDS, 0, fds, sizeof(fds));
  bool holds_input = false, holds_output = false;
  for (int i = 0; i < bytes / (int)sizeof(fds[0]) && !(holds_input && holds_output); i++) {
    Endpoint held;
    if ((fds[i].proc_fdtype != input.type && fds[i].proc_fdtype != output.type) ||
        !endpoint(parent, fds[i].proc_fd, &held))
      continue;
    holds_input |= held.type == input.type && held.own == input.peer;
    holds_output |= held.type == output.type && held.own == output.peer;
  }
  return holds_input && holds_output;
}

static bool signing_identifier(pid_t pid, SecRequirementRef requirement, char *identifier,
                               size_t size) {
  CFNumberRef number = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &pid);
  if (!number) return false;
  const void *keys[] = {kSecGuestAttributePid};
  const void *values[] = {number};
  CFDictionaryRef attributes = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
                                                   &kCFTypeDictionaryKeyCallBacks,
                                                   &kCFTypeDictionaryValueCallBacks);
  CFRelease(number);
  if (!attributes) return false;
  SecCodeRef code = NULL;
  CFDictionaryRef info = NULL;
  bool named =
      SecCodeCopyGuestWithAttributes(NULL, attributes, kSecCSDefaultFlags, &code) == errSecSuccess &&
      SecCodeCheckValidity(code, kSecCSDefaultFlags, requirement) == errSecSuccess &&
      SecCodeCopySigningInformation(code, kSecCSDefaultFlags, &info) == errSecSuccess;
  CFStringRef value = named ? CFDictionaryGetValue(info, kSecCodeInfoIdentifier) : NULL;
  named = value && CFGetTypeID(value) == CFStringGetTypeID() &&
          CFStringGetCString(value, identifier, size, kCFStringEncodingUTF8);
  if (info) CFRelease(info);
  if (code) CFRelease(code);
  CFRelease(attributes);
  return named;
}

// An orphan is re-parented to launchd and its old parent's pid can be reused, so the
// pid-based checks above describe the relay's launcher only if its parent never changed.
static bool parent_unchanged(pid_t relay, pid_t parent) {
  struct proc_bsdinfo info;
  return proc_pidinfo(relay, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) == sizeof(info) &&
         (pid_t)info.pbi_ppid == parent;
}

bool latch_find_launcher(pid_t relay, SecRequirementRef _Nullable requirement,
                         bool requirement_names_parent, LatchLauncher *_Nonnull launcher) {
  struct proc_bsdinfo info, parent;
  if (proc_pidinfo(relay, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info) ||
      info.pbi_ppid <= 1) return false;
  pid_t ppid = (pid_t)info.pbi_ppid;
  if (proc_pidinfo(ppid, PROC_PIDTBSDINFO, 0, &parent, sizeof(parent)) != sizeof(parent) ||
      !feeds_stdio(relay, ppid)) return false;
  pid_t signer = requirement_names_parent ? (pid_t)parent.pbi_ppid : ppid;
  bool named = requirement && signer > 1 &&
               signing_identifier(signer, requirement, launcher->identifier,
                                  sizeof(launcher->identifier));
  if (!parent_unchanged(relay, ppid)) return false;
  launcher->named = named && (signer == ppid || parent_unchanged(ppid, signer));
  snprintf(launcher->key, sizeof(launcher->key), "%d:%llu.%06llu", ppid,
           (unsigned long long)parent.pbi_start_tvsec, (unsigned long long)parent.pbi_start_tvusec);
  return true;
}
