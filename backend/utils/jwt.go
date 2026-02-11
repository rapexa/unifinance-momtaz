package utils

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
)

// JWTClaims holds the data embedded in the JWT token.
// TokenType distinguishes between "access" and "refresh" tokens.
type JWTClaims struct {
	UserID    uint            `json:"user_id"`
	Role      models.UserRole `json:"role"`
	TokenType string          `json:"typ"`
	jwt.RegisteredClaims
}

// GenerateAccessToken creates a signed JWT access token for the given user.
func GenerateAccessToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	expiry := now.Add(time.Duration(cfg.JWTExpiryHrs) * time.Hour)

	claims := JWTClaims{
		UserID:    user.ID,
		Role:      user.Role,
		TokenType: "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.JWTIssuer,
			Subject:   user.Email,
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}

// GenerateRefreshToken creates a signed JWT refresh token for the given user.
func GenerateRefreshToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	expiry := now.Add(time.Duration(cfg.JWTRefreshExpiryHrs) * time.Hour)

	claims := JWTClaims{
		UserID:    user.ID,
		Role:      user.Role,
		TokenType: "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.JWTIssuer,
			Subject:   user.Email,
			ExpiresAt: jwt.NewNumericDate(expiry),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}

// GenerateToken is kept for backward compatibility and returns an access token.
func GenerateToken(user *models.User, cfg *config.Config) (string, error) {
	return GenerateAccessToken(user, cfg)
}

// ParseToken validates a JWT token string and returns the claims.
func ParseToken(tokenStr string, cfg *config.Config) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWTSecret), nil
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

