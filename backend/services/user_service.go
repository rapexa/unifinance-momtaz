package services

import (
	"context"
	"errors"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailAlreadyExists = errors.New("email already exists")
)

// UserService encapsulates business logic for users.
type UserService struct {
	repo repositories.UserRepository
}

func NewUserService(repo repositories.UserRepository) *UserService {
	return &UserService{repo: repo}
}

// List returns paginated users based on filters.
func (s *UserService) List(ctx context.Context, limit, offset int, search, role, status string) ([]models.User, int64, error) {
	var isActive *bool
	if status != "" {
		switch strings.ToLower(status) {
		case "active":
			v := true
			isActive = &v
		case "inactive":
			v := false
			isActive = &v
		default:
			// invalid status handled at handler level; here we ignore
		}
	}

	role = strings.ToUpper(role)

	return s.repo.List(ctx, limit, offset, search, role, isActive)
}

func (s *UserService) GetByID(ctx context.Context, id uint) (*models.User, error) {
	u, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

type CreateUserParams struct {
	FirstName      string
	LastName       string
	Email          string
	Phone          string
	Role           string
	Password       string
	OrganizationID *uint
	IsActive       *bool
}

type UpdateUserParams struct {
	FirstName      *string
	LastName       *string
	Email          *string
	Phone          *string
	Role           *string
	IsActive       *bool
	OrganizationID *uint
}

func (s *UserService) Create(ctx context.Context, p CreateUserParams) (*models.User, error) {
	// Check email uniqueness
	if existing, err := s.repo.FindByEmail(ctx, p.Email); err == nil && existing != nil {
		return nil, ErrEmailAlreadyExists
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	role := models.UserRole(strings.ToUpper(p.Role))

	u := &models.User{
		FirstName:      p.FirstName,
		LastName:       p.LastName,
		Email:          p.Email,
		Phone:          p.Phone,
		Role:           role,
		OrganizationID: p.OrganizationID,
		PlainPassword:  p.Password,
		IsActive:       true,
	}
	if p.IsActive != nil {
		u.IsActive = *p.IsActive
	}

	if err := s.repo.Create(ctx, u); err != nil {
		return nil, err
	}

	return u, nil
}

func (s *UserService) Update(ctx context.Context, id uint, p UpdateUserParams) (*models.User, error) {
	u, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// If email changed, ensure uniqueness
	if p.Email != nil && *p.Email != u.Email {
		if existing, err := s.repo.FindByEmail(ctx, *p.Email); err == nil && existing != nil && existing.ID != u.ID {
			return nil, ErrEmailAlreadyExists
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		u.Email = *p.Email
	}

	if p.FirstName != nil {
		u.FirstName = *p.FirstName
	}
	if p.LastName != nil {
		u.LastName = *p.LastName
	}
	if p.Phone != nil {
		u.Phone = *p.Phone
	}
	if p.Role != nil {
		u.Role = models.UserRole(strings.ToUpper(*p.Role))
	}
	if p.IsActive != nil {
		u.IsActive = *p.IsActive
	}
	if p.OrganizationID != nil {
		u.OrganizationID = p.OrganizationID
	}

	if err := s.repo.Update(ctx, u); err != nil {
		return nil, err
	}

	return u, nil
}

// Deactivate performs a soft deactivation by setting IsActive=false.
func (s *UserService) Deactivate(ctx context.Context, id uint) error {
	u, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if !u.IsActive {
		return nil
	}
	u.IsActive = false
	return s.repo.Update(ctx, u)
}

