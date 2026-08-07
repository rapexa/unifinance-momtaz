package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
	"github.com/soheilsshh/unifinance-momtaz/utils"
	"gorm.io/gorm"
)

// Context keys
const (
	ContextUserIDKey      = "userID"
	ContextUserRole       = "userRole"       // role code (string)
	ContextUserFullAccess = "userFullAccess" // bool
)

// AuthMiddleware is a Gin middleware that validates JWT and injects user info into context.
// It also performs a live account check: deactivated users and tokens invalidated by
// logout / password reset (via TokensValidFrom) are rejected immediately.
func AuthMiddleware(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "نشست منقضی شده است. دوباره وارد شوید."})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "نشست نامعتبر است. دوباره وارد شوید."})
			return
		}

		claims, err := utils.ParseToken(parts[1], cfg)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "نشست منقضی شده است. دوباره وارد شوید."})
			return
		}
		if claims.TokenType != "access" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "نشست نامعتبر است. دوباره وارد شوید."})
			return
		}

		// Live account check: confirm the user is still active and the token has not been
		// invalidated by a logout or password reset. Scan returns zero values for a missing
		// row, so a deleted/unknown user is rejected (fail closed).
		var acct struct {
			IsActive        bool
			TokensValidFrom *time.Time
		}
		if err := db.WithContext(c.Request.Context()).Model(&models.User{}).
			Select("is_active", "tokens_valid_from").
			Where("id = ?", claims.UserID).Scan(&acct).Error; err != nil {
			log.Printf("auth verify session: %v", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "خطا در بررسی نشست. دوباره تلاش کنید."})
			return
		}
		if !acct.IsActive {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "حساب کاربری غیرفعال است."})
			return
		}
		if acct.TokensValidFrom != nil && claims.IssuedAt != nil && claims.IssuedAt.Time.Before(*acct.TokensValidFrom) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "نشست منقضی شده است. دوباره وارد شوید."})
			return
		}

		roleCode := claims.Role
		fullAccess := claims.FullAccess
		// Legacy JWTs issued before dynamic roles (enum ADMIN only).
		if roleCode == "ADMIN" {
			fullAccess = true
			roleCode = models.RoleCodeGeneralManager
		}

		c.Set(ContextUserIDKey, claims.UserID)
		c.Set(ContextUserRole, roleCode)
		c.Set(ContextUserFullAccess, fullAccess)

		c.Next()
	}
}

// RoleMiddleware ensures the user has one of the allowed role codes.
func RoleMiddleware(allowed ...string) gin.HandlerFunc {
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, r := range allowed {
		allowedSet[r] = struct{}{}
	}

	return func(c *gin.Context) {
		roleVal, exists := c.Get(ContextUserRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست."})
			return
		}

		role, ok := roleVal.(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست."})
			return
		}

		if _, ok := allowedSet[role]; !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "شما به این بخش دسترسی ندارید."})
			return
		}

		c.Next()
	}
}

// PermissionMiddleware ensures the current user has the required permission (full-access roles have all).
func PermissionMiddleware(permService *services.PermissionService, required models.Permission) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, exists := c.Get(ContextUserIDKey)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست."})
			return
		}
		userID, ok := userIDVal.(uint)
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "دسترسی مجاز نیست."})
			return
		}
		fullAccessVal, _ := c.Get(ContextUserFullAccess)
		fullAccess, _ := fullAccessVal.(bool)

		ok, err := permService.HasPermission(c.Request.Context(), userID, fullAccess, required)
		if err != nil {
			log.Printf("permission check: %v", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "خطا در بررسی دسترسی."})
			return
		}
		if !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "شما به این بخش دسترسی ندارید."})
			return
		}
		c.Next()
	}
}
