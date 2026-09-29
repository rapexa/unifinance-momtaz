package license

// PublicKey is the vendor's Ed25519 public key (standard base64). Licenses are signed with the
// matching private key (kept by the vendor, never in this repository) using cmd/license.
// It can be overridden at build time with -ldflags "-X .../pkg/license.PublicKey=<base64>".
var PublicKey = "KuVhsJ05uCQjq+ccy8h/P5FHdAI7yK1zL36nVX037YI="

// AllowOwner lets a build run as the owner installation (گروه مشاوره ممتاز): an installation
// whose database already existed before licensing was introduced is free and unlimited.
// Customer builds (the Docker image for SaaS and on-premise) set it to "false" with
// -ldflags "-X .../pkg/license.AllowOwner=false", so they always need a license.
var AllowOwner = "true"
