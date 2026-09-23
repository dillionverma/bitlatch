#import <AuthenticationServices/AuthenticationServices.h>
#import <Security/Security.h>
#include <node_api.h>
#include <string>

// All native entry points run inside the containing Electron app, not a helper
// process: AuthenticationServices uses the caller's bundle and entitlements.
static NSString *String(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) return nil;
  std::string buffer(length + 1, '\0');
  napi_get_value_string_utf8(env, value, buffer.data(), buffer.size(), &length);
  return [[NSString alloc] initWithBytes:buffer.data() length:length encoding:NSUTF8StringEncoding];
}

static void Deliver(napi_env env, napi_value callback, void *, void *data) {
  NSString *json = (__bridge_transfer NSString *)data;
  if (!env) return;
  napi_value value, receiver;
  napi_create_string_utf8(env, json.UTF8String, NAPI_AUTO_LENGTH, &value);
  napi_get_undefined(env, &receiver);
  napi_call_function(env, receiver, callback, 1, &value, nullptr);
}

// Bitwarden stores passkey byte strings as unpadded base64url.
static NSData *DataFromBase64Url(id value) {
  if (![value isKindOfClass:NSString.class]) return nil;
  NSMutableString *text = [[(NSString *)value stringByReplacingOccurrencesOfString:@"-" withString:@"+"]
    stringByReplacingOccurrencesOfString:@"_" withString:@"/"].mutableCopy;
  while (text.length % 4) [text appendString:@"="];
  return [[NSData alloc] initWithBase64EncodedString:text options:0];
}

static bool HasEntitlement(NSString *key) {
  SecTaskRef task = SecTaskCreateFromSelf(kCFAllocatorDefault);
  if (!task) return false;
  CFTypeRef value = SecTaskCopyValueForEntitlement(task, (__bridge CFStringRef)key, nullptr);
  bool result = value && CFEqual(value, kCFBooleanTrue);
  if (value) CFRelease(value);
  CFRelease(task);
  return result;
}

static napi_value Invoke(napi_env env, napi_callback_info info) {
  size_t count = 3;
  napi_value args[3], undefined;
  napi_get_undefined(env, &undefined);
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 3) { napi_throw_type_error(env, nullptr, "Invalid AutoFill call"); return nullptr; }
  NSString *operation = String(env, args[0]);
  NSString *input = String(env, args[1]);
  napi_value resource;
  napi_create_string_utf8(env, "Latch AutoFill", NAPI_AUTO_LENGTH, &resource);
  napi_threadsafe_function completion;
  if (napi_create_threadsafe_function(env, args[2], nullptr, resource, 1, 1,
      nullptr, nullptr, nullptr, Deliver, &completion) != napi_ok) return undefined;
  void (^finish)(NSDictionary *) = ^(NSDictionary *value) {
    NSData *bytes = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:bytes encoding:NSUTF8StringEncoding];
    void *data = (__bridge_retained void *)(json ?: @"{\"ok\":false}");
    if (napi_call_threadsafe_function(completion, data, napi_tsfn_nonblocking) != napi_ok)
      CFRelease(data);
    napi_release_threadsafe_function(completion, napi_tsfn_release);
  };
  dispatch_async(dispatch_get_main_queue(), ^{
    if (@available(macOS 14.0, *)) {
      if ([operation isEqualToString:@"settings"]) {
        [ASSettingsHelper openCredentialProviderAppSettingsWithCompletionHandler:^(NSError *error) {
          finish(@{@"ok": @(!error)});
        }];
        return;
      }
      NSBundle *bundle = NSBundle.mainBundle;
      NSString *group = [bundle objectForInfoDictionaryKey:@"LatchAppGroup"];
      NSURL *extension = [bundle.builtInPlugInsURL URLByAppendingPathComponent:@"LatchAutoFill.appex"];
      bool installed = extension && [NSFileManager.defaultManager fileExistsAtPath:extension.path];
      bool entitled = HasEntitlement(@"com.apple.developer.authentication-services.autofill-credential-provider");
      NSURL *container = installed && entitled && group.length
        ? [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group] : nil;
      if (!container) {
        finish(@{@"ok": @YES, @"available": @NO, @"enabled": @NO});
        return;
      }
      ASCredentialIdentityStore *store = ASCredentialIdentityStore.sharedStore;
      if ([operation isEqualToString:@"status"]) {
        [store getCredentialIdentityStoreStateWithCompletion:^(ASCredentialIdentityStoreState *state) {
          finish(@{@"ok": @YES, @"available": @YES, @"enabled": @(state.enabled), @"container": container.path});
        }];
      } else if ([operation isEqualToString:@"enable"]) {
        if (@available(macOS 15.0, *)) {
          [ASSettingsHelper requestToTurnOnCredentialProviderExtensionWithCompletionHandler:^(BOOL enabled) {
            finish(@{@"ok": @YES, @"enabled": @(enabled)});
          }];
        } else {
          [ASSettingsHelper openCredentialProviderAppSettingsWithCompletionHandler:^(NSError *error) {
            finish(@{@"ok": @(!error)});
          }];
        }
      } else if ([operation isEqualToString:@"identities"]) {
        NSArray *rows = [NSJSONSerialization JSONObjectWithData:[input dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        if (![rows isKindOfClass:NSArray.class]) { finish(@{@"ok": @NO}); return; }
        NSMutableArray *identities = [NSMutableArray array];
        for (NSDictionary *row in rows) {
          if (![row isKindOfClass:NSDictionary.class] || ![row[@"id"] isKindOfClass:NSString.class]) {
            finish(@{@"ok": @NO}); return;
          }
          if ([row[@"kind"] isEqual:@"passkey"]) {
            // Passkeys are indexed by relying party and credential ID so the system
            // sheet can list them and route allow-list requests here.
            NSData *credentialID = DataFromBase64Url(row[@"credentialId"]);
            NSData *userHandle = DataFromBase64Url(row[@"userHandle"]);
            if (![row[@"rpId"] isKindOfClass:NSString.class] || ![row[@"userName"] isKindOfClass:NSString.class] ||
                !credentialID || !userHandle) {
              finish(@{@"ok": @NO}); return;
            }
            [identities addObject:[[ASPasskeyCredentialIdentity alloc] initWithRelyingPartyIdentifier:row[@"rpId"]
              userName:row[@"userName"] credentialID:credentialID userHandle:userHandle recordIdentifier:row[@"id"]]];
            continue;
          }
          if (![row[@"url"] isKindOfClass:NSString.class] || ![row[@"username"] isKindOfClass:NSString.class]) {
            finish(@{@"ok": @NO}); return;
          }
          ASCredentialServiceIdentifier *service = [[ASCredentialServiceIdentifier alloc]
            initWithIdentifier:row[@"url"] type:ASCredentialServiceIdentifierTypeURL];
          [identities addObject:[[ASPasswordCredentialIdentity alloc] initWithServiceIdentifier:service
            user:row[@"username"] recordIdentifier:row[@"id"]]];
        }
        [store replaceCredentialIdentityEntries:identities completion:^(BOOL success, NSError *error) {
          finish(@{@"ok": @(success)});
        }];
      } else finish(@{@"ok": @NO});
    } else finish(@{@"ok": @YES, @"available": @NO, @"enabled": @NO});
  });
  return undefined;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value invoke;
  napi_create_function(env, "invoke", NAPI_AUTO_LENGTH, Invoke, nullptr, &invoke);
  napi_set_named_property(env, exports, "invoke", invoke);
  return exports;
}
NAPI_MODULE(latch_autofill, Init)
