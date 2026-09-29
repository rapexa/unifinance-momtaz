package handlers

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// SPAHandler serves a built frontend (Vite dist) from dir: existing files as-is, and
// index.html for every other non-API path so client-side routes work on reload.
func SPAHandler(dir string) gin.HandlerFunc {
	root, _ := filepath.Abs(dir)
	index := filepath.Join(root, "index.html")
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/swagger/") || strings.HasPrefix(p, "/uploads/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "مسیر یافت نشد"})
			return
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.JSON(http.StatusNotFound, gin.H{"error": "مسیر یافت نشد"})
			return
		}
		// path.Clean on a rooted path never climbs above "/", so the join stays inside root.
		file := filepath.Join(root, filepath.FromSlash(path.Clean("/"+p)))
		if st, err := os.Stat(file); err == nil && !st.IsDir() {
			if strings.HasPrefix(p, "/assets/") {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
			}
			c.File(file)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.File(index)
	}
}
