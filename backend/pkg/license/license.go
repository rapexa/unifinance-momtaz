// Package license signs and verifies customer license keys.
//
// A key is "UF1.<payload>.<signature>" where payload is base64url JSON Claims and the
// signature is Ed25519 over the payload. The vendor keeps the private key; the matching public
// key is compiled in (vendor_key.go, overridable with -ldflags -X ...PublicKey=<base64>).
//
// Every installation needs a license, except the owner installation (see AllowOwner).
package license

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const prefix = "UF1."

var (
	ErrMalformed = errors.New("کلید لایسنس نامعتبر است")
	ErrSignature = errors.New("امضای کلید لایسنس معتبر نیست")
	ErrNoKey     = errors.New("کلید عمومی لایسنس در این نسخه تعریف نشده است")
)

// Claims describes what a customer bought.
type Claims struct {
	ID       string `json:"id"`
	Customer string `json:"customer"`
	// Plan is a free-form plan code (e.g. basic, pro, enterprise, onprem).
	Plan string `json:"plan"`
	// MaxStudents / MaxUsers limit active students and active users; 0 = unlimited.
	MaxStudents int       `json:"max_students"`
	MaxUsers    int       `json:"max_users"`
	IssuedAt    time.Time `json:"iat"`
	ExpiresAt   time.Time `json:"exp"`
	// Domains is informational (where the customer runs the app).
	Domains []string `json:"domains,omitempty"`
}

// Enabled reports whether a public key was compiled in.
func Enabled() bool { return strings.TrimSpace(PublicKey) != "" }

// OwnerAllowed reports whether this build may run as the owner installation.
func OwnerAllowed() bool { return strings.TrimSpace(strings.ToLower(AllowOwner)) == "true" }

// CompiledPublicKey decodes PublicKey.
func CompiledPublicKey() (ed25519.PublicKey, error) {
	if !Enabled() {
		return nil, ErrNoKey
	}
	return DecodePublicKey(PublicKey)
}

// DecodePublicKey decodes a standard-base64 Ed25519 public key.
func DecodePublicKey(b64 string) (ed25519.PublicKey, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil || len(raw) != ed25519.PublicKeySize {
		return nil, errors.New("کلید عمومی نامعتبر است")
	}
	return ed25519.PublicKey(raw), nil
}

// DecodePrivateKey decodes a standard-base64 Ed25519 private key.
func DecodePrivateKey(b64 string) (ed25519.PrivateKey, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		return nil, errors.New("کلید خصوصی نامعتبر است")
	}
	return ed25519.PrivateKey(raw), nil
}

// GenerateKeyPair returns a new key pair as standard base64 strings.
func GenerateKeyPair() (pub, priv string, err error) {
	p, k, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(p), base64.StdEncoding.EncodeToString(k), nil
}

// Sign produces a license key for the claims.
func Sign(priv ed25519.PrivateKey, c Claims) (string, error) {
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	p := base64.RawURLEncoding.EncodeToString(payload)
	sig := ed25519.Sign(priv, []byte(p))
	return prefix + p + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// Parse verifies a key against pub and returns its claims (expiry is not checked here).
func Parse(key string, pub ed25519.PublicKey) (*Claims, error) {
	key = strings.Join(strings.Fields(key), "") // tolerate line breaks from copy/paste
	if !strings.HasPrefix(key, prefix) {
		return nil, ErrMalformed
	}
	parts := strings.Split(strings.TrimPrefix(key, prefix), ".")
	if len(parts) != 2 {
		return nil, ErrMalformed
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrMalformed
	}
	if !ed25519.Verify(pub, []byte(parts[0]), sig) {
		return nil, ErrSignature
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, ErrMalformed
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, ErrMalformed
	}
	if c.ExpiresAt.IsZero() {
		return nil, ErrMalformed
	}
	return &c, nil
}
