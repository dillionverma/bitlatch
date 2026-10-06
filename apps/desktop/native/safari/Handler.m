#import <SafariServices/SafariServices.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

static NSDictionary *Request(NSDictionary *request) {
  NSString *group = [NSBundle.mainBundle objectForInfoDictionaryKey:@"LatchAppGroup"];
  NSURL *directory = group ? [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group] : nil;
  NSData *configData = directory ? [NSData dataWithContentsOfURL:[directory URLByAppendingPathComponent:@"safari-bridge.json"]] : nil;
  NSDictionary *config = configData ? [NSJSONSerialization JSONObjectWithData:configData options:0 error:nil] : nil;
  if (![config isKindOfClass:NSDictionary.class] || ![config[@"token"] isKindOfClass:NSString.class]) return nil;
  NSString *path = [directory.path stringByAppendingPathComponent:@"safari.sock"];
  struct sockaddr_un address = {0};
  address.sun_family = AF_UNIX;
  if (strlen(path.fileSystemRepresentation) >= sizeof(address.sun_path)) return nil;
  strlcpy(address.sun_path, path.fileSystemRepresentation, sizeof(address.sun_path));
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return nil;
  // Bound native messaging independently of Safari background lifetime.
  BOOL unlocking = [request[@"type"] isEqual:@"unlock"] || [request[@"type"] isEqual:@"biometricUnlock"];
  BOOL writing = [@[@"save", @"delete", @"restore", @"setFavorite", @"sync", @"commitCapture"] containsObject:request[@"type"]];
  BOOL readingTrash = [request[@"type"] isEqual:@"browse"] && [request[@"query"] isKindOfClass:NSDictionary.class] && [request[@"query"][@"scope"] isEqual:@"trash"];
  struct timeval timeout = {unlocking || writing || readingTrash ? 120 : 8, 0};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  int noSignal = 1;
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, sizeof(noSignal));
  if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0) { close(fd); return nil; }
  NSMutableData *payload = [[NSJSONSerialization dataWithJSONObject:@{@"token": config[@"token"], @"request": request} options:0 error:nil] mutableCopy];
  if (!payload || payload.length >= 900000) { close(fd); return nil; }
  [payload appendBytes:"\n" length:1];
  size_t sent = 0;
  while (sent < payload.length) {
    ssize_t count = write(fd, (const char *)payload.bytes + sent, payload.length - sent);
    if (count <= 0) { close(fd); return nil; }
    sent += count;
  }
  NSMutableData *response = [NSMutableData data];
  char buffer[4096];
  while (response.length < 1024 * 1024) {
    ssize_t count = read(fd, buffer, sizeof(buffer));
    if (count <= 0) break;
    [response appendBytes:buffer length:count];
    if (memchr(buffer, '\n', count)) break;
  }
  close(fd);
  if (response.length >= 1024 * 1024) return nil;
  id result = [NSJSONSerialization JSONObjectWithData:response options:0 error:nil];
  return [result isKindOfClass:NSDictionary.class] ? result : nil;
}


@interface LatchSafariHandler : NSObject <NSExtensionRequestHandling>
@end
@implementation LatchSafariHandler
- (void)beginRequestWithExtensionContext:(NSExtensionContext *)context {
  NSExtensionItem *input = context.inputItems.firstObject;
  id message = input.userInfo[SFExtensionMessageKey];
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *response = [message isKindOfClass:NSDictionary.class] ? Request(message) : nil;
    if (!response) response = @{ @"ok": @NO, @"error": @"Open Bitlatch on your Mac to connect your vault." };
    NSExtensionItem *output = [NSExtensionItem new];
    output.userInfo = @{ SFExtensionMessageKey: response };
    [context completeRequestReturningItems:@[output] completionHandler:nil];
  });
}
@end
extern int NSExtensionMain(int argc, const char *argv[]);
int main(int argc, const char *argv[]) { return NSExtensionMain(argc, argv); }
