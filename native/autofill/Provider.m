#import <AuthenticationServices/AuthenticationServices.h>
#import <AppKit/AppKit.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

// The app group stores a rotating pairing token, never a password or vault key.
// Each request uses a fresh connection and retains a password only until fill.
static NSDictionary *Request(NSDictionary *request) {
  NSString *group = [NSBundle.mainBundle objectForInfoDictionaryKey:@"LatchAppGroup"];
  NSURL *directory = group ? [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group] : nil;
  NSData *configData = directory ? [NSData dataWithContentsOfURL:[directory URLByAppendingPathComponent:@"autofill.json"]] : nil;
  NSDictionary *config = configData ? [NSJSONSerialization JSONObjectWithData:configData options:0 error:nil] : nil;
  if (![config isKindOfClass:NSDictionary.class] || ![config[@"token"] isKindOfClass:NSString.class]) return nil;
  NSString *path = [directory.path stringByAppendingPathComponent:@"autofill.sock"];
  struct sockaddr_un address = {0};
  address.sun_family = AF_UNIX;
  if (strlen(path.fileSystemRepresentation) >= sizeof(address.sun_path)) return nil;
  strlcpy(address.sun_path, path.fileSystemRepresentation, sizeof(address.sun_path));
  int fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return nil;
  struct timeval timeout = {5, 0};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  int noSignal = 1;
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, sizeof(noSignal));
  if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0) { close(fd); return nil; }
  NSMutableData *payload = [[NSJSONSerialization dataWithJSONObject:@{@"token": config[@"token"], @"request": request} options:0 error:nil] mutableCopy];
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

@interface LatchCredentialProvider : ASCredentialProviderViewController
@property NSStackView *stack;
@property NSArray<NSString *> *urls;
@property NSArray<NSDictionary *> *items;
@property ASPasswordCredentialIdentity *identity;
@property NSUInteger generation;
@end

@implementation LatchCredentialProvider
- (void)loadView {
  self.view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 440, 400)];
  self.stack = [NSStackView stackViewWithViews:@[]];
  self.stack.orientation = NSUserInterfaceLayoutOrientationVertical;
  self.stack.alignment = NSLayoutAttributeLeading;
  self.stack.spacing = 12;
  self.stack.translatesAutoresizingMaskIntoConstraints = NO;
  [self.view addSubview:self.stack];
  [NSLayoutConstraint activateConstraints:@[
    [self.stack.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:24],
    [self.stack.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-24],
    [self.stack.topAnchor constraintEqualToAnchor:self.view.topAnchor constant:24],
    [self.stack.bottomAnchor constraintLessThanOrEqualToAnchor:self.view.bottomAnchor constant:-24]
  ]];
}
- (void)showMessage:(NSString *)message retry:(BOOL)retry {
  (void)self.view;
  for (NSView *view in self.stack.arrangedSubviews.copy) {
    [self.stack removeArrangedSubview:view];
    [view removeFromSuperview];
  }
  NSTextField *title = [NSTextField labelWithString:@"AutoFill from Latch"];
  title.font = [NSFont boldSystemFontOfSize:20];
  [self.stack addArrangedSubview:title];
  [self.stack addArrangedSubview:[NSTextField wrappingLabelWithString:message]];
  if (retry) [self.stack addArrangedSubview:[NSButton buttonWithTitle:@"Try Again" target:self action:@selector(retry:)]];
  NSButton *cancel = [NSButton buttonWithTitle:@"Cancel" target:self action:@selector(cancel:)];
  cancel.keyEquivalent = @"\e";
  [self.stack addArrangedSubview:cancel];
}
- (void)cancel:(id)sender {
  self.generation++;
  self.items = nil;
  [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeUserCanceled userInfo:nil]];
}
- (void)retry:(id)sender {
  if (self.identity) [self fillIdentity:self.identity interactive:YES];
  else [self loadCredentials];
}
- (void)prepareCredentialListForServiceIdentifiers:(NSArray<ASCredentialServiceIdentifier *> *)services {
  self.identity = nil;
  NSMutableArray *urls = [NSMutableArray array];
  for (ASCredentialServiceIdentifier *service in services) {
    if (urls.count == 16) break;
    NSString *url = service.type == ASCredentialServiceIdentifierTypeDomain
      ? [@"https://" stringByAppendingString:service.identifier] : service.identifier;
    if (url.length <= 4096) [urls addObject:url];
  }
  self.urls = urls;
  [self loadCredentials];
}
- (void)loadCredentials {
  NSUInteger generation = ++self.generation;
  self.items = nil;
  if (!self.urls.count) {
    [self showMessage:@"This app did not provide a website to match. Open Latch to copy your login." retry:NO];
    return;
  }
  [self showMessage:@"Looking for matching logins…" retry:NO];
  NSArray *urls = self.urls;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *result = Request(@{@"type": @"matches", @"urls": urls});
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != self.generation) return;
      if (![result[@"ok"] boolValue]) {
        [self showMessage:@"Open and unlock Latch, then choose Try Again." retry:YES];
        return;
      }
      NSMutableArray *items = [NSMutableArray array];
      NSMutableSet *seen = [NSMutableSet set];
      for (NSDictionary *item in result[@"value"]) {
        if (items.count == 12) break;
        if (![seen containsObject:item[@"id"]]) { [items addObject:item]; [seen addObject:item[@"id"]]; }
      }
      self.items = items;
      [self showMessage:items.count ? @"Choose a login." : @"No matching logins. Add this website to a login in Latch." retry:YES];
      for (NSUInteger i = 0; i < items.count; i++) {
        NSDictionary *item = items[i];
        NSButton *button = [NSButton buttonWithTitle:[NSString stringWithFormat:@"%@ — %@", item[@"name"], item[@"username"]]
          target:self action:@selector(select:)];
        button.tag = i;
        [self.stack insertArrangedSubview:button atIndex:self.stack.arrangedSubviews.count - 2];
      }
      self.preferredContentSize = NSMakeSize(440, MIN(700, 180 + items.count * 40));
    });
  });
}
- (void)select:(NSButton *)sender {
  if (sender.tag < 0 || (NSUInteger)sender.tag >= self.items.count) return;
  NSDictionary *item = self.items[sender.tag];
  ASCredentialServiceIdentifier *service = [[ASCredentialServiceIdentifier alloc] initWithIdentifier:item[@"url"] type:ASCredentialServiceIdentifierTypeURL];
  self.identity = [[ASPasswordCredentialIdentity alloc] initWithServiceIdentifier:service user:item[@"username"] recordIdentifier:item[@"id"]];
  [self fillIdentity:self.identity interactive:YES];
}
- (void)fillIdentity:(ASPasswordCredentialIdentity *)identity interactive:(BOOL)interactive {
  NSUInteger generation = ++self.generation;
  if (!identity.recordIdentifier.length) {
    [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeCredentialIdentityNotFound userInfo:nil]];
    return;
  }
  if (interactive) [self showMessage:@"Filling login…" retry:NO];
  NSString *url = identity.serviceIdentifier.type == ASCredentialServiceIdentifierTypeDomain
    ? [@"https://" stringByAppendingString:identity.serviceIdentifier.identifier] : identity.serviceIdentifier.identifier;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *result = Request(@{@"type": @"fill", @"id": identity.recordIdentifier, @"url": url});
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != self.generation) return;
      if (![result[@"ok"] boolValue]) {
        if (interactive) [self showMessage:@"Open and unlock Latch, then try again. The login must still match this website." retry:YES];
        else [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeUserInteractionRequired userInfo:nil]];
        return;
      }
      NSDictionary *value = result[@"value"];
      ASPasswordCredential *credential = [ASPasswordCredential credentialWithUser:value[@"username"] password:value[@"password"]];
      self.items = nil;
      [self.extensionContext completeRequestWithSelectedCredential:credential completionHandler:nil];
    });
  });
}
- (void)provideCredentialWithoutUserInteractionForRequest:(id<ASCredentialRequest>)request {
  if (![request isKindOfClass:ASPasswordCredentialRequest.class]) {
    [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeFailed userInfo:nil]];
    return;
  }
  [self fillIdentity:(ASPasswordCredentialIdentity *)request.credentialIdentity interactive:NO];
}
- (void)prepareInterfaceToProvideCredentialForRequest:(id<ASCredentialRequest>)request {
  if (![request isKindOfClass:ASPasswordCredentialRequest.class]) { [self cancel:nil]; return; }
  self.identity = (ASPasswordCredentialIdentity *)request.credentialIdentity;
  [self fillIdentity:self.identity interactive:YES];
}
- (void)prepareInterfaceForExtensionConfiguration {
  [self.extensionContext completeExtensionConfigurationRequest];
}
@end

extern int NSExtensionMain(int argc, const char *argv[]);
int main(int argc, const char *argv[]) { return NSExtensionMain(argc, argv); }
