package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
)

// JWTClaims holds the data embedded in the JWT token.
// TokenType distinguishes between "access", "refresh" and "reset" tokens.
// Role is the role code (slug). FullAccess mirrors Role.FullAccess (مدیرکل).
type JWTClaims struct {
	UserID     uint   `json:"user_id"`
	Role       string `json:"role"`
	FullAccess bool   `json:"full_access"`
	TokenType  string `json:"typ"`
	// Fingerprint binds a reset token to the password it was issued for, making it
	// single-use: once the password changes the fingerprint no longer matches.
	Fingerprint string `json:"fp,omitempty"`
	jwt.RegisteredClaims
}

// PasswordFingerprint returns a short stable fingerprint of a password hash.
func PasswordFingerprint(passwordHash string) string {
	sum := sha256.Sum256([]byte(passwordHash))
	return hex.EncodeToString(sum[:])[:16]
}

// GenerateResetToken creates a short-lived password-reset token bound to the
// user's current password hash (single-use once the password changes).
func GenerateResetToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	claims := JWTClaims{
		UserID:      user.ID,
		TokenType:   "reset",
		Fingerprint: PasswordFingerprint(user.PasswordHash),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.JWT.Issuer,
			Subject:   user.Email,
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

func roleClaimsFromUser(user *models.User) (code string, fullAccess bool) {
	if user.Role != nil {
		return user.Role.Code, user.Role.FullAccess
	}
	return "", false
}

// GenerateAccessToken creates a signed JWT access token for the given user.
func GenerateAccessToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	expiry := now.Add(time.Duration(cfg.JWT.ExpiryHours) * time.Hour)
	code, fullAccess := roleClaimsFromUser(user)

	claims := JWTClaims{
		UserID:     user.ID,
		Role:       code,
		FullAccess: fullAccess,
		TokenType:  "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.JWT.Issuer,
			Subject:   user.Email,
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

// GenerateRefreshToken creates a signed JWT refresh token for the given user.
func GenerateRefreshToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	expiry := now.Add(time.Duration(cfg.JWT.RefreshExpiryHours) * time.Hour)
	code, fullAccess := roleClaimsFromUser(user)

	claims := JWTClaims{
		UserID:     user.ID,
		Role:       code,
		FullAccess: fullAccess,
		TokenType:  "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.JWT.Issuer,
			Subject:   user.Email,
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

// GenerateToken is kept for backward compatibility and returns an access token.
func GenerateToken(user *models.User, cfg *config.Config) (string, error) {
	return GenerateAccessToken(user, cfg)
}

// ParseToken validates a JWT token string and returns the claims.
func ParseToken(tokenStr string, cfg *config.Config) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWT.Secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}

	return claims, nil
}
