package middleware

import (
	"github.com/gin-gonic/gin"
)

// DataScopeUserID returns nil when the user may see all rows (full_access).
// Otherwise returns the current user's ID for advisor / role-payout–scoped data.
func DataScopeUserID(c *gin.Context) *uint {
	fa, ok := c.Get(ContextUserFullAccess)
	if ok {
		if full, isBool := fa.(bool); isBool && full {
			return nil
		}
	}
	uidVal, ok := c.Get(ContextUserIDKey)
	if !ok {
		return nil
	}
	uid, ok := uidVal.(uint)
	if !ok {
		return nil
	}
	u := uid
	return &u
}
