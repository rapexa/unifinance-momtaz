package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/database"
	docs "github.com/soheilsshh/unifinance-momtaz/docs"
	"github.com/soheilsshh/unifinance-momtaz/handlers"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/migrations"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title       Unifinance Momtaz API
// @version     1.0
// @description Backend API for Unifinance Momtaz dashboard
// @BasePath   /api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization

// main sets up the HTTP server using Gin and wires dependencies (DI).
// Migrations (AutoMigrate + seed) run automatically on every startup — no separate migrate binary.
func main() {
	log.Println("starting: running database migrations...")
	migrations.Run()
	log.Println("starting: migrations completed, booting API server...")

	cfg := config.MustLoadConfig()
	db := database.MustGetDB()

	// Programmatically set swagger base path
	docs.SwaggerInfo.BasePath = "/api/v1"

	// Repositories (Repository Pattern)
	userRepo := repositories.NewUserRepository(db)
	permRepo := repositories.NewPermissionRepository(db)
	roleRepo := repositories.NewRoleRepository(db)
	studentRepo := repositories.NewStudentRepository(db)
	planRepo := repositories.NewPlanRepository(db)
	paymentRepo := repositories.NewPaymentRepository(db)
	schoolContractRepo := repositories.NewSchoolContractRepository(db)

	// Services (Service Layer)
	permService := services.NewPermissionService(permRepo, roleRepo)
	authService := services.NewAuthService(userRepo, roleRepo, permService, cfg)
	userService := services.NewUserService(userRepo, permService)
	roleService := services.NewRoleService(roleRepo)
	studentService := services.NewStudentService(studentRepo)
	planService := services.NewPlanService(planRepo)
	schoolContractService := services.NewSchoolContractService(schoolContractRepo)
	payrollService := services.NewPayrollService(db)
	paymentService := services.NewPaymentService(paymentRepo, db, payrollService)
	dashboardService := services.NewDashboardService(db, paymentRepo)
	reportService := services.NewReportService(db, paymentService)
	settingsService := services.NewSettingsService(db, userService)
	melipayamakService := services.NewMelipayamakService(cfg.Melipayamak.Username, cfg.Melipayamak.APIKey)
	reminderService := services.NewReminderService(db, melipayamakService)
	fiscalYearService := services.NewFiscalYearService(db)
	zarinpalService := services.NewZarinpalService(cfg.Zarinpal.MerchantID, cfg.Zarinpal.Sandbox, cfg.Zarinpal.CallbackURL)

	// Handlers (Controllers)
	authHandler := handlers.NewAuthHandler(authService)
	studentHandler := handlers.NewStudentHandler(studentService, paymentService, schoolContractService)
	schoolContractHandler := handlers.NewSchoolContractHandler(schoolContractService, studentService)
	userHandler := handlers.NewUserHandler(userService, permService)
	roleHandler := handlers.NewRoleHandler(roleService, paymentService)
	planHandler := handlers.NewPlanHandler(planService)
	paymentHandler := handlers.NewPaymentHandler(paymentService)
	dashboardHandler := handlers.NewDashboardHandler(dashboardService, paymentService)
	payrollHandler := handlers.NewPayrollHandler(payrollService)
	reportHandler := handlers.NewReportHandler(reportService)
	settingsHandler := handlers.NewSettingsHandler(settingsService, permService)
	reminderHandler := handlers.NewReminderHandler(reminderService)
	fiscalYearHandler := handlers.NewFiscalYearHandler(fiscalYearService)
	paymentGatewayHandler := handlers.NewPaymentGatewayHandler(paymentService, zarinpalService, db, cfg.FrontendURL)

	// Gin engine
	r := gin.Default()

	// CORS origins come from config.yaml (local vs production).
	corsConfig := cors.Config{
		AllowOrigins:     cfg.CORS.AllowOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
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

	// Serve uploaded files (e.g. profile avatars)
	r.Static("/uploads", "uploads")

	// ZarinPal callback – browser is redirected here by ZarinPal after payment.
	// Must be at root level (checkout.momtaz-team.ir/payment/callback).
	r.GET("/payment/callback", paymentGatewayHandler.Callback)

	api := r.Group("/api/v1")

	// Public payment endpoints – no auth required (student visits pay link)
	publicPayments := api.Group("/public/payments")
	{
		publicPayments.GET("/:id", paymentGatewayHandler.GetPublicPayment)
		publicPayments.POST("/:id/pay", paymentGatewayHandler.InitiatePayment)
	}

	// Public auth routes
	authGroup := api.Group("/auth")
	{
		// NOTE: public self-registration was removed — it created full-access مدیرکل
		// accounts without authentication. New users are created by an admin via /users.
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.Refresh)
		authGroup.POST("/forgot-password", authHandler.ForgotPassword)
		authGroup.POST("/reset-password", authHandler.ResetPassword)
	}

	// Protected routes
	protected := api.Group("")
	protected.Use(middleware.AuthMiddleware(cfg, db))

	// current user endpoint
	protected.GET("/users/me", func(c *gin.Context) {
		userIDVal, _ := c.Get(middleware.ContextUserIDKey)
		roleVal, _ := c.Get(middleware.ContextUserRole)
		fullVal, _ := c.Get(middleware.ContextUserFullAccess)
		c.JSON(http.StatusOK, gin.H{
			"user_id":     userIDVal,
			"role":        roleVal,
			"full_access": fullVal,
		})
	})

	// Protected auth routes (/auth/me, /auth/logout)
	protectedAuth := protected.Group("/auth")
	{
		protectedAuth.GET("/me", authHandler.Me)
		protectedAuth.POST("/logout", authHandler.Logout)
	}

	// RBAC: each group requires the corresponding permission (admin has all)
	// Students
	students := protected.Group("/students")
	students.Use(middleware.PermissionMiddleware(permService, models.PermStudents))
	{
		students.GET("", studentHandler.List)
		students.GET("/summary", studentHandler.Summary)
		students.GET("/schools", studentHandler.Schools)
		students.GET("/:id", studentHandler.Get)
		students.POST("", studentHandler.Create)
		students.PUT("/:id", studentHandler.Update)
		students.DELETE("/:id/permanent", studentHandler.HardDelete)
		students.DELETE("/:id", studentHandler.Delete)
	}

	// School contracts (bulk school enrollments — same STUDENTS permission)
	schoolContracts := protected.Group("/school-contracts")
	schoolContracts.Use(middleware.PermissionMiddleware(permService, models.PermStudents))
	{
		schoolContracts.GET("", schoolContractHandler.List)
		schoolContracts.GET("/:id", schoolContractHandler.Get)
		schoolContracts.POST("", schoolContractHandler.Create)
		schoolContracts.PUT("/:id", schoolContractHandler.Update)
		schoolContracts.DELETE("/:id", schoolContractHandler.Delete)
	}

	// Users (admin: full access; others only if granted USERS permission)
	users := protected.Group("/users")
	users.Use(middleware.PermissionMiddleware(permService, models.PermUsers))
	{
		users.GET("", userHandler.List)
		users.GET("/summary", userHandler.Summary)
		users.GET("/export", userHandler.Export)
		users.GET("/:id", userHandler.Get)
		users.POST("", userHandler.Create)
		users.PUT("/:id", userHandler.Update)
		users.DELETE("/:id", userHandler.Deactivate)
	}

	// Roles & compensation templates (same USERS permission)
	roles := protected.Group("/roles")
	roles.Use(middleware.PermissionMiddleware(permService, models.PermUsers))
	{
		roles.GET("", roleHandler.List)
		roles.POST("", roleHandler.Create)
		roles.GET("/:id", roleHandler.Get)
		roles.PUT("/:id", roleHandler.Update)
		roles.DELETE("/:id", roleHandler.Delete)
	}

	// Plans
	plans := protected.Group("/plans")
	plans.Use(middleware.PermissionMiddleware(permService, models.PermPlans))
	{
		plans.GET("", planHandler.List)
		plans.GET("/summary", planHandler.Summary)
		plans.GET("/:id", planHandler.Get)
		plans.POST("", planHandler.Create)
		plans.PUT("/:id", planHandler.Update)
		plans.DELETE("/:id", planHandler.Deactivate)
	}

	// Payments
	payments := protected.Group("/payments")
	payments.Use(middleware.PermissionMiddleware(permService, models.PermPayments))
	{
		payments.GET("", paymentHandler.List)
		payments.GET("/summary", paymentHandler.Summary)
		payments.GET("/export", paymentHandler.Export)
		payments.POST("", paymentHandler.Create)
		payments.GET("/:id", paymentHandler.Get)
		payments.PUT("/:id", paymentHandler.Update)
		payments.DELETE("/:id", paymentHandler.Delete)
		payments.POST("/:id/link", paymentHandler.GenerateLink)
	}

	// Dashboard: only for users with DASHBOARD permission (admin by default)
	dashboard := protected.Group("/dashboard")
	dashboard.Use(middleware.PermissionMiddleware(permService, models.PermDashboard))
	{
		dashboard.GET("/summary", dashboardHandler.GetSummary)
		dashboard.GET("/recent-payments", dashboardHandler.GetRecentPayments)
		dashboard.GET("/debt-alerts", dashboardHandler.GetDebtAlerts)
		dashboard.GET("/revenue-trend", dashboardHandler.GetRevenueTrend)
	}

	// Payroll
	payroll := protected.Group("/payroll")
	payroll.Use(middleware.PermissionMiddleware(permService, models.PermPayroll))
	{
		payroll.GET("/summary", payrollHandler.GetSummary)
		payroll.POST("/recalculate-period", payrollHandler.RecalculatePeriod)
		payroll.GET("/preview", payrollHandler.PreviewCompensation)
		payroll.GET("/users/:user_id/breakdown", payrollHandler.GetUserBreakdown)
		payroll.GET("/users/:user_id/ledger", payrollHandler.GetUserLedger)
		payroll.POST("/users/:user_id/recalculate", payrollHandler.RecalculateUser)
		payroll.GET("/advisor-ops", payrollHandler.ListAdvisorOps)
		payroll.GET("/advisor-ops/:user_id/detail", payrollHandler.GetAdvisorOpsUserDetail)
		payroll.GET("/advisor-ops/:user_id/students", payrollHandler.ListAdvisorOpsStudents)
		payroll.GET("/entries", payrollHandler.ListEntries)
		payroll.POST("/entries", payrollHandler.CreateEntry)
		payroll.GET("/entries/:id", payrollHandler.GetEntry)
		payroll.PUT("/entries/:id", payrollHandler.UpdateEntry)
		payroll.POST("/entries/:id/mark-paid", payrollHandler.MarkPaid)
		payroll.POST("/entries/:id/mark-pending", payrollHandler.MarkPending)
		payroll.GET("/schemes", payrollHandler.GetSchemes)
	}

	// Reports
	reports := protected.Group("/reports")
	reports.Use(middleware.PermissionMiddleware(permService, models.PermReports))
	{
		reports.GET("/summary", reportHandler.GetSummary)
		reports.GET("/revenue", reportHandler.GetRevenueSeries)
		reports.GET("/revenue/payments", reportHandler.GetPaidPaymentsDetail)
		reports.GET("/revenue/by-student", reportHandler.GetRevenueByStudent)
		reports.GET("/payroll", reportHandler.GetPayrollSeries)
		reports.GET("/payroll/lines", reportHandler.GetPayrollLines)
		reports.GET("/payroll/by-user", reportHandler.GetPayrollByUser)
		reports.GET("/debts", reportHandler.GetDebtsByAdvisor)
		reports.GET("/debts/students", reportHandler.GetStudentDebts)
	}

	// Settings
	settings := protected.Group("/settings")

	orgGroup := settings.Group("/organization")
	orgGroup.Use(middleware.PermissionMiddleware(permService, models.PermSettings))
	{
		orgGroup.GET("", settingsHandler.GetOrganization)
		orgGroup.PUT("", settingsHandler.UpdateOrganization)
	}

	paymentsSettings := settings.Group("/payments")
	paymentsSettings.Use(middleware.PermissionMiddleware(permService, models.PermSettings))
	{
		paymentsSettings.GET("", settingsHandler.GetPaymentSettings)
		paymentsSettings.PUT("", settingsHandler.UpdatePaymentSettings)
	}

	// Profile, security and notifications for current user
	settings.GET("/profile", settingsHandler.GetProfile)
	settings.PUT("/profile", settingsHandler.UpdateProfile)
	settings.POST("/profile/avatar", settingsHandler.UploadProfileAvatar)

	security := settings.Group("/security")
	{
		security.PUT("/password", settingsHandler.ChangePassword)
		security.PUT("/2fa", settingsHandler.ToggleTwoFactor)
	}

	notifications := settings.Group("/notifications")
	{
		notifications.GET("", settingsHandler.GetNotifications)
		notifications.GET("/count", settingsHandler.GetNotificationCount)
		notifications.PUT("", settingsHandler.UpdateNotifications)
	}

	reminders := protected.Group("/reminders")
	reminders.Use(middleware.PermissionMiddleware(permService, models.PermReminders))
	{
		reminders.GET("/rules", reminderHandler.ListRules)
		reminders.PUT("/rules", reminderHandler.ReplaceRules)
		reminders.GET("/logs", reminderHandler.ListLogs)
		reminders.POST("/run", reminderHandler.RunNow)
		reminders.GET("/payroll-due", reminderHandler.ListPayrollDue)
		reminders.GET("/payroll-logs", reminderHandler.ListPayrollLogs)
		reminders.PUT("/payday", reminderHandler.UpdatePayday)
	}

	// Fiscal year (requires SETTINGS permission)
	fiscalYears := protected.Group("/fiscal-years")
	fiscalYears.Use(middleware.PermissionMiddleware(permService, models.PermSettings))
	{
		fiscalYears.GET("", fiscalYearHandler.List)
		fiscalYears.GET("/current", fiscalYearHandler.GetCurrent)
		fiscalYears.POST("", fiscalYearHandler.Create)
		fiscalYears.PATCH("/:id", fiscalYearHandler.Update)
		fiscalYears.POST("/:id/close", fiscalYearHandler.Close)
		fiscalYears.POST("/:id/reopen", fiscalYearHandler.Reopen)
		fiscalYears.POST("/:id/restore", fiscalYearHandler.Restore)
		fiscalYears.DELETE("/:id/permanent", fiscalYearHandler.HardDelete)
	}

	// Auto scheduler: promote past-due pending payments to OVERDUE, then SMS reminders.
	go func() {
		ctx := context.Background()
		runOverdueAndReminders := func() {
			if n, err := paymentService.PromotePendingPastDueToOverdue(ctx); err != nil {
				log.Printf("promote overdue payments failed: %v", err)
			} else if n > 0 {
				log.Printf("promoted %d pending payment(s) to OVERDUE (past due_date)", n)
			}
			if _, err := reminderService.RunNow(ctx); err != nil {
				log.Printf("reminder scheduler run failed: %v", err)
			}
		}
		runOverdueAndReminders()
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			runOverdueAndReminders()
		}
	}()

	addr := cfg.Server.Addr
	log.Printf("API server listening on %s (cors origins: %v)", addr, cfg.CORS.AllowOrigins)
	if err := r.Run(addr); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
