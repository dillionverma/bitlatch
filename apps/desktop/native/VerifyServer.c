#include <Security/Security.h>
#include <bsm/libbsm.h>
#include <stdbool.h>
#include <sys/socket.h>
#include <sys/un.h>

bool latch_verify_server(int fd) {
  audit_token_t audit;
  socklen_t size = sizeof(audit);
  if (getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &audit, &size) != 0 || size != sizeof(audit))
    return false;

  SecCodeRef self = NULL;
  SecCodeRef peer = NULL;
  CFDictionaryRef self_info = NULL;
  CFDictionaryRef attributes = NULL;
  CFDataRef token = NULL;
  SecRequirementRef requirement = NULL;
  CFStringRef text = NULL;
  bool valid = false;
  if (SecCodeCopySelf(kSecCSDefaultFlags, &self) != errSecSuccess ||
      SecCodeCheckValidity(self, kSecCSDefaultFlags, NULL) != errSecSuccess ||
      SecCodeCopySigningInformation(self, kSecCSSigningInformation, &self_info) != errSecSuccess)
    goto done;
  CFStringRef team = CFDictionaryGetValue(self_info, kSecCodeInfoTeamIdentifier);
  if (!team || CFGetTypeID(team) != CFStringGetTypeID()) goto done;
  text = CFStringCreateWithFormat(
      kCFAllocatorDefault, NULL,
      CFSTR("anchor apple generic and identifier \"app.latch.vault\" and certificate leaf[subject.OU] = \"%@\""),
      team);
  if (!text || SecRequirementCreateWithString(text, kSecCSDefaultFlags, &requirement) != errSecSuccess)
    goto done;
  token = CFDataCreate(kCFAllocatorDefault, (const UInt8 *)&audit, sizeof(audit));
  if (!token) goto done;
  const void *keys[] = {kSecGuestAttributeAudit};
  const void *values[] = {token};
  attributes = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 1,
                                  &kCFTypeDictionaryKeyCallBacks,
                                  &kCFTypeDictionaryValueCallBacks);
  if (!attributes ||
      SecCodeCopyGuestWithAttributes(NULL, attributes, kSecCSDefaultFlags, &peer) != errSecSuccess)
    goto done;
  valid = SecCodeCheckValidity(peer, kSecCSDefaultFlags, requirement) == errSecSuccess;
done:
  if (peer) CFRelease(peer);
  if (attributes) CFRelease(attributes);
  if (token) CFRelease(token);
  if (requirement) CFRelease(requirement);
  if (text) CFRelease(text);
  if (self_info) CFRelease(self_info);
  if (self) CFRelease(self);
  return valid;
}
