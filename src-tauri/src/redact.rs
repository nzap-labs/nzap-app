//! Keep secrets out of the diagnostics log, which users share from their
//! phones. Error messages can carry URLs (a runtime-proxy URL holds its token
//! as a query parameter) or response bodies; every log line passes through
//! [`redact`] before it is written.

const HIDDEN: &str = "[redacted]";

/// Parameter / field names whose values are secrets.
const SECRET_NAMES: &[&str] = &[
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "colab-runtime-proxy-token",
    "code",
    "code_verifier",
    "client_secret",
    "password",
];

/// Google credential shapes that can appear anywhere: access tokens
/// (`ya29.…`) and refresh tokens (`1//…`).
const SECRET_PREFIXES: &[&str] = &["ya29.", "1//"];

fn is_secret_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "._~+/%-=".contains(c)
}

/// Replace secret values in `line` with `[redacted]`.
pub fn redact(line: &str) -> String {
    let mut out = redact_bearer(line);
    for name in SECRET_NAMES {
        out = redact_named(&out, name);
    }
    for prefix in SECRET_PREFIXES {
        out = redact_prefixed(&out, prefix);
    }
    out
}

/// `Bearer <token>` (any case).
fn redact_bearer(line: &str) -> String {
    let lower = line.to_ascii_lowercase();
    let mut out = String::with_capacity(line.len());
    let mut last = 0;
    let mut search = 0;
    while let Some(found) = lower[search..].find("bearer ") {
        let start = search + found + "bearer ".len();
        let end = line[start..].find(|c| !is_secret_char(c)).map_or(line.len(), |i| start + i);
        if end > start {
            out.push_str(&line[last..start]);
            out.push_str(HIDDEN);
            last = end;
        }
        search = end.max(start);
    }
    out.push_str(&line[last..]);
    out
}

/// `name=value`, `name: value`, `"name":"value"` and `"name": "value"`.
fn redact_named(line: &str, name: &str) -> String {
    let lower = line.to_ascii_lowercase();
    let mut out = String::with_capacity(line.len());
    let mut last = 0;
    let mut search = 0;
    while let Some(found) = lower[search..].find(name) {
        let at = search + found;
        let after_name = at + name.len();
        search = after_name;
        // Whole names only: `code` must not match inside `encode=`.
        let before = lower[..at].chars().next_back();
        if before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        let rest = &line[after_name..];
        let separator =
            ["\": \"", "\":\"", "=", ": ", ":"].iter().find(|sep| rest.starts_with(**sep));
        let Some(separator) = separator else { continue };
        let start = after_name + separator.len();
        let end = line[start..].find(|c| !is_secret_char(c)).map_or(line.len(), |i| start + i);
        if end > start {
            out.push_str(&line[last..start]);
            out.push_str(HIDDEN);
            last = end;
            search = end;
        }
    }
    out.push_str(&line[last..]);
    out
}

/// A secret recognised by its shape.
fn redact_prefixed(line: &str, prefix: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut last = 0;
    let mut search = 0;
    while let Some(found) = line[search..].find(prefix) {
        let start = search + found;
        let end = line[start..].find(|c| !is_secret_char(c)).map_or(line.len(), |i| start + i);
        // Short matches (`1//` in a path) are not credentials.
        if end - start >= prefix.len() + 16 {
            out.push_str(&line[last..start]);
            out.push_str(HIDDEN);
            last = end;
        }
        search = end.max(start + prefix.len());
    }
    out.push_str(&line[last..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_parameters_and_headers() {
        let line = "error sending request for url (https://8080-m-s-abc.prod.colab.dev/api/contents?authuser=0&colab-runtime-proxy-token=AbC.12-xyz)";
        let clean = redact(line);
        assert!(!clean.contains("AbC.12-xyz"), "{clean}");
        assert!(clean.contains("authuser=0"));
        assert!(clean.contains("colab-runtime-proxy-token=[redacted])"));

        assert_eq!(redact("Authorization: Bearer ya29.a0AfH6"), "Authorization: Bearer [redacted]");
        assert_eq!(
            redact("X-Colab-Runtime-Proxy-Token: secret1"),
            "X-Colab-Runtime-Proxy-Token: [redacted]"
        );
    }

    #[test]
    fn json_bodies() {
        let body =
            r#"{"access_token": "ya29.zzz", "refresh_token":"1//0gAbc", "expires_in": 3599}"#;
        let clean = redact(body);
        assert!(!clean.contains("zzz") && !clean.contains("0gAbc"), "{clean}");
        assert!(clean.contains(r#""expires_in": 3599"#));
    }

    #[test]
    fn credential_shapes_anywhere() {
        let access = format!("token was ya29.{}", "a".repeat(40));
        assert_eq!(redact(&access), "token was [redacted]");
        let refresh = format!("got 1//{} back", "0g".repeat(20));
        assert_eq!(redact(&refresh), "got [redacted] back");
        // Short look-alikes stay.
        assert_eq!(redact("path /content/1//x"), "path /content/1//x");
    }

    #[test]
    fn ordinary_lines_are_untouched() {
        for line in [
            "NZAP 0.1.0 started on android (aarch64)",
            "Runtime box is ready (T4)",
            "encode=utf-8 decoder: fine",
            "exit code 0",
        ] {
            assert_eq!(redact(line), line);
        }
        // `code` as a parameter name is the OAuth authorization code.
        assert_eq!(
            redact("GET /callback?code=4/0Ab&state=x"),
            "GET /callback?code=[redacted]&state=x"
        );
    }
}
