package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

// RecoveryWithLog recovers from panics, logs stack to the terminal, and returns a Persian 500.
func RecoveryWithLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic %s %s: %v\n%s", c.Request.Method, c.Request.URL.Path, rec, debug.Stack())
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error": "خطای داخلی سرور. لطفاً دوباره تلاش کنید.",
				})
			}
		}()
		c.Next()
	}
}
