package services

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/utils"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInactiveUser       = errors.New("user is inactive")
	ErrInvalidResetToken  = errors.New("reset token invalid or expired")
	ErrAdminOnly          = errors.New("admin only")
)

// AuthService implements login logic and JWT issuing.
// This is the core of the Service Layer for authentication.
type AuthService struct {
	userRepo repositories.UserRepository
	roleRepo repositories.RoleRepository
	permSvc  *PermissionService
	cfg      *config.Config
}

func NewAuthService(userRepo repositories.UserRepository, roleRepo repositories.RoleRepository, permSvc *PermissionService, cfg *config.Config) *AuthService {
	return &AuthService{
		userRepo: userRepo,
		roleRepo: roleRepo,
		permSvc:  permSvc,
		cfg:      cfg,
	}
}

type AuthTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type AuthResult struct {
	User   *models.User `json:"user"`
	Tokens AuthTokens   `json:"tokens"`
}

// Login validates credentials and returns access + refresh tokens.
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return nil, ErrInvalidCredentials
	}

	access, err := utils.GenerateAccessToken(user, s.cfg)
	if err != nil {
		return nil, err
	}
	refresh, err := utils.GenerateRefreshToken(user, s.cfg)
	if err != nil {
		return nil, err
	}

	return &AuthResult{
		User: user,
		Tokens: AuthTokens{
			AccessToken:  access,
			RefreshToken: refresh,
		},
	}, nil
}

// Refresh validates a refresh token and issues new tokens.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error) {
	claims, err := utils.ParseToken(refreshToken, s.cfg)
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	if claims.TokenType != "refresh" {
		return nil, ErrInvalidCredentials
	}

	user, err := s.userRepo.FindByID(ctx, claims.UserID)
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	access, err := utils.GenerateAccessToken(user, s.cfg)
	if err != nil {
		return nil, err
	}
	newRefresh, err := utils.GenerateRefreshToken(user, s.cfg)
	if err != nil {
		return nil, err
	}

	return &AuthResult{
		User: user,
		Tokens: AuthTokens{
			AccessToken:  access,
			RefreshToken: newRefresh,
		},
	}, nil
}

// GetByID returns a user by ID (for /me endpoint).
func (s *AuthService) GetByID(ctx context.Context, id uint) (*models.User, error) {
	return s.userRepo.FindByID(ctx, id)
}

// Logout invalidates every access token previously issued to the user by stamping
// TokensValidFrom = now. AuthMiddleware rejects tokens issued before that moment.
func (s *AuthService) Logout(ctx context.Context, userID uint) error {
	return s.userRepo.SetTokensValidFrom(ctx, userID, time.Now())
}

// ForgotPassword issues a short-lived reset token for the email (if it belongs to an
// active user) and makes it available for delivery. It never reveals whether the email
// exists, to avoid account enumeration.
func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil || user == nil || !user.IsActive {
		return nil // silently succeed — do not leak account existence
	}
	token, err := utils.GenerateResetToken(user, s.cfg)
	if err != nil {
		return err
	}
	resetURL := strings.TrimRight(s.cfg.FrontendURL, "/") + "/reset-password?token=" + token
	// No email/SMS pattern is wired for reset delivery yet, so the link is logged for an
	// admin to relay. Swap this for an email/SMS send once a channel is configured.
	log.Printf("auth: password reset link for %s -> %s", email, resetURL)
	return nil
}

// ResetPassword validates a reset token and sets a new password. The token is single-use:
// it is bound to the password hash it was issued for, so it stops working once the password changes.
func (s *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("password too short")
	}
	claims, err := utils.ParseToken(token, s.cfg)
	if err != nil || claims.TokenType != "reset" {
		return ErrInvalidResetToken
	}
	user, err := s.userRepo.FindByID(ctx, claims.UserID)
	if err != nil || user == nil {
		return ErrInvalidResetToken
	}
	if claims.Fingerprint != utils.PasswordFingerprint(user.PasswordHash) {
		return ErrInvalidResetToken // token already used or password already changed
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	// Setting TokensValidFrom = now also logs out any existing sessions after the reset.
	return s.userRepo.SetPasswordAndInvalidate(ctx, user.ID, string(hashed), time.Now())
}
