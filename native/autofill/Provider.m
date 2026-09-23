#import <AuthenticationServices/AuthenticationServices.h>
#import <AppKit/AppKit.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

// The app group stores a rotating pairing token, never a password or vault key.
// Each request uses a fresh connection and retains a secret only until fill.
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
  // Passkey writes wait on the Bitwarden CLI, which can take a few seconds.
  struct timeval timeout = {20, 0};
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

// Bitwarden stores passkey byte strings as unpadded base64url; so does the socket.
static NSString *Base64Url(NSData *data) {
  if (!data) return @"";
  NSString *text = [data base64EncodedStringWithOptions:0];
  text = [text stringByReplacingOccurrencesOfString:@"+" withString:@"-"];
  text = [text stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
  return [text stringByReplacingOccurrencesOfString:@"=" withString:@""];
}
static NSData *DataFromBase64Url(id value) {
  if (![value isKindOfClass:NSString.class]) return nil;
  NSMutableString *text = [[(NSString *)value stringByReplacingOccurrencesOfString:@"-" withString:@"+"]
    stringByReplacingOccurrencesOfString:@"_" withString:@"/"].mutableCopy;
  while (text.length % 4) [text appendString:@"="];
  return [[NSData alloc] initWithBase64EncodedString:text options:0];
}
static NSString *FailureMessage(NSDictionary *result, NSString *fallback) {
  NSString *error = [result[@"error"] isKindOfClass:NSString.class] ? result[@"error"] : nil;
  return error.length ? error : fallback;
}

@interface LatchCredentialProvider : ASCredentialProviderViewController
@property NSStackView *stack;
@property NSArray<NSString *> *urls;
@property NSArray<NSDictionary *> *items;
@property NSArray<NSDictionary *> *passkeys;
@property ASPasswordCredentialIdentity *identity;
@property ASPasskeyCredentialRequestParameters *passkeyParameters;
@property ASPasskeyCredentialRequest *passkeyRequest;
@property BOOL registering;
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
- (void)showTitle:(NSString *)heading message:(NSString *)message retry:(BOOL)retry {
  (void)self.view;
  for (NSView *view in self.stack.arrangedSubviews.copy) {
    [self.stack removeArrangedSubview:view];
    [view removeFromSuperview];
  }
  NSTextField *title = [NSTextField labelWithString:heading];
  title.font = [NSFont boldSystemFontOfSize:20];
  [self.stack addArrangedSubview:title];
  [self.stack addArrangedSubview:[NSTextField wrappingLabelWithString:message]];
  if (retry) [self.stack addArrangedSubview:[NSButton buttonWithTitle:@"Try Again" target:self action:@selector(retry:)]];
  NSButton *cancel = [NSButton buttonWithTitle:@"Cancel" target:self action:@selector(cancel:)];
  cancel.keyEquivalent = @"\e";
  [self.stack addArrangedSubview:cancel];
}
- (void)showMessage:(NSString *)message retry:(BOOL)retry {
  [self showTitle:@"AutoFill from Latch" message:message retry:retry];
}
- (void)cancelWithCode:(ASExtensionErrorCode)code {
  self.generation++;
  self.items = nil;
  self.passkeys = nil;
  [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:code userInfo:nil]];
}
- (void)cancel:(id)sender {
  [self cancelWithCode:ASExtensionErrorCodeUserCanceled];
}
- (void)retry:(id)sender {
  if (self.passkeyRequest) [self handlePasskeyRequest:self.passkeyRequest registration:self.registering];
  else if (self.passkeyParameters) [self loadPasskeys];
  else if (self.identity) [self fillIdentity:self.identity interactive:YES];
  else [self loadCredentials];
}

#pragma mark - Passwords

- (void)prepareCredentialListForServiceIdentifiers:(NSArray<ASCredentialServiceIdentifier *> *)services {
  self.identity = nil;
  self.passkeyParameters = nil;
  self.passkeyRequest = nil;
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

#pragma mark - Passkeys

/// Asks for Touch ID or the login password unless the site discourages it.
/// The app sets the UV flag from the answer and never sees the prompt itself.
- (void)verifyUserFor:(NSString *)preference reason:(NSString *)reason completion:(void (^)(BOOL verified, BOOL proceed))completion {
  if ([preference isEqualToString:ASAuthorizationPublicKeyCredentialUserVerificationPreferenceDiscouraged]) {
    completion(NO, YES);
    return;
  }
  LAContext *context = [[LAContext alloc] init];
  context.localizedCancelTitle = @"Cancel";
  [context evaluatePolicy:LAPolicyDeviceOwnerAuthentication localizedReason:reason reply:^(BOOL success, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{ completion(success, success); });
  }];
}
- (void)prepareCredentialListForServiceIdentifiers:(NSArray<ASCredentialServiceIdentifier *> *)services
                                 requestParameters:(ASPasskeyCredentialRequestParameters *)parameters {
  self.identity = nil;
  self.passkeyRequest = nil;
  self.urls = @[];
  self.passkeyParameters = parameters;
  [self loadPasskeys];
}
- (void)loadPasskeys {
  NSUInteger generation = ++self.generation;
  self.passkeys = nil;
  ASPasskeyCredentialRequestParameters *parameters = self.passkeyParameters;
  NSMutableArray *allowed = [NSMutableArray array];
  for (NSData *credentialID in parameters.allowedCredentials) {
    if (allowed.count == 64) break;
    [allowed addObject:Base64Url(credentialID)];
  }
  [self showTitle:@"Passkey from Latch" message:@"Looking for passkeys…" retry:NO];
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *result = Request(@{@"type": @"passkeys", @"rpId": parameters.relyingPartyIdentifier, @"allowed": allowed});
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != self.generation) return;
      if (![result[@"ok"] boolValue]) {
        [self showTitle:@"Passkey from Latch" message:@"Open and unlock Latch, then choose Try Again." retry:YES];
        return;
      }
      NSArray *passkeys = [result[@"value"] isKindOfClass:NSArray.class] ? result[@"value"] : @[];
      self.passkeys = passkeys;
      NSString *message = passkeys.count
        ? [NSString stringWithFormat:@"Choose a passkey for %@.", parameters.relyingPartyIdentifier]
        : [NSString stringWithFormat:@"No passkey for %@ is saved in Latch.", parameters.relyingPartyIdentifier];
      [self showTitle:@"Passkey from Latch" message:message retry:YES];
      for (NSUInteger i = 0; i < passkeys.count; i++) {
        NSDictionary *passkey = passkeys[i];
        NSButton *button = [NSButton buttonWithTitle:[NSString stringWithFormat:@"%@ — %@", passkey[@"name"], passkey[@"userName"]]
          target:self action:@selector(selectPasskey:)];
        button.tag = i;
        [self.stack insertArrangedSubview:button atIndex:self.stack.arrangedSubviews.count - 2];
      }
      self.preferredContentSize = NSMakeSize(440, MIN(700, 180 + passkeys.count * 40));
    });
  });
}
- (void)selectPasskey:(NSButton *)sender {
  if (sender.tag < 0 || (NSUInteger)sender.tag >= self.passkeys.count) return;
  NSDictionary *passkey = self.passkeys[sender.tag];
  ASPasskeyCredentialRequestParameters *parameters = self.passkeyParameters;
  [self assertPasskeyWithRecord:passkey[@"id"] credentialId:passkey[@"credentialId"] relyingParty:parameters.relyingPartyIdentifier
    clientDataHash:parameters.clientDataHash preference:parameters.userVerificationPreference];
}
- (void)assertPasskeyWithRecord:(NSString *)record credentialId:(NSString *)credentialId relyingParty:(NSString *)relyingParty
                 clientDataHash:(NSData *)clientDataHash preference:(NSString *)preference {
  NSUInteger generation = ++self.generation;
  if (![record isKindOfClass:NSString.class] || ![credentialId isKindOfClass:NSString.class] || !relyingParty.length || clientDataHash.length != 32) {
    [self cancelWithCode:ASExtensionErrorCodeCredentialIdentityNotFound];
    return;
  }
  [self showTitle:@"Passkey from Latch" message:[NSString stringWithFormat:@"Signing in to %@…", relyingParty] retry:NO];
  [self verifyUserFor:preference reason:[NSString stringWithFormat:@"sign in to %@ with a Latch passkey", relyingParty]
    completion:^(BOOL verified, BOOL proceed) {
      if (generation != self.generation) return;
      if (!proceed) { [self cancel:nil]; return; }
      NSDictionary *request = @{@"type": @"assert", @"id": record, @"rpId": relyingParty, @"credentialId": credentialId,
        @"clientDataHash": Base64Url(clientDataHash), @"userVerified": @(verified)};
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSDictionary *result = Request(request);
        dispatch_async(dispatch_get_main_queue(), ^{
          if (generation != self.generation) return;
          NSDictionary *value = [result[@"value"] isKindOfClass:NSDictionary.class] ? result[@"value"] : nil;
          NSData *signature = DataFromBase64Url(value[@"signature"]);
          NSData *authenticatorData = DataFromBase64Url(value[@"authenticatorData"]);
          NSData *credentialID = DataFromBase64Url(value[@"credentialId"]);
          NSData *userHandle = DataFromBase64Url(value[@"userHandle"]) ?: [NSData data];
          if (![result[@"ok"] boolValue] || !signature.length || !authenticatorData.length || !credentialID.length) {
            [self showTitle:@"Passkey from Latch" message:FailureMessage(result, @"Open and unlock Latch, then try again.") retry:YES];
            return;
          }
          ASPasskeyAssertionCredential *credential = [[ASPasskeyAssertionCredential alloc] initWithUserHandle:userHandle
            relyingParty:relyingParty signature:signature clientDataHash:clientDataHash authenticatorData:authenticatorData credentialID:credentialID];
          self.passkeys = nil;
          [self.extensionContext completeAssertionRequestWithSelectedPasskeyCredential:credential completionHandler:nil];
        });
      });
    }];
}
// macOS routes registration and assertion through different entry points; the
// request type enum that says which is macOS 15 only, so the entry point decides.
- (void)handlePasskeyRequest:(ASPasskeyCredentialRequest *)request registration:(BOOL)registration {
  ASPasskeyCredentialIdentity *identity = (ASPasskeyCredentialIdentity *)request.credentialIdentity;
  if (![identity isKindOfClass:ASPasskeyCredentialIdentity.class]) {
    [self cancelWithCode:ASExtensionErrorCodeCredentialIdentityNotFound];
    return;
  }
  if (registration) {
    [self registerPasskey:request identity:identity];
    return;
  }
  [self assertPasskeyWithRecord:identity.recordIdentifier credentialId:Base64Url(identity.credentialID)
    relyingParty:identity.relyingPartyIdentifier clientDataHash:request.clientDataHash preference:request.userVerificationPreference];
}
- (void)prepareInterfaceForPasskeyRegistration:(id<ASCredentialRequest>)registrationRequest {
  if (![registrationRequest isKindOfClass:ASPasskeyCredentialRequest.class]) { [self cancel:nil]; return; }
  self.identity = nil;
  self.passkeyParameters = nil;
  self.passkeyRequest = (ASPasskeyCredentialRequest *)registrationRequest;
  self.registering = YES;
  [self handlePasskeyRequest:self.passkeyRequest registration:YES];
}
- (void)registerPasskey:(ASPasskeyCredentialRequest *)request identity:(ASPasskeyCredentialIdentity *)identity {
  self.generation++;
  NSString *relyingParty = identity.relyingPartyIdentifier;
  [self showTitle:@"Save a passkey in Latch"
    message:[NSString stringWithFormat:@"Create a passkey for %@ as %@? It is stored in your Bitwarden vault.", relyingParty, identity.userName]
    retry:NO];
  NSButton *save = [NSButton buttonWithTitle:@"Save Passkey" target:self action:@selector(confirmRegistration:)];
  save.keyEquivalent = @"\r";
  [self.stack insertArrangedSubview:save atIndex:self.stack.arrangedSubviews.count - 1];
  self.preferredContentSize = NSMakeSize(440, 220);
}
- (void)confirmRegistration:(id)sender {
  ASPasskeyCredentialRequest *request = self.passkeyRequest;
  ASPasskeyCredentialIdentity *identity = (ASPasskeyCredentialIdentity *)request.credentialIdentity;
  if (![identity isKindOfClass:ASPasskeyCredentialIdentity.class] || request.clientDataHash.length != 32) {
    [self cancelWithCode:ASExtensionErrorCodeFailed];
    return;
  }
  NSUInteger generation = ++self.generation;
  NSString *relyingParty = identity.relyingPartyIdentifier;
  NSMutableArray *excluded = [NSMutableArray array];
  if (@available(macOS 15.0, *)) {
    for (ASAuthorizationPlatformPublicKeyCredentialDescriptor *descriptor in request.excludedCredentials) {
      if (excluded.count == 64) break;
      [excluded addObject:Base64Url(descriptor.credentialID)];
    }
  }
  NSMutableArray *algorithms = [NSMutableArray array];
  for (NSNumber *algorithm in request.supportedAlgorithms) {
    if (algorithms.count == 32) break;
    [algorithms addObject:algorithm];
  }
  [self showTitle:@"Save a passkey in Latch" message:[NSString stringWithFormat:@"Creating a passkey for %@…", relyingParty] retry:NO];
  [self verifyUserFor:request.userVerificationPreference reason:[NSString stringWithFormat:@"create a passkey for %@ in Latch", relyingParty]
    completion:^(BOOL verified, BOOL proceed) {
      if (generation != self.generation) return;
      if (!proceed) { [self cancel:nil]; return; }
      NSDictionary *payload = @{@"type": @"register", @"rpId": relyingParty, @"userName": identity.userName ?: @"",
        @"userHandle": Base64Url(identity.userHandle), @"clientDataHash": Base64Url(request.clientDataHash),
        @"algorithms": algorithms, @"excluded": excluded, @"userVerified": @(verified)};
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSDictionary *result = Request(payload);
        dispatch_async(dispatch_get_main_queue(), ^{
          if (generation != self.generation) return;
          NSDictionary *value = [result[@"value"] isKindOfClass:NSDictionary.class] ? result[@"value"] : nil;
          NSData *credentialID = DataFromBase64Url(value[@"credentialId"]);
          NSData *attestation = DataFromBase64Url(value[@"attestationObject"]);
          if (![result[@"ok"] boolValue] || !credentialID.length || !attestation.length) {
            [self showTitle:@"Save a passkey in Latch" message:FailureMessage(result, @"Open and unlock Latch, then try again.") retry:YES];
            return;
          }
          ASPasskeyRegistrationCredential *credential = [[ASPasskeyRegistrationCredential alloc] initWithRelyingParty:relyingParty
            clientDataHash:request.clientDataHash credentialID:credentialID attestationObject:attestation];
          [self.extensionContext completeRegistrationRequestWithSelectedPasskeyCredential:credential completionHandler:nil];
        });
      });
    }];
}

#pragma mark - Routing

- (void)provideCredentialWithoutUserInteractionForRequest:(id<ASCredentialRequest>)request {
  if ([request isKindOfClass:ASPasskeyCredentialRequest.class]) {
    // Verification is a prompt, so passkeys always take the interactive path.
    [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeUserInteractionRequired userInfo:nil]];
    return;
  }
  if (![request isKindOfClass:ASPasswordCredentialRequest.class]) {
    [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:ASExtensionErrorDomain code:ASExtensionErrorCodeFailed userInfo:nil]];
    return;
  }
  [self fillIdentity:(ASPasswordCredentialIdentity *)request.credentialIdentity interactive:NO];
}
- (void)prepareInterfaceToProvideCredentialForRequest:(id<ASCredentialRequest>)request {
  if ([request isKindOfClass:ASPasskeyCredentialRequest.class]) {
    self.identity = nil;
    self.passkeyParameters = nil;
    self.passkeyRequest = (ASPasskeyCredentialRequest *)request;
    self.registering = NO;
    [self handlePasskeyRequest:self.passkeyRequest registration:NO];
    return;
  }
  if (![request isKindOfClass:ASPasswordCredentialRequest.class]) { [self cancel:nil]; return; }
  self.passkeyRequest = nil;
  self.passkeyParameters = nil;
  self.identity = (ASPasswordCredentialIdentity *)request.credentialIdentity;
  [self fillIdentity:self.identity interactive:YES];
}
- (void)prepareInterfaceForExtensionConfiguration {
  [self.extensionContext completeExtensionConfigurationRequest];
}
@end

extern int NSExtensionMain(int argc, const char *argv[]);
int main(int argc, const char *argv[]) { return NSExtensionMain(argc, argv); }
