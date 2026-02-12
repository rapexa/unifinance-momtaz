package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	docs "github.com/soheilsshh/unifinance-momtaz/docs"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	"github.com/soheilsshh/unifinance-momtaz/handlers"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// @title       Unifinance Momtaz API
// @version     1.0
// @description Backend API for Unifinance Momtaz dashboard
// @BasePath   /api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization

// main sets up the HTTP server using Gin and wires dependencies (DI).
// This file lives in backend/cmd/ to keep the module root clean.
func main() {
	cfg := config.MustLoadConfig()
	db := database.MustGetDB()

	// Programmatically set swagger base path
	docs.SwaggerInfo.BasePath = "/api/v1"

	// Repositories (Repository Pattern)
	userRepo := repositories.NewUserRepository(db)
	studentRepo := repositories.NewStudentRepository(db)
	planRepo := repositories.NewPlanRepository(db)
	paymentRepo := repositories.NewPaymentRepository(db)

	// Services (Service Layer)
	authService := services.NewAuthService(userRepo, cfg)
	studentService := services.NewStudentService(studentRepo)
	userService := services.NewUserService(userRepo)
	planService := services.NewPlanService(planRepo)
	paymentService := services.NewPaymentService(paymentRepo)
	dashboardService := services.NewDashboardService(db, paymentRepo)
	payrollService := services.NewPayrollService(db)
	reportService := services.NewReportService(db)
	settingsService := services.NewSettingsService(db, userService)

	// Handlers (Controllers)
	authHandler := handlers.NewAuthHandler(authService)
	studentHandler := handlers.NewStudentHandler(studentService)
	userHandler := handlers.NewUserHandler(userService)
	planHandler := handlers.NewPlanHandler(planService)
	paymentHandler := handlers.NewPaymentHandler(paymentService)
	dashboardHandler := handlers.NewDashboardHandler(dashboardService)
	payrollHandler := handlers.NewPayrollHandler(payrollService)
	reportHandler := handlers.NewReportHandler(reportService)
	settingsHandler := handlers.NewSettingsHandler(settingsService)

	// Gin engine
	r := gin.Default()

	// CORS - allow frontend dev server on port 8080
	corsConfig := cors.Config{
		AllowOrigins: []string{
			"http://localhost:8080",
			"http://127.0.0.1:8080",
		},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(corsConfig))

	// Swagger UI
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

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

	// Users endpoints (admin-only management)
	users := protected.Group("/users")
	users.Use(middleware.AdminOnly())
	{
		users.GET("", userHandler.List)
		users.GET("/:id", userHandler.Get)
		users.POST("", userHandler.Create)
		users.PUT("/:id", userHandler.Update)
		users.DELETE("/:id", userHandler.Deactivate)
	}

	// Plans endpoints (admin-only management)
	plans := protected.Group("/plans")
	plans.Use(middleware.AdminOnly())
	{
		plans.GET("", planHandler.List)
		plans.GET("/:id", planHandler.Get)
		plans.POST("", planHandler.Create)
		plans.PUT("/:id", planHandler.Update)
		plans.DELETE("/:id", planHandler.Deactivate)
	}

	// Payments endpoints (admin-only management, backing /payments page and export)
	payments := protected.Group("/payments")
	payments.Use(middleware.AdminOnly())
	{
		payments.GET("", paymentHandler.List)
		payments.GET("/export", paymentHandler.Export)
		payments.POST("", paymentHandler.Create)
		payments.GET("/:id", paymentHandler.Get)
		payments.PUT("/:id", paymentHandler.Update)
		payments.DELETE("/:id", paymentHandler.Delete)
		payments.POST("/:id/link", paymentHandler.GenerateLink)
	}

	// Dashboard endpoints (backing dashboard widgets and charts)
	dashboard := protected.Group("/dashboard")
	{
		dashboard.GET("/summary", dashboardHandler.GetSummary)
		dashboard.GET("/recent-payments", dashboardHandler.GetRecentPayments)
		dashboard.GET("/debt-alerts", dashboardHandler.GetDebtAlerts)
		dashboard.GET("/revenue-trend", dashboardHandler.GetRevenueTrend)
	}

	// Payroll endpoints (admin-only, backing /payroll page)
	payroll := protected.Group("/payroll")
	payroll.Use(middleware.AdminOnly())
	{
		payroll.GET("/summary", payrollHandler.GetSummary)
		payroll.GET("/entries", payrollHandler.ListEntries)
		payroll.GET("/schemes", payrollHandler.GetSchemes)
	}

	// Reports endpoints (admin-only, backing /reports page)
	reports := protected.Group("/reports")
	reports.Use(middleware.AdminOnly())
	{
		reports.GET("/summary", reportHandler.GetSummary)
		reports.GET("/revenue", reportHandler.GetRevenueSeries)
		reports.GET("/payroll", reportHandler.GetPayrollSeries)
		reports.GET("/debts", reportHandler.GetDebtsByAdvisor)
	}

	// Settings endpoints (backing /settings page)
	settings := protected.Group("/settings")

	// Organization & payments settings (admin only)
	orgGroup := settings.Group("/organization")
	orgGroup.Use(middleware.AdminOnly())
	{
		orgGroup.GET("", settingsHandler.GetOrganization)
		orgGroup.PUT("", settingsHandler.UpdateOrganization)
	}

	paymentsSettings := settings.Group("/payments")
	paymentsSettings.Use(middleware.AdminOnly())
	{
		paymentsSettings.GET("", settingsHandler.GetPaymentSettings)
		paymentsSettings.PUT("", settingsHandler.UpdatePaymentSettings)
	}

	// Profile, security and notifications for current user
	settings.GET("/profile", settingsHandler.GetProfile)
	settings.PUT("/profile", settingsHandler.UpdateProfile)

	security := settings.Group("/security")
	{
		security.PUT("/password", settingsHandler.ChangePassword)
		security.PUT("/2fa", settingsHandler.ToggleTwoFactor)
	}

	notifications := settings.Group("/notifications")
	{
		notifications.GET("", settingsHandler.GetNotifications)
		notifications.PUT("", settingsHandler.UpdateNotifications)
	}

	// TODO: add other groups for /reminders.

	addr := ":8081"
	log.Printf("API server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
