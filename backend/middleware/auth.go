package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/utils"
)

// Context keys
const (
	ContextUserIDKey = "userID"
	ContextUserRole  = "userRole"
)

// AuthMiddleware is a Gin middleware that validates JWT and injects user info into context.
// This follows the classic Middleware Pattern for cross-cutting concerns (auth).
func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid Authorization header"})
			return
		}

		claims, err := utils.ParseToken(parts[1], cfg)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}
		if claims.TokenType != "access" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token type"})
			return
		}

		c.Set(ContextUserIDKey, claims.UserID)
		c.Set(ContextUserRole, claims.Role)

		c.Next()
	}
}

// RoleMiddleware ensures the user has one of the allowed roles.
func RoleMiddleware(allowed ...models.UserRole) gin.HandlerFunc {
	allowedSet := make(map[models.UserRole]struct{}, len(allowed))
	for _, r := range allowed {
		allowedSet[r] = struct{}{}
	}

	return func(c *gin.Context) {
		roleVal, exists := c.Get(ContextUserRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing role in context"})
			return
		}

		role, ok := roleVal.(models.UserRole)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid role type"})
			return
		}

		if _, ok := allowedSet[role]; !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			return
		}

		c.Next()
	}
}

// AdminOnly is a convenience middleware for admin-only routes.
func AdminOnly() gin.HandlerFunc {
	return RoleMiddleware(models.UserRoleAdmin)
}

