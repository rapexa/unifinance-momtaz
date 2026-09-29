package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// readOnlyAllowed lists write endpoints that stay open while the subscription is inactive,
// so the customer can still renew (paste a key) and manage their own account.
var readOnlyAllowed = []string{
	"/api/v1/license",
	"/api/v1/settings/profile",
	"/api/v1/settings/security/",
}

// LicenseGuard blocks writes when the subscription is expired/missing (read-only mode) and
// enforces the plan's student and user limits. Reads always pass so data stays visible.
func LicenseGuard(lic *services.LicenseService) gin.HandlerFunc {
	return func(c *gin.Context) {
		m := c.Request.Method
		if lic == nil || !lic.Enabled() || m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions {
			c.Next()
			return
		}
		ctx := c.Request.Context()
		path := c.Request.URL.Path
		for _, p := range readOnlyAllowed {
			if strings.HasPrefix(path, p) {
				c.Next()
				return
			}
		}

		var err error
		switch {
		case m == http.MethodPost && c.FullPath() == "/api/v1/students":
			err = lic.CheckCanCreateStudent(ctx)
		case m == http.MethodPost && c.FullPath() == "/api/v1/users":
			err = lic.CheckCanCreateUser(ctx)
		case lic.Status(ctx).ReadOnly:
			err = services.ErrLicenseReadOnly
		}
		if err != nil {
			code := "LICENSE_READ_ONLY"
			if err != services.ErrLicenseReadOnly {
				code = "LICENSE_LIMIT"
			}
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{"error": err.Error(), "code": code})
			return
		}
		c.Next()
		if c.Writer.Status() < 300 {
			lic.Refresh() // student/user counts may have changed
		}
	}
}
