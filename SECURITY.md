# Security

Do not report credentials in public issues. Revoke any exposed SnappShop token immediately.
The SDK redacts configured credentials from its errors, but applications must also redact logs.

Catalog authentication is enabled by default. Disabling it requires an explicit unsafe opt-in.
