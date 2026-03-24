package services

import (
	"context"
	"errors"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/utils"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInactiveUser       = errors.New("user is inactive")
	ErrNotImplemented     = errors.New("not implemented")
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

// Register creates a new user and returns tokens (auto-login).
func (s *AuthService) Register(ctx context.Context, firstName, lastName, email, password, phone string) (*AuthResult, error) {
	if len(password) < 6 {
		return nil, errors.New("password too short")
	}

	adv, err := s.roleRepo.GetByCode(ctx, models.RoleCodeAdvisor)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("default advisor role is not configured; run migrations")
		}
		return nil, err
	}

	u := &models.User{
		FirstName:     firstName,
		LastName:      lastName,
		Email:         email,
		Phone:         phone,
		RoleID:        adv.ID,
		IsActive:      true,
		PlainPassword: password,
	}

	if err := s.userRepo.Create(ctx, u); err != nil {
		return nil, err
	}
	if s.permSvc != nil {
		_ = s.permSvc.SyncFromRole(ctx, u.ID, u.RoleID)
	}

	user, err := s.userRepo.FindByID(ctx, u.ID)
	if err != nil {
		return nil, err
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

// ForgotPassword is a stub for sending reset links (email integration not implemented).
func (s *AuthService) ForgotPassword(_ context.Context, _ string) error {
	return ErrNotImplemented
}

// ResetPassword is a stub for resetting passwords using a token.
func (s *AuthService) ResetPassword(_ context.Context, _ string, _ string) error {
	return ErrNotImplemented
}
