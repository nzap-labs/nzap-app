import AuthenticationServices
import SwiftRs
import Tauri
import UIKit
import WebKit

class UrlArgs: Decodable {
  let url: String
}

class FileArgs: Decodable {
  let path: String
  let name: String
  let mimeType: String?
}

/// NZAP's iOS integration. Only the Rust shell calls these commands. Secrets
/// live in the Keychain through the engine itself, and background keep-alive
/// has no iOS equivalent (the app resumes its runtimes when it returns).
class NzapMobilePlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
  private var authSession: ASWebAuthenticationSession?
  private var exporter: ExportDelegate?

  // MARK: sign-in browser

  /// Google's consent page in an ASWebAuthenticationSession: a real Safari
  /// sheet over the app, so the app stays in the foreground to receive the
  /// loopback redirect. The finished page sends the browser to
  /// `nzap://auth/done`, which closes the sheet.
  @objc public func openAuthUrl(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(UrlArgs.self)
    guard let url = URL(string: args.url), url.scheme == "https" || url.host == "127.0.0.1" else {
      invoke.reject("Only https links can be opened.")
      return
    }
    DispatchQueue.main.async {
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "nzap") { _, _ in
        // Success and cancellation both end here; the engine learns the outcome
        // from its loopback listener (or its timeout / auth_cancel).
        self.authSession = nil
      }
      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      self.authSession = session
      if session.start() {
        invoke.resolve()
      } else {
        self.authSession = nil
        invoke.reject("Could not open the sign-in page.")
      }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    return self.manager.viewController?.view.window ?? ASPresentationAnchor()
  }

  // MARK: files out

  /// "Save to Files": the document exporter, copying the file the app wrote.
  @objc public func saveFile(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(FileArgs.self)
    let source = URL(fileURLWithPath: args.path)
    guard FileManager.default.fileExists(atPath: source.path) else {
      invoke.reject("That file no longer exists.")
      return
    }
    // The exporter names the file after its source; stage it under the name
    // the user should see.
    let staged = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let named = staged.appendingPathComponent(args.name)
    do {
      try FileManager.default.createDirectory(at: staged, withIntermediateDirectories: true)
      try FileManager.default.copyItem(at: source, to: named)
    } catch {
      invoke.reject("Could not prepare the file: \(error.localizedDescription)")
      return
    }
    DispatchQueue.main.async {
      let delegate = ExportDelegate { saved in
        try? FileManager.default.removeItem(at: staged)
        self.exporter = nil
        invoke.resolve(["saved": saved])
      }
      self.exporter = delegate
      let picker = UIDocumentPickerViewController(forExporting: [named], asCopy: true)
      picker.delegate = delegate
      self.manager.viewController?.present(picker, animated: true)
    }
  }

  /// The share sheet.
  @objc public func shareFile(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(FileArgs.self)
    let url = URL(fileURLWithPath: args.path)
    guard FileManager.default.fileExists(atPath: url.path) else {
      invoke.reject("That file no longer exists.")
      return
    }
    DispatchQueue.main.async {
      guard let presenter = self.manager.viewController else {
        invoke.reject("The app is not on screen.")
        return
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      // iPad presents the sheet as a popover anchored to the window centre.
      if let popover = sheet.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(
          x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
        popover.permittedArrowDirections = []
      }
      presenter.present(sheet, animated: true)
      invoke.resolve()
    }
  }

  // MARK: platform no-ops

  @objc public func setKeepAlive(_ invoke: Invoke) throws {
    invoke.resolve()
  }

  @objc public func setSystemBars(_ invoke: Invoke) throws {
    invoke.resolve()
  }

  @objc public func secretsLoad(_ invoke: Invoke) throws {
    invoke.reject("The iOS app keeps secrets in the Keychain through the engine.")
  }

  @objc public func secretSet(_ invoke: Invoke) throws {
    invoke.reject("The iOS app keeps secrets in the Keychain through the engine.")
  }

  @objc public func secretDelete(_ invoke: Invoke) throws {
    invoke.reject("The iOS app keeps secrets in the Keychain through the engine.")
  }
}

/// Reports whether the user saved or cancelled the export.
class ExportDelegate: NSObject, UIDocumentPickerDelegate {
  private let done: (Bool) -> Void

  init(done: @escaping (Bool) -> Void) {
    self.done = done
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    done(true)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    done(false)
  }
}

@_cdecl("init_plugin_nzap_mobile")
func initPlugin() -> Plugin {
  return NzapMobilePlugin()
}
