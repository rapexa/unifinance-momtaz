package services

import (
	"context"
	"errors"

	"github.com/soheilsshh/unifinance-momtaz/backend/config"
	"github.com/soheilsshh/unifinance-momtaz/backend/models"
	"github.com/soheilsshh/unifinance-momtaz/backend/repositories"
	"github.com/soheilsshh/unifinance-momtaz/backend/utils"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInactiveUser       = errors.New("user is inactive")
)

// AuthService implements login logic and JWT issuing.
// This is the core of the Service Layer for authentication.
type AuthService struct {
	userRepo repositories.UserRepository
	cfg      *config.Config
}

func NewAuthService(userRepo repositories.UserRepository, cfg *config.Config) *AuthService {
	return &AuthService{
		userRepo: userRepo,
		cfg:      cfg,
	}
}

type AuthResult struct {
	User  *models.User
	Token string
}

// Login validates credentials and returns JWT token.
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	user, err := s.userRepo.FindByEmail(ctx, email)
	if err != nil {
		// Hide user existence details behind generic error
		return nil, ErrInvalidCredentials
	}

	if !user.IsActive {
		return nil, ErrInactiveUser
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := utils.GenerateToken(user, s.cfg)
	if err != nil {
		return nil, err
	}

	return &AuthResult{
		User:  user,
		Token: token,
	}, nil
}

