package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// writeAPIError returns a JSON {"error": userMsg} to the client.
// For 5xx responses it also logs method, path and optional underlying err to the terminal.
func writeAPIError(c *gin.Context, status int, userMsg string, err error) {
	path := c.FullPath()
	if path == "" {
		path = c.Request.URL.Path
	}
	if status >= http.StatusInternalServerError {
		if err != nil {
			log.Printf("api %s %s: %v", c.Request.Method, path, err)
		} else {
			log.Printf("api %s %s: %s", c.Request.Method, path, userMsg)
		}
	} else if err != nil && status >= http.StatusBadRequest {
		log.Printf("api %s %s (%d): %v", c.Request.Method, path, status, err)
	}
	c.JSON(status, gin.H{"error": userMsg})
}

// writeBindError maps Gin binding failures to a short Persian message (no raw validator dump).
func writeBindError(c *gin.Context, err error) {
	path := c.FullPath()
	if path == "" {
		path = c.Request.URL.Path
	}
	log.Printf("api %s %s bind: %v", c.Request.Method, path, err)
	c.JSON(http.StatusBadRequest, gin.H{"error": "اطلاعات ارسالی نامعتبر است"})
}
