package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	"github.com/soheilsshh/unifinance-momtaz/handlers"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// main sets up the HTTP server using Gin and wires dependencies (DI).
// This file lives in backend/cmd/ to keep the module root clean.
func main() {
	cfg := config.MustLoadConfig()
	db := database.MustGetDB()

	// Repositories (Repository Pattern)
	userRepo := repositories.NewUserRepository(db)
	studentRepo := repositories.NewStudentRepository(db)

	// Services (Service Layer)
	authService := services.NewAuthService(userRepo, cfg)
	studentService := services.NewStudentService(studentRepo)

	// Handlers (Controllers)
	authHandler := handlers.NewAuthHandler(authService)
	studentHandler := handlers.NewStudentHandler(studentService)

	// Gin engine
	r := gin.Default()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")

	// Public auth routes
	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/forgot-password", authHandler.ForgotPassword)
		authGroup.POST("/reset-password", authHandler.ResetPassword)
	}

	// Protected routes
	protected := api.Group("")
	protected.Use(middleware.AuthMiddleware(cfg))

	// current user endpoint
	protected.GET("/users/me", func(c *gin.Context) {
		userIDVal, _ := c.Get(middleware.ContextUserIDKey)
		roleVal, _ := c.Get(middleware.ContextUserRole)
		c.JSON(http.StatusOK, gin.H{
			"user_id": userIDVal,
			"role":    roleVal,
		})
	})

	// Protected auth routes (/auth/me, /auth/logout)
	protectedAuth := protected.Group("/auth")
	{
		protectedAuth.GET("/me", authHandler.Me)
		protectedAuth.POST("/logout", authHandler.Logout)
	}

	// Students endpoints (backing /students page)
	students := protected.Group("/students")
	{
		students.GET("", studentHandler.List)
		students.GET("/:id", studentHandler.Get)
		// Only admins and advisors can create students
		students.POST("",
			middleware.RoleMiddleware(models.UserRoleAdmin, models.UserRoleAdvisor),
			studentHandler.Create,
		)
	}

	// TODO: add other groups for /users, /plans, /payments, /payroll, /reminders, /reports, /settings.

	addr := ":8081"
	log.Printf("API server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}

