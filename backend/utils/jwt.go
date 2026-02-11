package utils

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/soheilsshh/unifinance-momtaz/backend/config"
	"github.com/soheilsshh/unifinance-momtaz/backend/models"
)

// JWTClaims holds the data embedded in the JWT token.
type JWTClaims struct {
	UserID uint           `json:"user_id"`
	Role   models.UserRole `json:"role"`
	jwt.RegisteredClaims
}

// GenerateToken creates a signed JWT for the given user.
func GenerateToken(user *models.User, cfg *config.Config) (string, error) {
	now := time.Now()
	expiry := now.Add(time.Duration(cfg.JWTExpiryHrs) * time.Hour)

	claims := JWTClaims{
		UserID: user.ID,
		Role:   user.Role,
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

