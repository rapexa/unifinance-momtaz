package middleware

import (
	"github.com/gin-gonic/gin"
)

// DataScopeUserID returns nil when the user may see all rows (full_access).
// Otherwise it returns the current user's ID for advisor / role-payout–scoped data.
// It fails CLOSED: if full access is not confirmed and the user id is missing or of an
// unexpected type, it returns a sentinel (user id 0) that matches no rows, rather than
// granting access to everything.
func DataScopeUserID(c *gin.Context) *uint {
	if fa, ok := c.Get(ContextUserFullAccess); ok {
		if full, isBool := fa.(bool); isBool && full {
			return nil // full access — no scoping
		}
	}
	uidVal, ok := c.Get(ContextUserIDKey)
	if !ok {
		return denyAllScope()
	}
	uid, ok := uidVal.(uint)
	if !ok {
		return denyAllScope()
	}
	u := uid
	return &u
}

// denyAllScope returns a scope pointing at user id 0, which never matches a real row.
func denyAllScope() *uint {
	z := uint(0)
	return &z
}
