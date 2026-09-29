package license

import (
	"strings"
	"testing"
	"time"
)

func TestSignParseRoundTrip(t *testing.T) {
	pubB64, privB64, err := GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	pub, _ := DecodePublicKey(pubB64)
	priv, _ := DecodePrivateKey(privB64)
	c := Claims{ID: "L-1", Customer: "مشاوره نمونه", Plan: "pro", MaxStudents: 300, MaxUsers: 10,
		IssuedAt: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), ExpiresAt: time.Date(2027, 9, 1, 0, 0, 0, 0, time.UTC)}
	key, err := Sign(priv, c)
	if err != nil {
		t.Fatal(err)
	}
	// Copy/paste may wrap the key.
	wrapped := key[:20] + "\n" + key[20:]
	got, err := Parse(wrapped, pub)
	if err != nil {
		t.Fatal(err)
	}
	if got.Customer != c.Customer || got.MaxStudents != 300 || !got.ExpiresAt.Equal(c.ExpiresAt) {
		t.Fatalf("claims mismatch: %+v", got)
	}

	// Tampered payload must fail.
	parts := strings.Split(strings.TrimPrefix(key, prefix), ".")
	tampered := prefix + parts[0][:len(parts[0])-2] + "AA." + parts[1]
	if _, err := Parse(tampered, pub); err == nil {
		t.Fatal("tampered key accepted")
	}
	// Another vendor's key must fail.
	otherPub, _, _ := GenerateKeyPair()
	op, _ := DecodePublicKey(otherPub)
	if _, err := Parse(key, op); err != ErrSignature {
		t.Fatalf("want signature error, got %v", err)
	}
}
