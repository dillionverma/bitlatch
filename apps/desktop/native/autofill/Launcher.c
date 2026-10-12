#include "Launcher.h"

#include <libproc.h>
#include <stdio.h>
#include <sys/proc_info.h>
#include <unistd.h>

static bool pipe_info(pid_t pid, int fd, struct pipe_info *pipe) {
  struct pipe_fdinfo info;
  if (proc_pidfdinfo(pid, fd, PROC_PIDFDPIPEINFO, &info, sizeof(info)) != sizeof(info))
    return false;
  *pipe = info.pipeinfo;
  return true;
}

static bool feeds_stdio(pid_t relay, pid_t parent) {
  struct pipe_info input, output;
  if (!pipe_info(relay, STDIN_FILENO, &input) || !pipe_info(relay, STDOUT_FILENO, &output) ||
      !input.pipe_peerhandle || !output.pipe_peerhandle) return false;
  struct proc_fdinfo fds[4096];
  int bytes = proc_pidinfo(parent, PROC_PIDLISTFDS, 0, fds, sizeof(fds));
  bool holds_input = false, holds_output = false;
  for (int i = 0; i < bytes / (int)sizeof(fds[0]) && !(holds_input && holds_output); i++) {
    struct pipe_info held;
    if (fds[i].proc_fdtype != PROX_FDTYPE_PIPE || !pipe_info(parent, fds[i].proc_fd, &held))
      continue;
    holds_input |= held.pipe_handle == input.pipe_peerhandle;
    holds_output |= held.pipe_handle == output.pipe_peerhandle;
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
                         LatchLauncher *_Nonnull launcher) {
  struct proc_bsdinfo info, parent;
  if (proc_pidinfo(relay, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info) ||
      info.pbi_ppid <= 1) return false;
  pid_t ppid = (pid_t)info.pbi_ppid;
  if (proc_pidinfo(ppid, PROC_PIDTBSDINFO, 0, &parent, sizeof(parent)) != sizeof(parent) ||
      !feeds_stdio(relay, ppid)) return false;
  bool named = requirement && signing_identifier(ppid, requirement, launcher->identifier,
                                                 sizeof(launcher->identifier));
  if (!parent_unchanged(relay, ppid)) return false;
  launcher->named = named;
  snprintf(launcher->key, sizeof(launcher->key), "%d:%llu.%06llu", ppid,
           (unsigned long long)parent.pbi_start_tvsec, (unsigned long long)parent.pbi_start_tvusec);
  return true;
}
