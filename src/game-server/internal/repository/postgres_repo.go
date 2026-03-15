package repository

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"github.com/k82022603/RummiArena/game-server/internal/model"
)

const queryByID = "id = ?"

// GameRepository defines persistent game operations backed by PostgreSQL.
type GameRepository interface {
	CreateGame(ctx context.Context, game *model.Game) error
	GetGame(ctx context.Context, id string) (*model.Game, error)
	UpdateGame(ctx context.Context, game *model.Game) error

	CreateRoom(ctx context.Context, room *model.Room) error
	GetRoom(ctx context.Context, id string) (*model.Room, error)
	UpdateRoom(ctx context.Context, room *model.Room) error
	ListRooms(ctx context.Context) ([]*model.Room, error)
}

// UserRepository defines persistent user operations backed by PostgreSQL.
type UserRepository interface {
	CreateUser(ctx context.Context, user *model.User) error
	GetUserByID(ctx context.Context, id string) (*model.User, error)
	GetUserByGoogleID(ctx context.Context, googleID string) (*model.User, error)
	UpdateUser(ctx context.Context, user *model.User) error
}

// GamePlayerRepository defines persistent game-player operations.
type GamePlayerRepository interface {
	CreateGamePlayer(ctx context.Context, gp *model.GamePlayer) error
	GetGamePlayers(ctx context.Context, gameID string) ([]*model.GamePlayer, error)
	UpdateGamePlayer(ctx context.Context, gp *model.GamePlayer) error
}

// postgresGameRepo implements GameRepository.
type postgresGameRepo struct {
	db *gorm.DB
}

// NewPostgresGameRepo creates a PostgreSQL-backed GameRepository.
func NewPostgresGameRepo(db *gorm.DB) GameRepository {
	return &postgresGameRepo{db: db}
}

func (r *postgresGameRepo) CreateGame(ctx context.Context, game *model.Game) error {
	if err := r.db.WithContext(ctx).Create(game).Error; err != nil {
		return fmt.Errorf("postgres_repo: create game: %w", err)
	}
	return nil
}

func (r *postgresGameRepo) GetGame(ctx context.Context, id string) (*model.Game, error) {
	var game model.Game
	if err := r.db.WithContext(ctx).First(&game, queryByID, id).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: get game %q: %w", id, err)
	}
	return &game, nil
}

func (r *postgresGameRepo) UpdateGame(ctx context.Context, game *model.Game) error {
	if err := r.db.WithContext(ctx).Save(game).Error; err != nil {
		return fmt.Errorf("postgres_repo: update game %q: %w", game.ID, err)
	}
	return nil
}

func (r *postgresGameRepo) CreateRoom(ctx context.Context, room *model.Room) error {
	if err := r.db.WithContext(ctx).Create(room).Error; err != nil {
		return fmt.Errorf("postgres_repo: create room: %w", err)
	}
	return nil
}

func (r *postgresGameRepo) GetRoom(ctx context.Context, id string) (*model.Room, error) {
	var room model.Room
	if err := r.db.WithContext(ctx).First(&room, queryByID, id).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: get room %q: %w", id, err)
	}
	return &room, nil
}

func (r *postgresGameRepo) UpdateRoom(ctx context.Context, room *model.Room) error {
	if err := r.db.WithContext(ctx).Save(room).Error; err != nil {
		return fmt.Errorf("postgres_repo: update room %q: %w", room.ID, err)
	}
	return nil
}

func (r *postgresGameRepo) ListRooms(ctx context.Context) ([]*model.Room, error) {
	var rooms []*model.Room
	if err := r.db.WithContext(ctx).Find(&rooms).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: list rooms: %w", err)
	}
	return rooms, nil
}

// postgresUserRepo implements UserRepository.
type postgresUserRepo struct {
	db *gorm.DB
}

// NewPostgresUserRepo creates a PostgreSQL-backed UserRepository.
func NewPostgresUserRepo(db *gorm.DB) UserRepository {
	return &postgresUserRepo{db: db}
}

func (r *postgresUserRepo) CreateUser(ctx context.Context, user *model.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		return fmt.Errorf("postgres_repo: create user: %w", err)
	}
	return nil
}

func (r *postgresUserRepo) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).First(&user, queryByID, id).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: get user by id %q: %w", id, err)
	}
	return &user, nil
}

func (r *postgresUserRepo) GetUserByGoogleID(ctx context.Context, googleID string) (*model.User, error) {
	var user model.User
	if err := r.db.WithContext(ctx).Where("google_id = ?", googleID).First(&user).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: get user by google_id %q: %w", googleID, err)
	}
	return &user, nil
}

func (r *postgresUserRepo) UpdateUser(ctx context.Context, user *model.User) error {
	if err := r.db.WithContext(ctx).Save(user).Error; err != nil {
		return fmt.Errorf("postgres_repo: update user %q: %w", user.ID, err)
	}
	return nil
}

// postgresGamePlayerRepo implements GamePlayerRepository.
type postgresGamePlayerRepo struct {
	db *gorm.DB
}

// NewPostgresGamePlayerRepo creates a PostgreSQL-backed GamePlayerRepository.
func NewPostgresGamePlayerRepo(db *gorm.DB) GamePlayerRepository {
	return &postgresGamePlayerRepo{db: db}
}

func (r *postgresGamePlayerRepo) CreateGamePlayer(ctx context.Context, gp *model.GamePlayer) error {
	if err := r.db.WithContext(ctx).Create(gp).Error; err != nil {
		return fmt.Errorf("postgres_repo: create game_player: %w", err)
	}
	return nil
}

func (r *postgresGamePlayerRepo) GetGamePlayers(ctx context.Context, gameID string) ([]*model.GamePlayer, error) {
	var players []*model.GamePlayer
	if err := r.db.WithContext(ctx).Where("game_id = ?", gameID).Find(&players).Error; err != nil {
		return nil, fmt.Errorf("postgres_repo: get game_players for game %q: %w", gameID, err)
	}
	return players, nil
}

func (r *postgresGamePlayerRepo) UpdateGamePlayer(ctx context.Context, gp *model.GamePlayer) error {
	if err := r.db.WithContext(ctx).Save(gp).Error; err != nil {
		return fmt.Errorf("postgres_repo: update game_player %q: %w", gp.ID, err)
	}
	return nil
}
